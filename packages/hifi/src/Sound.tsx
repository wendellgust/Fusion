import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAudioContext } from './hooks/useAudioContext';
import { useAudioElementSource } from './hooks/useAudioElementSource';
import { useAudioEvents } from './hooks/useAudioEvents';
import { useAudioLoader } from './hooks/useAudioLoader';
import { useAudioSeek } from './hooks/useAudioSeek';
import { useHlsSource } from './hooks/useHlsSource';
import { useMseSource } from './hooks/useMseSource';
import { usePlaybackStatus } from './hooks/usePlaybackStatus';
import { audioLog } from './logger';
import { Destination } from './plugins/Destination';
import { SoundProps } from './types';

const PROTOCOLS_WITHOUT_WEB_AUDIO = new Set(['mse', 'hls']);

export const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

export const Sound: React.FC<SoundProps> = ({
  src,
  status,
  seek,
  volume,
  preload = 'auto',
  crossOrigin = '',
  onTimeUpdate,
  onEnd,
  onLoadStart,
  onCanPlay,
  onError,
  children,
  bypassWebAudio = false,
  onAudioElement,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const isIOS = isIOSDevice();
  const effectiveBypassWebAudio = bypassWebAudio || isIOS;

  const handleAudioRef = useCallback(
    (el: HTMLAudioElement | null) => {
      audioRef.current = el;
      setAudioElement(el);
      onAudioElement?.(el);
    },
    [onAudioElement],
  );
  const context = useAudioContext(effectiveBypassWebAudio);
  const { source } = useAudioElementSource(
    audioElement,
    effectiveBypassWebAudio ? null : context,
  );
  const isReady = effectiveBypassWebAudio ? true : !!source || !context;
  const [audioNodes, setAudioNodes] = useState<AudioNode[]>([]);

  useEffect(() => {
    if (source) {
      setAudioNodes([source]);
    } else {
      setAudioNodes([]);
    }
  }, [source]);

  useEffect(() => {
    if (!source || !context) {
      return;
    }

    if (!children) {
      source.connect(context.destination);
      return () => {
        source.disconnect();
      };
    }
  }, [source, context, children]);

  useAudioSeek(audioRef, seek, isReady);
  useAudioLoader(audioRef, src, isReady);
  useHlsSource(audioRef, src, isReady);
  useMseSource(audioRef, src, isReady, onError);
  usePlaybackStatus(
    audioRef,
    status,
    src?.url,
    effectiveBypassWebAudio ? null : context,
    isReady,
    onError,
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || volume === undefined) {
      return;
    }

    if (
      effectiveBypassWebAudio ||
      PROTOCOLS_WITHOUT_WEB_AUDIO.has(src?.protocol ?? 'http')
    ) {
      audio.volume = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume, src?.protocol, effectiveBypassWebAudio]);

  useEffect(() => {
    audioLog(
      'debug',
      `Sound component rendering: url="${src?.url ?? ''}" protocol="${src?.protocol ?? ''}" status="${status}" bypassWebAudio=${bypassWebAudio} isIOS=${isIOS}`,
    );
  }, [src?.url, src?.protocol, status, bypassWebAudio, isIOS]);

  const handleRegisterPlugin = useCallback((node: AudioNode) => {
    audioLog(
      'debug',
      `Registering audio plugin node: ${node.constructor.name}`,
    );
    setAudioNodes((prev) => [...prev, node]);
  }, []);

  const handleCanPlay = useCallback(() => {
    audioLog('debug', `handleCanPlay callback triggered`);
    onCanPlay?.();
  }, [onCanPlay]);

  const handleLoadStart = useCallback(() => {
    if (!src?.url) {
      return;
    }
    audioLog(
      'debug',
      `handleLoadStart callback triggered: starting load for url="${src.url}"`,
    );
    onLoadStart?.();
  }, [onLoadStart, src?.url]);

  const { handleTimeUpdate, handleError } = useAudioEvents({
    onTimeUpdate,
    onError,
  });

  const childArray = children
    ? Children.toArray(children).filter(isValidElement)
    : [];

  return (
    <>
      <audio
        ref={handleAudioRef}
        hidden
        playsInline
        preload={preload}
        crossOrigin={
          effectiveBypassWebAudio ? undefined : crossOrigin || undefined
        }
        onTimeUpdate={handleTimeUpdate}
        onEnded={onEnd}
        onLoadStart={handleLoadStart}
        onCanPlay={handleCanPlay}
        onPlaying={handleCanPlay}
        onError={handleError}
      />
      {isReady &&
        !effectiveBypassWebAudio &&
        context &&
        childArray.length > 0 && (
          <>
            {childArray.map((child, idx) =>
              cloneElement(
                child as React.ReactElement<Record<string, unknown>>,
                {
                  key: idx,
                  audioContext: context,
                  previousNode: audioNodes[idx],
                  onRegister: handleRegisterPlugin,
                },
              ),
            )}
            <Destination
              key="destination"
              audioContext={context}
              previousNode={audioNodes[childArray.length]}
            />
          </>
        )}
    </>
  );
};
