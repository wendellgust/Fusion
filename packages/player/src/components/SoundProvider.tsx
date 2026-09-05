import type { FC, PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isIOSDevice, Sound, Volume } from '@nuclearplayer/hifi';
import { useTranslation } from '@nuclearplayer/i18n';

import { useCoreSetting } from '../hooks/useCoreSetting';
import {
  handleCurrentTrackFailure,
  isCacheValid,
  reResolveCurrentTrack,
  streamResolutionCache,
} from '../hooks/useStreamResolution';
import { eventBus } from '../services/eventBus';
import { Logger } from '../services/logger';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { useVisualizerStore } from '../stores/visualizerStore';
import { getTrackArtworkUrl } from '../utils/artworkHelper';
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

  // Proactively unlock HTMLAudioElement on user interaction for iOS / Safari WebKit
  useEffect(() => {
    if (!audioElement || typeof window === 'undefined') {
      return;
    }

    let isUnlocked = false;
    const unlockAudio = () => {
      if (isUnlocked || !audioElement) {
        return;
      }

      // If no audio is loaded yet, prime with a 1-sample silent WAV to establish WebKit audio session
      if (
        !audioElement.src ||
        audioElement.src === '' ||
        audioElement.src === window.location.href
      ) {
        const silentWav =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        audioElement.src = silentWav;
        const playPromise = audioElement.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              isUnlocked = true;
              if (useSoundStore.getState().status !== 'playing') {
                audioElement.pause();
                audioElement.currentTime = 0;
              }
            })
            .catch(() => {});
        }
      } else {
        isUnlocked = true;
      }

      if (isIOSDevice()) {
        const silentKeeper = document.getElementById(
          'fusion-silent-keeper',
        ) as HTMLAudioElement | null;
        if (silentKeeper && silentKeeper.paused) {
          const p = silentKeeper.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              if (useSoundStore.getState().status !== 'paused') {
                silentKeeper.pause();
              }
            }).catch(() => {});
          }
        }
      }
    };

    window.addEventListener('touchstart', unlockAudio, {
      capture: true,
      passive: true,
    });
    window.addEventListener('touchend', unlockAudio, {
      capture: true,
      passive: true,
    });
    window.addEventListener('pointerdown', unlockAudio, {
      capture: true,
      passive: true,
    });
    window.addEventListener('click', unlockAudio, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
      window.removeEventListener('touchend', unlockAudio, { capture: true });
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('click', unlockAudio, { capture: true });
    };
  }, [audioElement]);

  useEffect(() => {
    if (crossfadeMs !== undefined) {
      useSoundStore.getState().setCrossfadeMs(crossfadeMs);
    }
  }, [crossfadeMs]);

  // Register MediaSession action handlers permanently so iOS never loses background callback references
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const registerHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        console.warn(
          `[MediaSession] action ${action} not supported or failed to register`,
        );
      }
    };

    const syncPositionState = (audio: HTMLAudioElement, rate: number) => {
      if (
        navigator.mediaSession.setPositionState &&
        audio.duration > 0 &&
        isFinite(audio.duration)
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: rate,
          });
        } catch {
          // Ignore invalid state
        }
      }
    };

    const startSilentKeeper = () => {
      if (!isIOSDevice()) {
        return;
      }
      const silentEl = document.getElementById(
        'fusion-silent-keeper',
      ) as HTMLAudioElement | null;
      if (silentEl && silentEl.paused) {
        silentEl.currentTime = 0;
        silentEl.play().catch(() => {});
      }
    };

    const stopSilentKeeper = () => {
      if (!isIOSDevice()) {
        return;
      }
      const silentEl = document.getElementById(
        'fusion-silent-keeper',
      ) as HTMLAudioElement | null;
      if (silentEl && !silentEl.paused) {
        silentEl.pause();
      }
    };

    const handlePlay = () => {
      stopSilentKeeper();
      const audio = document.querySelector('audio');
      if (audio && audio.paused) {
        // Direct resume: keep the existing buffered media and audio session active.
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            console.warn(
              '[MediaSession] Direct play failed, retrying with reload:',
              err,
            );
            const savedTime = audio.currentTime;
            audio.load();
            const onCanPlay = () => {
              audio.removeEventListener('canplay', onCanPlay);
              if (savedTime > 0 && isFinite(savedTime)) {
                try {
                  audio.currentTime = savedTime;
                } catch {
                  /* ignore */
                }
              }
              audio.play().catch(() => {});
            };
            audio.addEventListener('canplay', onCanPlay);
          });
        }
      }
      // Sync directly — React useEffect does NOT run when tab is backgrounded
      navigator.mediaSession.playbackState = 'playing';
      if (audio) {
        syncPositionState(audio, 1);
      }
      useSoundStore.getState().play();
    };

    const handlePause = () => {
      const audio = document.querySelector('audio');
      if (audio && !audio.paused) {
        audio.pause();
      }
      startSilentKeeper();
      // Sync directly — React useEffect does NOT run when tab is backgrounded
      navigator.mediaSession.playbackState = 'paused';
      if (audio) {
        syncPositionState(audio, 0);
      }
      useSoundStore.getState().pause();
    };

    const handlePrevious = () => {
      stopSilentKeeper();
      const audio = document.querySelector('audio');
      const queue = useQueueStore.getState();

      if (queue.items.length <= 1 || (audio && audio.currentTime > 3)) {
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
        useSoundStore.getState().seekTo(0);
        useSoundStore.getState().play();
        return;
      }

      const prevIndex =
        queue.currentIndex > 0
          ? queue.currentIndex - 1
          : queue.items.length - 1;
      const prevItem = queue.items[prevIndex];

      if (audio && prevItem) {
        const cached = streamResolutionCache.get(prevItem.id);
        if (isCacheValid(cached)) {
          audio.loop = false;
          audio.src = cached!.audioSource!.url;
          audio.play().catch(() => {});
        } else {
          audio.loop = true;
          audio.src = '/api/silent.mp3';
          audio.play().catch(() => {});
        }
      }

      navigator.mediaSession.playbackState = 'playing';
      useQueueStore.getState().goToPrevious();
    };

    const handleNext = () => {
      stopSilentKeeper();
      const audio = document.querySelector('audio');
      const queue = useQueueStore.getState();

      if (queue.items.length <= 1) {
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
        useSoundStore.getState().seekTo(0);
        useSoundStore.getState().play();
        return;
      }

      const nextIndex =
        queue.currentIndex < queue.items.length - 1
          ? queue.currentIndex + 1
          : 0;
      const nextItem = queue.items[nextIndex];

      if (audio && nextItem) {
        const cached = streamResolutionCache.get(nextItem.id);
        if (isCacheValid(cached)) {
          audio.loop = false;
          audio.src = cached!.audioSource!.url;
          audio.play().catch(() => {});
        } else {
          audio.loop = true;
          audio.src = '/api/silent.mp3';
          audio.play().catch(() => {});
        }
      }

      navigator.mediaSession.playbackState = 'playing';
      useQueueStore.getState().goToNext();
    };

    registerHandler('play', handlePlay);
    registerHandler('pause', handlePause);
    registerHandler('previoustrack', handlePrevious);
    registerHandler('nexttrack', handleNext);

    // Map seekbackward and seekforward to previous and next track.
    // iOS Safari typically defaults to showing 10s/15s skip buttons on lockscreen/Control Center.
    // Mapping them to handlePrevious and handleNext ensures that clicking them skips entire tracks as requested.
    registerHandler('seekbackward', handlePrevious);
    registerHandler('seekforward', handleNext);

    // Do NOT register seekto on iOS: registering seekto forces iOS into time-seek (+10s/-10s) mode instead of track mode
    if (!isIOSDevice()) {
      registerHandler('seekto', (details: MediaSessionActionDetails) => {
        if (details.seekTime !== undefined) {
          const audio = document.querySelector('audio');
          if (audio) {
            audio.currentTime = details.seekTime;
            syncPositionState(audio, audio.paused ? 0 : 1);
          }
          useSoundStore.getState().seekTo(details.seekTime);
        }
      });
    }

    registerHandler('stop', () => {
      stopSilentKeeper();
      const audio = document.querySelector('audio');
      if (audio) {
        audio.pause();
      }
      navigator.mediaSession.playbackState = 'none';
      useSoundStore.getState().stop();
    });
  }, []);

  // Sync playback state and metadata to lockscreen
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

    if (isIOSDevice()) {
      const silentEl = document.getElementById(
        'fusion-silent-keeper',
      ) as HTMLAudioElement | null;
      if (status === 'paused') {
        if (silentEl && silentEl.paused) {
          silentEl.currentTime = 0;
          silentEl.play().catch(() => {});
        }
      } else if (status === 'playing') {
        if (silentEl && !silentEl.paused) {
          silentEl.pause();
        }
      }
    }

    const currentItem = useQueueStore.getState().getCurrentItem();
    const track = currentItem?.track;

    if (track) {
      const trackRecord = track as unknown as {
        name?: string;
        title?: string;
        artist?: string;
        artists?: Array<{ name: string }>;
        album?: { title?: string } | string;
      };
      const artistName =
        trackRecord.artist ||
        trackRecord.artists?.[0]?.name ||
        'Unknown Artist';
      const trackTitle =
        trackRecord.name || trackRecord.title || 'Unknown Track';
      const albumTitle =
        typeof trackRecord.album === 'object' && trackRecord.album !== null
          ? trackRecord.album.title || ''
          : typeof trackRecord.album === 'string'
            ? trackRecord.album
            : '';
      const artworkUrl = getTrackArtworkUrl(track);

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: trackTitle,
          artist: artistName,
          album: albumTitle,
          artwork: artworkUrl
            ? [
                { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
                { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [],
        });
      } catch {
        /* ignore invalid metadata */
      }
    }
  }, [src, status]);

  const handleTimeUpdate = useCallback(
    ({ position, duration }: { position: number; duration: number }) => {
      const currentSrc = useSoundStore.getState().src?.url;
      if (
        !currentSrc ||
        currentSrc.includes('/api/silent.mp3') ||
        currentSrc.startsWith('data:audio')
      ) {
        return;
      }
      useSoundStore.getState().updatePlayback(position, duration);
      const currentItem = useQueueStore.getState().getCurrentItem();
      if (currentItem && currentItem.status !== 'success') {
        useQueueStore
          .getState()
          .updateItemState(currentItem.id, { status: 'success' });
      }
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
            playbackRate: useSoundStore.getState().status === 'playing' ? 1 : 0,
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
    const currentSrc = useSoundStore.getState().src?.url;
    if (
      !currentSrc ||
      currentSrc.includes('/api/silent.mp3') ||
      currentSrc.startsWith('data:audio')
    ) {
      return;
    }
    const audio = document.querySelector('audio');
    if (audio) {
      audio.loop = true;
      audio.src = '/api/silent.mp3';
      audio.play().catch(() => {});
    }
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
    const currentSrc = useSoundStore.getState().src?.url;
    if (
      !currentSrc ||
      currentSrc.includes('/api/silent.mp3') ||
      currentSrc.startsWith('data:audio')
    ) {
      return;
    }
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
      const currentSrc = useSoundStore.getState().src?.url;
      if (
        !currentSrc ||
        currentSrc.includes('/api/silent.mp3') ||
        currentSrc.startsWith('data:audio')
      ) {
        return;
      }
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
    if (!bypassWebAudio || isIOSDevice() || !audioElement || !src) {
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
        crossOrigin={isIOSDevice() ? undefined : crossOrigin}
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
      {isIOSDevice() && (
        <audio
          id="fusion-silent-keeper"
          playsInline
          loop
          preload="auto"
          src="/api/silent.mp3"
          style={{
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: '1px',
            height: '1px',
            opacity: 0.001,
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </>
  );
};
