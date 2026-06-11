import { useCallback } from 'react';
import { audioLog } from '../logger';

type AudioEventsProps = {
  onTimeUpdate?: (args: { position: number; duration: number }) => void;
  onError?: (error: Error) => void;
};

export const useAudioEvents = ({ onTimeUpdate, onError }: AudioEventsProps) => {
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (onTimeUpdate) {
        const el = e.currentTarget;
        onTimeUpdate({ position: el.currentTime, duration: el.duration });
      }
    },
    [onTimeUpdate],
  );

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget as HTMLAudioElement & {
        error: MediaError | null;
      };
      audioLog(
        'error',
        `HTMLAudioElement error: message="${el.error?.message || 'unknown'}" code=${el.error?.code || 'unknown'}`,
      );
      if (onError) {
        onError(new Error(el.error?.message || 'Unknown audio error'));
      }
    },
    [onError],
  );

  return {
    handleTimeUpdate,
    handleError,
  };
};
