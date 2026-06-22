import {
  BedDouble,
  ChevronUp,
  Coffee,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { toast } from 'sonner';

import { useSoundStore } from '../stores/soundStore';

type PomodoroMode = 'work' | 'break' | 'long-break';

type PomodoroTimerProps = {
  isCompact: boolean;
};

export const PomodoroTimer: FC<PomodoroTimerProps> = ({ isCompact }) => {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(() => {
    try {
      return (
        parseInt(localStorage.getItem('pomodoro_long_break_minutes') ?? '15') ||
        15
      );
    } catch {
      return 15;
    }
  });
  const [pomodorosPerLongBreak, setPomodorosPerLongBreak] = useState(() => {
    try {
      return (
        parseInt(localStorage.getItem('pomodoro_per_long_break') ?? '4') || 4
      );
    } catch {
      return 4;
    }
  });
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [alarmUrl, setAlarmUrl] = useState(() => {
    try {
      return localStorage.getItem('pomodoro_alarm_url') ?? '';
    } catch {
      return '';
    }
  });
  const [pauseMusicOnComplete, setPauseMusicOnComplete] = useState(() => {
    try {
      return localStorage.getItem('pomodoro_pause_music') !== 'false';
    } catch {
      return true;
    }
  });
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);

  const getModeMinutes = (m: PomodoroMode) => {
    if (m === 'work') {
      return workMinutes;
    }
    if (m === 'long-break') {
      return longBreakMinutes;
    }
    return breakMinutes;
  };

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isTimerCollapsed, setIsTimerCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pomodoro_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const nextVal = !isTimerCollapsed;
    setIsTimerCollapsed(nextVal);
    try {
      localStorage.setItem('pomodoro_collapsed', String(nextVal));
    } catch {
      /* ignore */
    }
  };

  // Play synthetic Web Audio sounds to bypass asset loading
  const playSound = (type: 'tick' | 'complete') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.015, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      } else if (type === 'complete') {
        osc.type = 'triangle';
        // Elegant play alert: C5 -> E5 -> G5 chord sequence
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (err) {
      console.warn('AudioContext failed to initialize:', err);
    }
  };

  // Synchronize time left when settings change and timer is reset
  useEffect(() => {
    if (!isPlaying) {
      setTimeLeft(getModeMinutes(mode) * 60);
    }
  }, [workMinutes, breakMinutes, longBreakMinutes, mode, isPlaying]);

  // Main countdown loop
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Timer complete!
            clearInterval(timerRef.current!);
            setIsPlaying(false);

            if (pauseMusicOnComplete) {
              useSoundStore.getState().pause();
            }

            if (alarmUrl.trim()) {
              alarmAudioRef.current = new Audio(alarmUrl.trim());
              alarmAudioRef.current.play().catch(() => playSound('complete'));
            } else {
              playSound('complete');
            }

            let nextMode: PomodoroMode;
            if (mode === 'work') {
              const newCount = pomodoroCount + 1;
              setPomodoroCount(newCount);
              nextMode =
                newCount % pomodorosPerLongBreak === 0 ? 'long-break' : 'break';
            } else {
              nextMode = 'work';
            }
            setMode(nextMode);
            const modeLabel =
              mode === 'work'
                ? 'Work Session'
                : mode === 'long-break'
                  ? 'Long Break'
                  : 'Break';
            const nextLabel =
              nextMode === 'work'
                ? 'focus'
                : nextMode === 'long-break'
                  ? 'long rest'
                  : 'rest';
            toast(`Pomodoro ${modeLabel} finished! Switch to ${nextLabel}.`, {
              action: {
                label: 'Start Now',
                onClick: () => setIsPlaying(true),
              },
            });
            return getModeMinutes(nextMode) * 60;
          }
          if ((soundEnabled && (prev - 1) % 60 === 0) || soundEnabled) {
            // Soft tick every second
            playSound('tick');
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [
    isPlaying,
    mode,
    workMinutes,
    breakMinutes,
    longBreakMinutes,
    pomodorosPerLongBreak,
    pomodoroCount,
    soundEnabled,
    pauseMusicOnComplete,
    alarmUrl,
  ]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const resetTimer = () => {
    setIsPlaying(false);
    setTimeLeft(getModeMinutes(mode) * 60);
  };

  const skipMode = () => {
    setIsPlaying(false);
    let nextMode: PomodoroMode;
    if (mode === 'work') {
      const newCount = pomodoroCount + 1;
      setPomodoroCount(newCount);
      nextMode =
        newCount % pomodorosPerLongBreak === 0 ? 'long-break' : 'break';
    } else {
      nextMode = 'work';
    }
    setMode(nextMode);
    setTimeLeft(getModeMinutes(nextMode) * 60);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const ModeIcon =
    mode === 'work' ? Flame : mode === 'long-break' ? BedDouble : Coffee;
  const modeLabel =
    mode === 'work' ? 'Focus' : mode === 'long-break' ? 'Long Break' : 'Break';
  const modeIconClass =
    mode === 'work'
      ? isPlaying
        ? 'text-red-500 animate-pulse'
        : 'text-red-400'
      : mode === 'long-break'
        ? isPlaying
          ? 'text-purple-500 animate-pulse'
          : 'text-purple-400'
        : isPlaying
          ? 'text-teal-500 animate-pulse'
          : 'text-teal-400';

  // Compact layout (collapsed sidebar)
  if (isCompact) {
    return (
      <div
        className="border-border/20 bg-background/20 flex cursor-pointer flex-col items-center gap-1.5 border-y py-3 select-none"
        onClick={togglePlay}
        title={`Pomodoro ${modeLabel} - ${isPlaying ? 'Click to Pause' : 'Click to Start'}`}
      >
        <ModeIcon size={18} className={modeIconClass} />
        <span className="text-foreground font-mono text-[10px] font-semibold">
          {Math.ceil(timeLeft / 60)}m
        </span>
      </div>
    );
  }

  // Collapsed expanded sidebar view (saves vertical space)
  if (isTimerCollapsed) {
    return (
      <div
        className="border-border/30 bg-background-input/40 hover:bg-background-input/60 mx-3 my-1 flex cursor-pointer items-center justify-between rounded-xl border p-2 transition-colors select-none"
        onClick={toggleCollapsed}
        title="Click to Expand Pomodoro Timer"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <ModeIcon size={14} className={modeIconClass} />
          <span className="text-foreground truncate text-[11px] font-semibold">
            {modeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-foreground font-mono text-xs font-bold">
            {formatTime(timeLeft)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="hover:bg-foreground/5 text-primary rounded-full p-1"
            title={isPlaying ? 'Pause' : 'Start'}
          >
            {isPlaying ? (
              <Pause size={10} fill="currentColor" />
            ) : (
              <Play size={10} fill="currentColor" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // Expanded/Full layout
  return (
    <div className="border-border/40 from-background-input/60 to-background-input/20 mx-3 my-2 rounded-xl border bg-gradient-to-br p-3.5 backdrop-blur-md transition-all duration-300 select-none">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {mode === 'work' ? (
            <div className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-500">
              <Flame size={12} className={isPlaying ? 'animate-pulse' : ''} />
              <span>Focus</span>
            </div>
          ) : mode === 'long-break' ? (
            <div className="flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-500">
              <BedDouble
                size={12}
                className={isPlaying ? 'animate-pulse' : ''}
              />
              <span>Long Break</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-500">
              <Coffee size={12} className={isPlaying ? 'animate-pulse' : ''} />
              <span>Break</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`hover:bg-foreground/5 rounded-md p-1 transition-colors ${soundEnabled ? 'text-primary' : 'text-foreground-secondary'}`}
            title={soundEnabled ? 'Mute ticks' : 'Enable ticks'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`hover:bg-foreground/5 rounded-md p-1 transition-colors ${showSettings ? 'text-primary' : 'text-foreground-secondary'}`}
            title="Timer Settings"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hover:bg-foreground/5 text-foreground-secondary hover:text-foreground rounded-md p-1 transition-colors"
            title="Collapse Timer"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>

      {!showSettings ? (
        <div className="flex flex-col items-center justify-center py-1.5">
          {/* Big timer clock */}
          <div className="text-foreground mb-3 font-mono text-3xl font-bold tracking-wider tabular-nums">
            {formatTime(timeLeft)}
          </div>

          {/* Progress bar background & filling */}
          <div className="bg-foreground/10 mb-3 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${mode === 'work' ? 'bg-red-500' : mode === 'long-break' ? 'bg-purple-500' : 'bg-teal-500'}`}
              style={{
                width: `${((getModeMinutes(mode) * 60 - timeLeft) / (getModeMinutes(mode) * 60)) * 100}%`,
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex w-full items-center justify-center gap-3">
            <button
              onClick={togglePlay}
              className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all ${
                isPlaying
                  ? 'bg-foreground text-background hover:bg-foreground/80'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              }`}
            >
              {isPlaying ? (
                <Pause size={14} fill="currentColor" />
              ) : (
                <Play size={14} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <button
              onClick={resetTimer}
              className="hover:bg-foreground/5 text-foreground-secondary hover:text-foreground rounded-full p-1.5 transition-colors"
              title="Reset"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={skipMode}
              className="text-foreground-secondary hover:text-foreground hover:bg-foreground/5 rounded px-2 py-1 text-xs font-semibold transition-colors"
              title="Skip Session"
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 py-1 text-xs transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary">Work Duration:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="120"
                value={workMinutes}
                onChange={(e) =>
                  setWorkMinutes(Math.max(1, parseInt(e.target.value) || 25))
                }
                className="border-border/40 bg-background-input text-foreground focus:ring-primary w-10 rounded border py-0.5 text-center font-mono text-xs font-medium focus:ring-1 focus:outline-none"
              />
              <span className="text-foreground-secondary">min</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary">Short Break:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="60"
                value={breakMinutes}
                onChange={(e) =>
                  setBreakMinutes(Math.max(1, parseInt(e.target.value) || 5))
                }
                className="border-border/40 bg-background-input text-foreground focus:ring-primary w-10 rounded border py-0.5 text-center font-mono text-xs font-medium focus:ring-1 focus:outline-none"
              />
              <span className="text-foreground-secondary">min</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary">Long Break:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="120"
                value={longBreakMinutes}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 15);
                  setLongBreakMinutes(v);
                  try {
                    localStorage.setItem(
                      'pomodoro_long_break_minutes',
                      String(v),
                    );
                  } catch {
                    /* ignore */
                  }
                }}
                className="border-border/40 bg-background-input text-foreground focus:ring-primary w-10 rounded border py-0.5 text-center font-mono text-xs font-medium focus:ring-1 focus:outline-none"
              />
              <span className="text-foreground-secondary">min</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary">Long break every:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="10"
                value={pomodorosPerLongBreak}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 4);
                  setPomodorosPerLongBreak(v);
                  try {
                    localStorage.setItem('pomodoro_per_long_break', String(v));
                  } catch {
                    /* ignore */
                  }
                }}
                className="border-border/40 bg-background-input text-foreground focus:ring-primary w-10 rounded border py-0.5 text-center font-mono text-xs font-medium focus:ring-1 focus:outline-none"
              />
              <span className="text-foreground-secondary">sessions</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground-secondary">
              Pause music on finish:
            </span>
            <button
              onClick={() => {
                const next = !pauseMusicOnComplete;
                setPauseMusicOnComplete(next);
                try {
                  localStorage.setItem('pomodoro_pause_music', String(next));
                } catch {
                  /* ignore */
                }
              }}
              className={`rounded border px-2 py-0.5 text-xs font-semibold transition-colors ${pauseMusicOnComplete ? 'border-primary text-primary bg-primary/10' : 'border-border/40 text-foreground-secondary'}`}
            >
              {pauseMusicOnComplete ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-foreground-secondary">
              Alarm URL (leave blank for beep):
            </span>
            <input
              type="url"
              placeholder="https://..."
              value={alarmUrl}
              onChange={(e) => {
                setAlarmUrl(e.target.value);
                try {
                  localStorage.setItem('pomodoro_alarm_url', e.target.value);
                } catch {
                  /* ignore */
                }
              }}
              className="border-border/40 bg-background-input text-foreground focus:ring-primary w-full rounded border px-1 py-0.5 text-xs focus:ring-1 focus:outline-none"
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setShowSettings(false)}
              className="text-primary text-xs font-semibold hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
