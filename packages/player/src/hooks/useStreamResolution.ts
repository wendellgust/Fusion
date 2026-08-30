import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';

import { AudioSource } from '@nuclearplayer/hifi';
import type { TFunction } from '@nuclearplayer/i18n';
import { useTranslation } from '@nuclearplayer/i18n';
import type { QueueItem, StreamCandidate, Track } from '@nuclearplayer/model';

import { webStreamingProvider } from '../services/builtInWebProviders';
import { Logger } from '../services/logger';
import { streamingHost } from '../services/streamingHost';
import { isTauriDesktop } from '../services/tauriWebPolyfill';
import { useBlockStore } from '../stores/blockStore';
import { useQueueStore } from '../stores/queueStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSoundStore } from '../stores/soundStore';

export const STREAM_CACHE_WINDOW_SIZE = 5;

type CachedStreamResolution = {
  audioSource: AudioSource;
  candidate: StreamCandidate;
  resolvedAt: number;
};

// In-memory resolution cache indexed by QueueItem ID
const streamResolutionCache = new Map<string, CachedStreamResolution>();
const backgroundControllers = new Map<string, AbortController>();
const backgroundRetryTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const backgroundRetryCounts = new Map<string, number>();

let activeMainController: AbortController | null = null;
let cachedStreamServerPort: number | null = null;
let consecutiveFailuresCount = 0;
let isHandlingFailure = false;
let lastFailureTimestamp = 0;

const getStreamServerPort = async (): Promise<number> => {
  if (cachedStreamServerPort === null) {
    cachedStreamServerPort = await invoke<number>('stream_server_port');
  }
  return cachedStreamServerPort || 9100;
};

// Encode the URL in base64 and proxy through the local streaming server to bypass CORS
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
  const stream = candidate.stream;

  if (!stream || !stream.url) {
    if (!isTauriDesktop()) {
      const resolved = await webStreamingProvider.getStreamUrl(candidate.id);
      return { url: resolved.url, protocol: 'http' };
    }
    return { url: candidate.id, protocol: 'http' };
  }

  if (stream.protocol === 'hls') {
    return { url: stream.url, protocol: 'hls' };
  }

  if (isTauriDesktop()) {
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
  }

  // Web Browser Mode - Route remote streams through /api/proxy-audio to ensure standard CORS & streaming
  let webUrl = stream.url;
  if (
    !webUrl.startsWith('http://') &&
    !webUrl.startsWith('https://') &&
    !webUrl.startsWith('/api/')
  ) {
    const resolved = await webStreamingProvider.getStreamUrl(webUrl);
    webUrl = resolved.url;
  } else if (webUrl.startsWith('http://') || webUrl.startsWith('https://')) {
    if (
      typeof window !== 'undefined' &&
      !webUrl.startsWith(window.location.origin) &&
      !webUrl.includes('somafm.com')
    ) {
      webUrl = `/api/proxy-audio?url=${encodeURIComponent(webUrl)}`;
    }
  }
  return { url: webUrl, protocol: 'http' };
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
  const expiryMs =
    (useSettingsStore
      .getState()
      .getValue('playback.streamExpiryMs') as number) || 3600000;
  const now = Date.now();

  return candidates.some((candidate) => {
    if (!candidate.lastResolvedAtIso) {
      return false;
    }
    const resolvedAt = new Date(candidate.lastResolvedAtIso).getTime();
    return now - resolvedAt > expiryMs;
  });
};

