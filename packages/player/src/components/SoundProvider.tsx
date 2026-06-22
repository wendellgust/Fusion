import type { FC, PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Sound, Volume } from '@nuclearplayer/hifi';
import { useTranslation } from '@nuclearplayer/i18n';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { reResolveCurrentTrack } from '../hooks/useStreamResolution';
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
  const setAnalyser = useVisualizerStore((state) => state.setAnalyser);
  const preload: HTMLAudioElement['preload'] = 'auto';
  const isNativeNetworkStream =
    (src?.protocol === 'http' || src?.protocol === 'https') &&
    (src?.url?.startsWith('http://') || src?.url?.startsWith('https://'));
  const crossOrigin = isNativeNetworkStream
    ? ('anonymous' as const)
    : ('' as const);
  const [volume01] = useCoreSetting<number>('playback.volume');
  const [muted] = useCoreSetting<boolean>('playback.muted');
  const volumePercent = muted ? 0 : Math.round((volume01 ?? 1) * 100);
  const [bypassWebAudio] = useCoreSetting<boolean>('playback.bypassWebAudio');

  useEffect(() => {
    if (crossfadeMs !== undefined) {
      useSoundStore.getState().setCrossfadeMs(crossfadeMs);
    }
  }, [crossfadeMs]);

  const handleTimeUpdate = useCallback(
    ({ position, duration }: { position: number; duration: number }) => {
      useSoundStore.getState().updatePlayback(position, duration);
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

      const currentItem = useQueueStore.getState().getCurrentItem();
      if (currentItem) {
        useQueueStore
          .getState()
          .updateItemState(currentItem.id, { status: 'error', error: message });
      }
    },
    [audioElement, t],
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

    // silentGain forces WebKit to keep the audio graph processing.
    // Without any output path, WebKit suspends the graph even when ctx.state === 'running'.
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    analyser.connect(silentGain);
    silentGain.connect(ctx.destination);

    // Always use a parallel element in bypass mode.
    // - captureStream() doesn't capture GStreamer audio on Linux (bypass routes through GStreamer).
    // - audioElement.src is a blob URL when protocol is 'mse' — unusable by a second element.
    // - Use src.url (the actual proxy URL) instead; GStreamer in WebKitGTK plays fmp4 natively.
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
      {src && (
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
      )}
      {children}
    </>
  );
};
