export const audioLog = (
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
  message: string,
) => {
  const formatted = `[AUDIO] ${message}`;
  if (typeof window !== 'undefined' && (window as any).__AUDIO_LOG__) {
    (window as any).__AUDIO_LOG__(level, formatted);
  } else {
    console[level === 'debug' || level === 'trace' ? 'log' : level](formatted);
  }
};
