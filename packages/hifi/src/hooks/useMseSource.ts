import { RefObject, useEffect, useRef } from 'react';

import { MseController } from '../fmp4';
import { AudioSource } from '../types';

// Buffer refills are normally driven by timeupdate, which stops firing once
// playback stalls on an empty buffer. The watchdog keeps refill attempts
// going so a transient network failure doesn't freeze playback permanently.
const STALL_WATCHDOG_INTERVAL_MS = 1000;
// Consecutive watchdog ticks with no playhead movement before attempting
// recovery. Two ticks avoids reacting to a single slow segment append.
const STUCK_TICKS_BEFORE_RECOVERY = 2;
const GAP_JUMP_EPSILON_SECONDS = 0.1;

// Appended segments occasionally leave a tiny hole in the buffered ranges
// (imprecise sidx timing); the decoder then stalls at the hole forever even
// though the rest of the track is buffered. Jump over it.
const jumpBufferedGap = (audio: HTMLAudioElement): boolean => {
  const { buffered, currentTime } = audio;
  for (let index = 0; index < buffered.length; index++) {
    if (buffered.start(index) > currentTime) {
      audio.currentTime = buffered.start(index) + GAP_JUMP_EPSILON_SECONDS;
      return true;
    }
  }
  return false;
};

export const useMseSource = (
  audioRef: RefObject<HTMLAudioElement | null>,
  src: AudioSource,
  isReady: boolean,
  onError?: (error: Error) => void,
) => {
  const controllerRef = useRef<MseController | null>(null);

  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.destroy(audioRef.current);
      controllerRef.current = null;
    }

    const audio = audioRef.current;
    if (!audio || !isReady || src.protocol !== 'mse') {
      return;
    }

    const controller = new MseController();
    controllerRef.current = controller;
    controller.init(audio, src.url, src.durationSeconds!, src.codec, onError);

    const onTimeUpdate = () => controller.handleTimeUpdate(audio);
    const onSeeking = () => controller.handleSeeking(audio);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('waiting', onTimeUpdate);
    audio.addEventListener('stalled', onTimeUpdate);

    let lastWatchdogTime = -1;
    let stuckTicks = 0;
    const watchdogId = window.setInterval(() => {
      controller.handleTimeUpdate(audio);

      if (audio.paused || audio.ended || audio.seeking) {
        lastWatchdogTime = audio.currentTime;
        stuckTicks = 0;
        return;
      }

      if (audio.currentTime === lastWatchdogTime) {
        stuckTicks += 1;
        if (stuckTicks >= STUCK_TICKS_BEFORE_RECOVERY) {
          stuckTicks = 0;
          if (!jumpBufferedGap(audio) && controller.isRecoverable) {
            // No gap to jump — controller hit transient failure limit.
            // Reset so refill loop can retry fetching missing segments.
            controller.resetFailed();
            controller.handleTimeUpdate(audio);
          }
        }
      } else {
        stuckTicks = 0;
      }
      lastWatchdogTime = audio.currentTime;
    }, STALL_WATCHDOG_INTERVAL_MS);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('waiting', onTimeUpdate);
      audio.removeEventListener('stalled', onTimeUpdate);
      window.clearInterval(watchdogId);
      controller.destroy(audio);
      controllerRef.current = null;
    };
  }, [src.url, src.protocol, src.durationSeconds, isReady, audioRef, onError]);
};
