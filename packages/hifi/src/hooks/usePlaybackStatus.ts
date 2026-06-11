import { RefObject, useEffect, useRef } from 'react';
import { audioLog } from '../logger';

import { SoundStatus } from '../types';

const HAVE_FUTURE_DATA = 3;

const isReadyToPlay = (audio: HTMLAudioElement): boolean =>
  audio.readyState >= HAVE_FUTURE_DATA;

export const usePlaybackStatus = (
  audioRef: RefObject<HTMLAudioElement | null>,
  status: SoundStatus,
  srcUrl: string,
  context: AudioContext | null,
  isReady: boolean,
  onError?: (error: Error) => void,
) => {
  const activeSrcRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const srcChanged = srcUrl !== activeSrcRef.current;
    audioLog('debug', `usePlaybackStatus status: ${status}, srcUrl: ${srcUrl}, srcChanged: ${srcChanged}`);

    const tryPlay = () => {
      audioLog('debug', `tryPlay: readyState=${audio.readyState}, paused=${audio.paused}`);
      if (!isReadyToPlay(audio)) {
        audioLog('debug', `tryPlay: ignored, readyState < HAVE_FUTURE_DATA`);
        return;
      }
      if (!audio.paused) {
        audioLog('debug', `tryPlay: ignored, already playing`);
        return;
      }
      activeSrcRef.current = srcUrl;
      if (context) {
        audioLog('debug', `Resuming AudioContext. Current state: ${context.state}`);
        const resumePromise = context.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise.then(() => {
            audioLog('debug', `AudioContext resumed. State: ${context.state}`);
          });
        } else {
          audioLog('debug', `AudioContext resumed (sync/mock). State: ${context.state}`);
        }
      }
      audioLog('debug', `Calling audio.play()`);
      audio.play().then(
        () => {
          audioLog('debug', `audio.play() succeeded. Current time: ${audio.currentTime}`);
        },
        (err: DOMException) => {
          audioLog('error', `audio.play() failed: ${err.name} - ${err.message}`);
          if (err.name === 'AbortError') {
            return;
          }
          onError?.(err);
        }
      );
    };

    switch (status) {
      case 'playing': {
        if (!srcChanged) {
          tryPlay();
        }
        const onCanPlay = () => {
          audioLog('debug', `HTMLAudioElement fired canplay event`);
          tryPlay();
        };
        audio.addEventListener('canplay', onCanPlay);
        return () => audio.removeEventListener('canplay', onCanPlay);
      }
      case 'paused': {
        audioLog('debug', `Pausing HTMLAudioElement`);
        audio.pause();
        return;
      }
      case 'stopped': {
        audioLog('debug', `Stopping HTMLAudioElement (pause and reset currentTime)`);
        activeSrcRef.current = null;
        audio.pause();
        audio.currentTime = 0;
        return;
      }
    }
  }, [status, srcUrl, isReady, context, audioRef, onError]);
};
