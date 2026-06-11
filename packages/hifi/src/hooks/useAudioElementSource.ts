import { RefObject, useEffect, useState } from 'react';
import { audioLog } from '../logger';

export const useAudioElementSource = (
  audioRef: RefObject<HTMLAudioElement | null>,
  context: AudioContext | null,
) => {
  const [source, setSource] = useState<MediaElementAudioSourceNode | null>(
    null,
  );

  useEffect(() => {
    if (!context || !audioRef.current) {
      return;
    }

    audioLog('debug', `Creating MediaElementAudioSourceNode for HTMLAudioElement`);
    const audioSource = context.createMediaElementSource(audioRef.current);
    audioLog('debug', `MediaElementAudioSourceNode created successfully`);
    setSource(audioSource);

    return () => {
      audioLog('debug', `Disconnecting MediaElementAudioSourceNode`);
      audioSource.disconnect();
    };
  }, [context, audioRef]);

  return { source };
};
