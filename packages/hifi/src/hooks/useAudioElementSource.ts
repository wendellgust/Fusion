import { useEffect, useState } from 'react';
import { audioLog } from '../logger';

export const useAudioElementSource = (
  audioElement: HTMLAudioElement | null,
  context: AudioContext | null,
) => {
  const [source, setSource] = useState<MediaElementAudioSourceNode | null>(
    null,
  );

  useEffect(() => {
    if (!context || !audioElement) {
      setSource(null);
      return;
    }

    audioLog('debug', `Creating MediaElementAudioSourceNode for HTMLAudioElement`);
    let audioSource: MediaElementAudioSourceNode | null = null;
    try {
      audioSource = context.createMediaElementSource(audioElement);
      audioLog('debug', `MediaElementAudioSourceNode created successfully`);
      setSource(audioSource);
    } catch (err) {
      audioLog(
        'error',
        `Failed to create MediaElementAudioSourceNode: ${(err as Error).message}`,
      );
      return;
    }

    return () => {
      audioLog('debug', `Disconnecting MediaElementAudioSourceNode`);
      try {
        audioSource?.disconnect();
      } catch {
        /* ignore */
      }
      setSource(null);
    };
  }, [context, audioElement]);

  return { source };
};
