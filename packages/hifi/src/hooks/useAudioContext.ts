import { useEffect, useState } from 'react';

import { audioLog } from '../logger';

export const useAudioContext = (disabled = false) => {
  const [context, setContext] = useState<AudioContext | null>(null);
  const [deviceChangeCount, setDeviceChangeCount] = useState(0);

  useEffect(() => {
    if (disabled) {
      setContext(null);
      return;
    }

    audioLog('debug', `Creating AudioContext with latencyHint: 'playback'`);
    const ctx = new AudioContext({ latencyHint: 'playback' });
    audioLog(
      'info',
      `AudioContext created. Sample rate: ${ctx.sampleRate}Hz, State: ${ctx.state}`,
    );
    setContext(ctx);

    ctx.onstatechange = () => {
      audioLog('info', `AudioContext state changed to: ${ctx.state}`);
    };

    // Recreate AudioContext when output devices change (e.g. Bluetooth connected)
    const handleDeviceChange = () => {
      audioLog('info', `Audio device change detected, recreating AudioContext`);
      setDeviceChangeCount((c) => c + 1);
    };

    if (
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.addEventListener === 'function'
    ) {
      navigator.mediaDevices.addEventListener(
        'devicechange',
        handleDeviceChange,
      );
    }

    return () => {
      audioLog('debug', `Closing AudioContext`);
      if (
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.removeEventListener === 'function'
      ) {
        navigator.mediaDevices.removeEventListener(
          'devicechange',
          handleDeviceChange,
        );
      }
      ctx.close();
    };
  }, [disabled, deviceChangeCount]);

  return context;
};
