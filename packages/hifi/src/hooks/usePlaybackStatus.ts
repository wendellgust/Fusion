import { RefObject, useEffect, useRef } from 'react';

import { audioLog } from '../logger';
import { SoundStatus } from '../types';

export const usePlaybackStatus = (
  audioRef: RefObject<HTMLAudioElement | null>,
  status: SoundStatus,
  srcUrl: string | undefined | null,
  context: AudioContext | null,
  isReady: boolean,
  onError?: (error: Error) => void,
) => {
  const activeSrcRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || !srcUrl) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const srcChanged = srcUrl !== activeSrcRef.current;
    audioLog(
      'debug',
      `usePlaybackStatus status: ${status}, srcUrl: ${srcUrl}, srcChanged: ${srcChanged}`,
    );

    const tryPlay = () => {
      audioLog(
        'debug',
        `tryPlay: readyState=${audio.readyState}, paused=${audio.paused}`,
      );
      if (!audio.paused && activeSrcRef.current === srcUrl) {
        audioLog('debug', `tryPlay: ignored, already playing`);
        return;
      }
      activeSrcRef.current = srcUrl;
      if (context && context.state === 'suspended') {
        audioLog(
          'debug',
          `Resuming AudioContext. Current state: ${context.state}`,
        );
        const resumePromise = context.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise.then(() => {
            audioLog('debug', `AudioContext resumed. State: ${context.state}`);
          });
        }
      }
      audioLog('debug', `Calling audio.play()`);
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.then(
          () => {
            audioLog(
              'debug',
              `audio.play() succeeded. Current time: ${audio.currentTime}`,
            );
          },
          (err: DOMException) => {
            audioLog(
              'warn',
              `audio.play() caught: ${err.name} - ${err.message}`,
            );
            if (err.name === 'AbortError') {
              return;
            }
            if (err.name === 'NotAllowedError') {
              // iOS Safari User-Activation policy: retry playback on the next user interaction
              const resumeOnUserGesture = () => {
                window.removeEventListener(
                  'touchstart',
                  resumeOnUserGesture,
                  true,
                );
                window.removeEventListener(
                  'touchend',
                  resumeOnUserGesture,
                  true,
                );
                window.removeEventListener(
                  'pointerdown',
                  resumeOnUserGesture,
                  true,
                );
                window.removeEventListener('click', resumeOnUserGesture, true);
                if (audio.paused && activeSrcRef.current === srcUrl) {
                  audio.play().catch(() => {});
                }
              };
              window.addEventListener('touchstart', resumeOnUserGesture, {
                capture: true,
                once: true,
              });
              window.addEventListener('touchend', resumeOnUserGesture, {
                capture: true,
                once: true,
              });
              window.addEventListener('pointerdown', resumeOnUserGesture, {
                capture: true,
                once: true,
              });
              window.addEventListener('click', resumeOnUserGesture, {
                capture: true,
                once: true,
              });
              return;
            }
            onError?.(err);
          },
        );
      }
    };

    switch (status) {
      case 'playing': {
        tryPlay();
        const onCanPlay = () => {
          audioLog(
            'debug',
            `HTMLAudioElement fired ready/canplay/playing event. paused=${audio.paused}`,
          );
          if (status === 'playing') {
            audio.play().catch(() => {});
          }
        };
        audio.addEventListener('canplay', onCanPlay);
        audio.addEventListener('canplaythrough', onCanPlay);
        audio.addEventListener('loadeddata', onCanPlay);
        audio.addEventListener('playing', onCanPlay);
        return () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('canplaythrough', onCanPlay);
          audio.removeEventListener('loadeddata', onCanPlay);
          audio.removeEventListener('playing', onCanPlay);
        };
      }
      case 'paused': {
        audioLog('debug', `Pausing HTMLAudioElement`);
        audio.pause();
        return;
      }
      case 'stopped': {
        audioLog(
          'debug',
          `Stopping HTMLAudioElement (pause and reset currentTime)`,
        );
        activeSrcRef.current = null;
        audio.pause();
        audio.currentTime = 0;
        return;
      }
    }
  }, [status, srcUrl, isReady, context, audioRef, onError]);
};