const isCacheValid = (cached: CachedStreamResolution | undefined): boolean => {
  if (!cached || !cached.audioSource || !cached.candidate?.stream?.url) {
    return false;
  }
  const expiryMs =
    (useSettingsStore
      .getState()
      .getValue('playback.streamExpiryMs') as number) || 3600000;
  return Date.now() - cached.resolvedAt < expiryMs;
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

const resolveTrackAudioSource = async (
  item: QueueItem,
  signal: AbortSignal,
): Promise<CachedStreamResolution | undefined> => {
  const cached = streamResolutionCache.get(item.id);
  if (isCacheValid(cached)) {
    return cached;
  }

  const candidates = await resolveCandidates(item.track);
  if (signal.aborted || !candidates || candidates.length === 0) {
    return undefined;
  }

  updateItemCandidates(item, candidates);

  const resolvedCandidate = await resolveStreamWithFallback(
    candidates,
    item,
    signal,
  );
  if (signal.aborted || !resolvedCandidate?.stream) {
    return undefined;
  }

  const audioSource = await buildAudioSource(resolvedCandidate);
  if (signal.aborted) {
    return undefined;
  }

  const result: CachedStreamResolution = {
    audioSource,
    candidate: resolvedCandidate,
    resolvedAt: Date.now(),
  };

  streamResolutionCache.set(item.id, result);
  return result;
};

const handleBackgroundItemRetry = (item: QueueItem, t: TFunction): void => {
  const { items, currentIndex } = useQueueStore.getState();
  const windowItems = items.slice(
    currentIndex,
    currentIndex + STREAM_CACHE_WINDOW_SIZE,
  );
  const isInWindow = windowItems.some((wi) => wi.id === item.id);

  if (!isInWindow) {
    backgroundRetryCounts.delete(item.id);
    return;
  }

  const currentRetries = backgroundRetryCounts.get(item.id) || 0;
  backgroundRetryCounts.set(item.id, currentRetries + 1);

  // Progressive backoff for background attempts (2s, 3s, 4.5s... up to 12s)
  const backoffMs = Math.min(2000 * Math.pow(1.5, currentRetries), 12000);

  const timeoutId = setTimeout(() => {
    backgroundRetryTimeouts.delete(item.id);
    const state = useQueueStore.getState();
    const activeWindow = state.items.slice(
      state.currentIndex,
      state.currentIndex + STREAM_CACHE_WINDOW_SIZE,
    );
    const stillInWindow = activeWindow.some((wi) => wi.id === item.id);
    if (stillInWindow) {
      prefetchBackgroundItem(item, t);
    }
  }, backoffMs);

  backgroundRetryTimeouts.set(item.id, timeoutId);
};

const prefetchBackgroundItem = (item: QueueItem, t: TFunction): void => {
  if (backgroundControllers.has(item.id)) {
    return;
  }

  const cached = streamResolutionCache.get(item.id);
  if (isCacheValid(cached)) {
    return;
  }

  const controller = new AbortController();
  backgroundControllers.set(item.id, controller);

  resolveTrackAudioSource(item, controller.signal)
    .then((result) => {
      backgroundControllers.delete(item.id);
      if (controller.signal.aborted) {
        return;
      }

      if (result) {
        backgroundRetryCounts.delete(item.id);
        Logger.streaming.debug(
          `Prefetched stream successfully for track: ${item.track.title}`,
        );
      } else {
        handleBackgroundItemRetry(item, t);
      }
    })
    .catch(() => {
      backgroundControllers.delete(item.id);
      if (!controller.signal.aborted) {
        handleBackgroundItemRetry(item, t);
      }
    });
};

export const updateCacheWindow = (t: TFunction): void => {
  const { items, currentIndex } = useQueueStore.getState();
  if (items.length === 0 || currentIndex < 0 || currentIndex >= items.length) {
    return;
  }

  const windowItems = items.slice(
    currentIndex,
    currentIndex + STREAM_CACHE_WINDOW_SIZE,
  );
  const activeWindowIds = new Set(windowItems.map((item) => item.id));

  // Cancel background prefetches for items that fell outside the 5-item window
  for (const [id, controller] of backgroundControllers.entries()) {
    if (!activeWindowIds.has(id)) {
      controller.abort();
      backgroundControllers.delete(id);
    }
  }

  for (const [id, timeoutId] of backgroundRetryTimeouts.entries()) {
    if (!activeWindowIds.has(id)) {
      clearTimeout(timeoutId);
      backgroundRetryTimeouts.delete(id);
      backgroundRetryCounts.delete(id);
    }
  }

  // Evict cache entries too far from current index
  const safeRange = items.slice(
    Math.max(0, currentIndex - 2),
    currentIndex + STREAM_CACHE_WINDOW_SIZE + 2,
  );
  const safeIds = new Set(safeRange.map((it) => it.id));
  for (const id of streamResolutionCache.keys()) {
    if (!safeIds.has(id)) {
      streamResolutionCache.delete(id);
    }
  }

  // Prefetch positions 2 through 5 in the window
  const subsequentItems = windowItems.slice(1);
  for (const item of subsequentItems) {
    prefetchBackgroundItem(item, t);
  }
};

export const resetStreamResolutionFailuresForTesting = (): void => {
  consecutiveFailuresCount = 0;
  isHandlingFailure = false;
  lastFailureTimestamp = 0;
  streamResolutionCache.clear();
  for (const controller of backgroundControllers.values()) {
    controller.abort();
  }
  backgroundControllers.clear();
  for (const timeoutId of backgroundRetryTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  backgroundRetryTimeouts.clear();
  backgroundRetryCounts.clear();
};

export const handleCurrentTrackFailure = (t: TFunction): void => {
  const now = Date.now();
  if (isHandlingFailure || now - lastFailureTimestamp < 800) {
    return;
  }

  const queueState = useQueueStore.getState();
  const currentItem = queueState.getCurrentItem();
  const totalItems = queueState.items.length;

  if (!currentItem || totalItems <= 1) {
    if (currentItem) {
      setItemError(currentItem.id, 'errors.allCandidatesFailed', t);
    }
    useSoundStore.getState().stop();
    return;
  }

  consecutiveFailuresCount++;
  if (consecutiveFailuresCount >= totalItems) {
    consecutiveFailuresCount = 0;
    setItemError(currentItem.id, 'errors.allCandidatesFailed', t);
    useSoundStore.getState().stop();
    return;
  }

  isHandlingFailure = true;
  lastFailureTimestamp = now;

  // Invalidate any invalid cache for the failed track
  streamResolutionCache.delete(currentItem.id);

  Logger.streaming.warn(
    `Track "${currentItem.track.title}" failed. Moving to end of cache window (5th position) and advancing 6th to 5th.`,
  );

  // Move the failed track to after the 5th cached item, advancing the 6th to 5th
  queueState.moveFailedCurrentItemToCacheEnd(STREAM_CACHE_WINDOW_SIZE);

  setTimeout(() => {
    isHandlingFailure = false;
  }, 1000);
};

export const SILENT_AUDIO_PLACEHOLDER =
  'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA';

const resolveCurrentStream = async (
  item: QueueItem,
  t: TFunction,
  autoPlay: boolean,
): Promise<void> => {
  activeMainController?.abort();
  activeMainController = new AbortController();
  const { signal } = activeMainController;

  const { updateItemState } = useQueueStore.getState();
  const { setSrc, play } = useSoundStore.getState();

  // Refresh 5-track cache window (prefetch tracks 2..5, and when track 1 ends, track 6 enters window)
  updateCacheWindow(t);

  const cached = streamResolutionCache.get(item.id);
  if (isCacheValid(cached)) {
    updateItemState(item.id, { status: 'loading', error: undefined });
    consecutiveFailuresCount = 0;
    setSrc(cached!.audioSource);
    if (autoPlay) {
      play();
    }
    return;
  }

  updateItemState(item.id, { status: 'loading', error: undefined });

  if (autoPlay) {
    // Prime the native audio element immediately with the HTTP silent stream from server
    // This establishes a genuine HTTP Apple AVPlayer session that survives in background
    setSrc({ url: '/api/silent.mp3', protocol: 'http' });
    play();
  }

  // 1st attempt to resolve track stream
  let result = await resolveTrackAudioSource(item, signal);
  if (signal.aborted) {
    return;
  }

  // If 1st attempt fails, retry once after a short pause before giving up
  if (!result) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (signal.aborted) {
      return;
    }
    result = await resolveTrackAudioSource(item, signal);
    if (signal.aborted) {
      return;
    }
  }

  if (!result) {
    setItemError(item.id, 'errors.allCandidatesFailed', t);
    handleCurrentTrackFailure(t);
    return;
  }

  consecutiveFailuresCount = 0;
  setSrc(result.audioSource);
  if (autoPlay) {
    play();
  }
};

export const reResolveCurrentTrack = async (t: TFunction): Promise<void> => {
  const currentItem = useQueueStore.getState().getCurrentItem();
  if (!currentItem) {
    return;
  }

  streamResolutionCache.delete(currentItem.id);

  const { stop, setSrc } = useSoundStore.getState();
  stop();

  activeMainController?.abort();
  activeMainController = new AbortController();
  const { signal } = activeMainController;

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
    handleCurrentTrackFailure(t);
    return;
  }

  const audioSource = await buildAudioSource(resolvedCandidate);
  if (signal.aborted) {
    return;
  }

  streamResolutionCache.set(currentItem.id, {
    audioSource,
    candidate: resolvedCandidate,
    resolvedAt: Date.now(),
  });

  setSrc(audioSource);
};

