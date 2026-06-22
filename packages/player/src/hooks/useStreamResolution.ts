import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';

import { AudioSource } from '@nuclearplayer/hifi';
import type { TFunction } from '@nuclearplayer/i18n';
import { useTranslation } from '@nuclearplayer/i18n';
import type { QueueItem, StreamCandidate, Track } from '@nuclearplayer/model';

import { streamingHost } from '../services/streamingHost';
import { useBlockStore } from '../stores/blockStore';
import { useQueueStore } from '../stores/queueStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSoundStore } from '../stores/soundStore';

let activeController: AbortController | null = null;
let cachedStreamServerPort: number | null = null;

const getStreamServerPort = async (): Promise<number> => {
  if (cachedStreamServerPort === null) {
    cachedStreamServerPort = await invoke<number>('stream_server_port');
  }
  return cachedStreamServerPort;
};

// Encode the URL in base64 and proxy through the local streaming server to bypass CORS
// Check packages/player/src-tauri/src/stream_server.rs to see how this works
const proxyStreamUrl = (url: string, port: number): string => {
  const encoded = btoa(url)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `http://127.0.0.1:${port}/stream/${encoded}`;
};

const isFmp4Stream = (stream: StreamCandidate['stream']): boolean => {
  if (!stream) {
    return false;
  }

  return (
    stream.container === 'm4a' ||
    stream.mimeType?.includes('audio/mp4') === true
  );
};

const buildAudioSource = async (
  candidate: StreamCandidate,
): Promise<AudioSource> => {
  const { stream } = candidate;
  if (!stream) {
    return { url: candidate.id, protocol: 'http' };
  }

  if (stream.protocol === 'hls') {
    return { url: stream.url, protocol: 'hls' };
  }

  const port = await getStreamServerPort();
  const proxyUrl = proxyStreamUrl(stream.url, port);

  const durationMs = stream.durationMs ?? candidate.durationMs;
  if (isFmp4Stream(stream) && durationMs) {
    return {
      url: proxyUrl,
      protocol: 'mse',
      durationSeconds: durationMs / 1000,
      codec: stream.codec,
    };
  }

  return { url: proxyUrl, protocol: stream.protocol };
};

const setItemError = (itemId: string, errorKey: string, t: TFunction): void => {
  useQueueStore.getState().updateItemState(itemId, {
    status: 'error',
    error: t(errorKey),
  });
};

const updateItemCandidates = (
  item: QueueItem,
  candidates: StreamCandidate[],
): void => {
  useQueueStore.getState().updateItemState(item.id, {
    track: { ...item.track, streamCandidates: candidates },
  });
};

const haveCandidatesGoneStale = (candidates: StreamCandidate[]): boolean => {
  const expiryMs = useSettingsStore
    .getState()
    .getValue('playback.streamExpiryMs') as number;
  const now = Date.now();

  return candidates.some((candidate) => {
    if (!candidate.lastResolvedAtIso) {
      return false;
    }
    const resolvedAt = new Date(candidate.lastResolvedAtIso).getTime();
    return now - resolvedAt > expiryMs;
  });
};

const resolveCandidates = async (
  track: Track,
): Promise<StreamCandidate[] | undefined> => {
  if (
    track.streamCandidates?.length &&
    !haveCandidatesGoneStale(track.streamCandidates)
  ) {
    return track.streamCandidates;
  }

  const result = await streamingHost.resolveCandidatesForTrack(track);
  return result.success ? result.candidates : undefined;
};

const tryResolveNextCandidate = async (
  candidates: StreamCandidate[],
): Promise<
  { resolved: StreamCandidate; updated: StreamCandidate[] } | undefined
> => {
  const candidate = candidates.find((c) => !c.failed);
  if (!candidate) {
    return undefined;
  }

  if (candidate.stream) {
    return { resolved: candidate, updated: candidates };
  }

  const resolved = await streamingHost.resolveStreamForCandidate(candidate);
  if (!resolved) {
    return undefined;
  }

  const updated = candidates.map((c) => (c.id === resolved.id ? resolved : c));
  return { resolved, updated };
};

const resolveStreamWithFallback = async (
  candidates: StreamCandidate[],
  item: QueueItem,
  signal: AbortSignal,
): Promise<StreamCandidate | undefined> => {
  const tryNext = async (
    remaining: StreamCandidate[],
  ): Promise<StreamCandidate | undefined> => {
    if (signal.aborted) {
      return undefined;
    }

    const result = await tryResolveNextCandidate(remaining);
    if (!result) {
      return undefined;
    }

    updateItemCandidates(item, result.updated);

    if (result.resolved.stream && !result.resolved.failed) {
      return result.resolved;
    }

    return tryNext(result.updated);
  };

  return tryNext(candidates);
};

