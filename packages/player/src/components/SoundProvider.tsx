import type { FC, PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Sound, Volume } from '@nuclearplayer/hifi';
import { useTranslation } from '@nuclearplayer/i18n';

import { useCoreSetting } from '../hooks/useCoreSetting';
import {
  handleCurrentTrackFailure,
  reResolveCurrentTrack,
} from '../hooks/useStreamResolution';
import { eventBus } from '../services/eventBus';
import { Logger } from '../services/logger';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { useVisualizerStore } from '../stores/visualizerStore';
import { resolveErrorMessage } from '../utils/logging';
import { VisualizerAnalyser } from './VisualizerAnalyser';

export const SoundProvider: FC<PropsWithChildren> = ({ children }) => {
  const { src, status, seek } = useSoundStore();
  const { t } = useTranslation('streaming');
  const [crossfadeMs] = useCoreSetting<number>('playback.crossfadeMs');
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const pendingSeekRef = useRef<number | null>(null);
  const lastFailureTimeRef = useRef<number>(0);
  const setAnalyser = useVisualizerStore((state) => state.setAnalyser);
  const preload: HTMLAudioElement['preload'] = 'auto';
  const crossOrigin = 'anonymous' as const;
  const [volume01] = useCoreSetting<number>('playback.volume');
  const [muted] = useCoreSetting<boolean>('playback.muted');
  const volumePercent = muted ? 0 : Math.round((volume01 ?? 1) * 100);
  const [bypassWebAudio] = useCoreSetting<boolean>('playback.bypassWebAudio');

  useEffect(() => {
    if (crossfadeMs !== undefined) {
      useSoundStore.getState().setCrossfadeMs(crossfadeMs);
    }
  }, [crossfadeMs]);

  // Hook up Web MediaSession API for iPhone / Android Lockscreen / Bluetooth Media Controls
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    if ('playbackState' in navigator.mediaSession) {
      navigator.mediaSession.playbackState =
        status === 'playing'
          ? 'playing'
          : status === 'paused'
            ? 'paused'
            : 'none';
    }

    const currentItem = useQueueStore.getState().getCurrentItem();
    const track = currentItem?.track;

    if (track) {
      const artistName =
        (track as any).artist ||
        (track as any).artists?.[0]?.name ||
        'Unknown Artist';
      const trackTitle =
        (track as any).name || (track as any).title || 'Unknown Track';
      const artworkUrl =
        (track as any).thumbnail ||
        (track as any).album?.artwork?.items?.[0]?.url ||
        (track as any).album?.coverImage ||
        '';

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: trackTitle,
          artist: artistName,
          album: (track as any).album?.title || (track as any).album || '',
          artwork: artworkUrl
            ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        });
      } catch {
        /* ignore invalid metadata */
      }
    }

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        useSoundStore.getState().play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        useSoundStore.getState().pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        useQueueStore.getState().goToPrevious();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        useQueueStore.getState().goToNext();
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          useSoundStore.getState().seekTo(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 10;
        const current = useSoundStore.getState().seek || 0;
        useSoundStore.getState().seekTo(Math.max(0, current - skipTime));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 10;
        const current = useSoundStore.getState().seek || 0;
        const duration = useSoundStore.getState().duration || current + 10;
        useSoundStore.getState().seekTo(Math.min(duration, current + skipTime));
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        useSoundStore.getState().stop();
      });
    } catch {
      /* ignore unsupported actions */
    }
  }, [src, status]);

  const handleTimeUpdate = useCallback(
    ({ position, duration }: { position: number; duration: number }) => {
      useSoundStore.getState().updatePlayback(position, duration);
      if (
        typeof navigator !== 'undefined' &&
        'mediaSession' in navigator &&
        navigator.mediaSession.setPositionState &&
        duration > 0 &&
        position >= 0 &&
        position <= duration
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: 1,
            position,
          });
        } catch {
          /* ignore invalid state */
        }
      }
    },
    [],
  );

  const [autoRemovePlayed] = useCoreSetting<boolean>(
    'playback.autoRemovePlayed',
  );

  const handleEnd = useCallback(() => {
    const currentItem = useQueueStore.getState().getCurrentItem();
    if (currentItem) {
      eventBus.emit('trackFinished', currentItem.track);
    }

    useQueueStore.getState().advanceOnTrackEnd();

    if (autoRemovePlayed && currentItem) {
      useQueueStore.getState().removeByIds([currentItem.id]);
    }
  }, [autoRemovePlayed]);

  const handleCanPlay = useCallback(() => {
    if (pendingSeekRef.current !== null) {
      const seekTarget = pendingSeekRef.current;
      pendingSeekRef.current = null;
      useSoundStore.getState().seekTo(seekTarget);
      useSoundStore.getState().play();
      return;
    }
    const currentItem = useQueueStore.getState().getCurrentItem();
    if (currentItem) {
      useQueueStore
        .getState()
        .updateItemState(currentItem.id, { status: 'success' });
      eventBus.emit('trackStarted', currentItem.track);
    }
  }, []);

  const handleError = useCallback(
    (error: Error) => {
      if (error.message === 'stream:expired') {
        const savedTime = audioElement?.currentTime ?? 0;
        pendingSeekRef.current = savedTime > 1 ? savedTime : null;
        void reResolveCurrentTrack(t);
        return;
      }

      const message = resolveErrorMessage(error);
      Logger.streaming.error(`Playback error: ${message}`);

      if (!src || status === 'stopped') {
        return;
      }

      const now = Date.now();
      if (now - lastFailureTimeRef.current < 1500) {
        return;
      }
      lastFailureTimeRef.current = now;

      const currentItem = useQueueStore.getState().getCurrentItem();
      if (currentItem) {
        useQueueStore
          .getState()
          .updateItemState(currentItem.id, { status: 'error', error: message });
      }

      handleCurrentTrackFailure(t);
    },
    [audioElement, src, status, t],
  );

  const handleAudioElement = useCallback((el: HTMLAudioElement | null) => {
    setAudioElement(el);
  }, []);

  useEffect(() => {
    if (!bypassWebAudio || !audioElement || !src) {
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    analyser.connect(silentGain);
    silentGain.connect(ctx.destination);

    const parallelEl = new Audio();
    parallelEl.src = src.url;
    parallelEl.crossOrigin = audioElement.crossOrigin || 'anonymous';
    parallelEl.currentTime = audioElement.currentTime;
    ctx.createMediaElementSource(parallelEl).connect(analyser);

    setAnalyser(analyser);

    const syncPlay = () => {
      parallelEl.currentTime = audioElement.currentTime;
      parallelEl.play().catch(() => undefined);
    };
    const syncPause = () => parallelEl.pause();
    audioElement.addEventListener('play', syncPlay);
    audioElement.addEventListener('pause', syncPause);

    const activate = () => {
      if (ctx.state === 'closed') {
        return;
      }
      ctx
        .resume()
        .then(() => {
          if (!audioElement.paused) {
            syncPlay();
          }
        })
        .catch(() => undefined);
      if (ctx.state !== 'running') {
        document.addEventListener('mousedown', activate, { once: true });
        document.addEventListener('keydown', activate, { once: true });
      }
    };
    document.addEventListener('mousedown', activate, { once: true });
    document.addEventListener('keydown', activate, { once: true });
    ctx
      .resume()
      .then(() => {
        if (!audioElement.paused) {
          syncPlay();
        }
      })
      .catch(() => undefined);

    return () => {
      document.removeEventListener('mousedown', activate);
      document.removeEventListener('keydown', activate);
      audioElement.removeEventListener('play', syncPlay);
      audioElement.removeEventListener('pause', syncPause);
      parallelEl.pause();
      parallelEl.src = '';
      analyser.disconnect();
      ctx.close();
      setAnalyser(null);
    };
  }, [bypassWebAudio, audioElement, src, setAnalyser]);

  return (
    <>
      <Sound
        src={src}
        status={status}
        seek={seek}
        volume={volumePercent}
        preload={preload}
        crossOrigin={crossOrigin}
        onTimeUpdate={handleTimeUpdate}
        onEnd={handleEnd}
        onCanPlay={handleCanPlay}
        onError={handleError}
        bypassWebAudio={bypassWebAudio}
        onAudioElement={handleAudioElement}
      >
        <Volume value={volumePercent} />
        <VisualizerAnalyser />
      </Sound>
      {children}
    </>
  );
};