export const useStreamResolution = (): void => {
  const { t } = useTranslation('streaming');
  const currentItemIdRef = useRef<string | null>(null);
  const isFirstResolutionRef = useRef(true);
  const consecutiveSkipsRef = useRef(0);

  useEffect(() => {
    const onCurrentItemChanged = (
      currentItem: QueueItem | undefined,
      force = false,
    ): void => {
      if (!currentItem) {
        return;
      }

      if (!force && currentItem.id === currentItemIdRef.current) {
        const soundState = useSoundStore.getState();
        if (
          soundState.status === 'playing' &&
          (!soundState.src || !soundState.src.url)
        ) {
          console.log(
            '[StreamResolution] Current item active without src, resolving:',
            currentItem.track.title,
          );
          void resolveCurrentStream(currentItem, t, true);
        }
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
      // Do not autoplay on initial cold boot if queue was loaded from disk and player was stopped
      const isInitialColdBoot =
        !isFirstResolutionRef.current &&
        useSoundStore.getState().status !== 'playing';
      isFirstResolutionRef.current = true;
      const autoPlay = !isInitialColdBoot;

      currentItemIdRef.current = currentItem.id;
      console.log(
        '[StreamResolution] Resolving current track:',
        currentItem.track.title,
        'autoPlay:',
        autoPlay,
      );
      void resolveCurrentStream(currentItem, t, autoPlay);
    };

    const unsubscribeQueue = useQueueStore.subscribe((state) => {
      onCurrentItemChanged(state.getCurrentItem());
    });

    const unsubscribeSound = useSoundStore.subscribe((state) => {
      if (state.status === 'playing' && (!state.src || !state.src.url)) {
        const currentItem = useQueueStore.getState().getCurrentItem();
        if (currentItem) {
          console.log(
            '[StreamResolution] Play triggered with empty src for track:',
            currentItem.track.title,
          );
          void resolveCurrentStream(currentItem, t, true);
        }
      }
    });

    const initialItem = useQueueStore.getState().getCurrentItem();
    if (initialItem) {
      onCurrentItemChanged(initialItem);
    }
    isFirstResolutionRef.current = false;

    return () => {
      unsubscribeQueue();
      unsubscribeSound();
    };
  }, [t]);
};