const resolveStream = async (
  item: QueueItem,
  t: TFunction,
  autoPlay: boolean,
): Promise<void> => {
  activeController?.abort();
  activeController = new AbortController();
  const { signal } = activeController;

  const { updateItemState } = useQueueStore.getState();
  const { setSrc, play, stop } = useSoundStore.getState();

  if (autoPlay) {
    stop();
  }
  updateItemState(item.id, { status: 'loading', error: undefined });

  const candidates = await resolveCandidates(item.track);
  if (signal.aborted) {
    return;
  }
  if (!candidates) {
    setItemError(item.id, 'errors.noCandidatesFound', t);
    return;
  }

  updateItemCandidates(item, candidates);

  const resolvedCandidate = await resolveStreamWithFallback(
    candidates,
    item,
    signal,
  );
  if (signal.aborted) {
    return;
  }
  if (!resolvedCandidate?.stream) {
    setItemError(item.id, 'errors.allCandidatesFailed', t);
    return;
  }

  const audioSource = await buildAudioSource(resolvedCandidate);
  setSrc(audioSource);
  if (autoPlay) {
    play();
  }
};

export const reResolveCurrentTrack = async (t: TFunction): Promise<void> => {
  const currentItem = useQueueStore.getState().getCurrentItem();
  if (!currentItem) {
    return;
  }

  const { stop, setSrc } = useSoundStore.getState();
  stop();

  activeController?.abort();
  activeController = new AbortController();
  const { signal } = activeController;

  useQueueStore
    .getState()
    .updateItemState(currentItem.id, { status: 'loading', error: undefined });

  // Clear cached stream URLs so resolveStreamForCandidate fetches fresh signed URLs
  const freshCandidates = (currentItem.track.streamCandidates ?? []).map(
    (c) => ({
      ...c,
      stream: undefined as unknown as typeof c.stream,
      failed: false,
    }),
  );
  updateItemCandidates(currentItem, freshCandidates);

  const freshItem = {
    ...currentItem,
    track: { ...currentItem.track, streamCandidates: freshCandidates },
  };

  const resolvedCandidate = await resolveStreamWithFallback(
    freshCandidates,
    freshItem,
    signal,
  );
  if (signal.aborted) {
    return;
  }
  if (!resolvedCandidate?.stream) {
    setItemError(currentItem.id, 'errors.allCandidatesFailed', t);
    return;
  }

  const audioSource = await buildAudioSource(resolvedCandidate);
  if (signal.aborted) {
    return;
  }
  setSrc(audioSource);
  // Caller (SoundProvider) handles play + seek via handleCanPlay
};

export const useStreamResolution = (): void => {
  const { t } = useTranslation('streaming');
  const currentItemIdRef = useRef<string | null>(null);
  const isFirstResolutionRef = useRef(true);
  const consecutiveSkipsRef = useRef(0);

  useEffect(() => {
    const onCurrentItemChanged = (currentItem: QueueItem | undefined): void => {
      if (!currentItem || currentItem.id === currentItemIdRef.current) {
        return;
      }

      const artists = currentItem.track.artists || [];
      const tags = currentItem.track.tags || [];
      const hasBlockedArtist = artists.some((a) =>
        useBlockStore.getState().isArtistBlocked(a.name),
      );
      const hasBlockedGenre = tags.some((tag) =>
        useBlockStore.getState().isGenreBlocked(tag),
      );

      if (hasBlockedArtist || hasBlockedGenre) {
        consecutiveSkipsRef.current++;
        const queueLength = useQueueStore.getState().items.length;
        if (consecutiveSkipsRef.current >= queueLength) {
          consecutiveSkipsRef.current = 0;
          useSoundStore.getState().stop();
          return;
        }
        useQueueStore.getState().goToNext();
        return;
      }

      consecutiveSkipsRef.current = 0;
      const autoPlay = !isFirstResolutionRef.current;
      isFirstResolutionRef.current = false;
      currentItemIdRef.current = currentItem.id;
      void resolveStream(currentItem, t, autoPlay);
    };

    const unsubscribe = useQueueStore.subscribe((state) => {
      onCurrentItemChanged(state.getCurrentItem());
    });

    const initialItem = useQueueStore.getState().getCurrentItem();
    if (initialItem) {
      onCurrentItemChanged(initialItem);
    }
    isFirstResolutionRef.current = false;

    return unsubscribe;
  }, [t]);
};
