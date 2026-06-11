import { useEffect, useState } from 'react';
import { audioLog } from '../logger';

export const useAudioContext = (disabled = false) => {
  const [context, setContext] = useState<AudioContext | null>(null);

  useEffect(() => {
    if (disabled) {
      setContext(null);
      return;
    }

    audioLog('debug', `Creating AudioContext with latencyHint: 'playback'`);
    const ctx = new AudioContext({ latencyHint: 'playback' });
    audioLog('info', `AudioContext created. Sample rate: ${ctx.sampleRate}Hz, State: ${ctx.state}`);
    setContext(ctx);

    ctx.onstatechange = () => {
      audioLog('info', `AudioContext state changed to: ${ctx.state}`);
    };

    return () => {
      audioLog('debug', `Closing AudioContext`);
      ctx.close();
    };
  }, [disabled]);

  return context;
};
