import { RefObject, useEffect, useRef } from 'react';

import { AudioSource } from '../types';

export const useAudioLoader = (
  audioRef: RefObject<HTMLAudioElement | null>,
  src: AudioSource | null | undefined,
  isReady: boolean,
) => {
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || !src || !src.url) {
      return;
    }

    if (src.protocol === 'hls' || src.protocol === 'mse') {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (src.url !== prevUrl.current) {
      audio.src = src.url;
      audio.load();
      prevUrl.current = src.url;
    }
  }, [src, isReady, audioRef]);
};
