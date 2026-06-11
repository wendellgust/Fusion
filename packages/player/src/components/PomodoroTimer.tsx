import { useState, useEffect, useRef, type FC } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Flame, Coffee, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

type PomodoroMode = 'work' | 'break';

type PomodoroTimerProps = {
  isCompact: boolean;
};

export const PomodoroTimer: FC<PomodoroTimerProps> = ({ isCompact }) => {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const timerRef = useRef<any>(null);

  // Play synthetic Web Audio sounds to bypass asset loading
  const playSound = (type: 'tick' | 'complete') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
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
      setTimeLeft((mode === 'work' ? workMinutes : breakMinutes) * 60);
    }
  }, [workMinutes, breakMinutes, mode, isPlaying]);

  // Main countdown loop
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Timer complete!
            clearInterval(timerRef.current!);
            setIsPlaying(false);
            playSound('complete');
            
            const nextMode = mode === 'work' ? 'break' : 'work';
            setMode(nextMode);
            toast(`Pomodoro ${mode === 'work' ? 'Work Session' : 'Break'} finished! Switch to ${nextMode === 'work' ? 'focus' : 'rest'}.`, {
              action: {
                label: 'Start Now',
                onClick: () => setIsPlaying(true)
              }
            });
            return (nextMode === 'work' ? workMinutes : breakMinutes) * 60;
          }
          if (soundEnabled && (prev - 1) % 60 === 0 || soundEnabled) {
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
  }, [isPlaying, mode, workMinutes, breakMinutes, soundEnabled]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const resetTimer = () => {
    setIsPlaying(false);
    setTimeLeft((mode === 'work' ? workMinutes : breakMinutes) * 60);
  };

  const skipMode = () => {
    setIsPlaying(false);
    const nextMode = mode === 'work' ? 'break' : 'work';
    setMode(nextMode);
    setTimeLeft((nextMode === 'work' ? workMinutes : breakMinutes) * 60);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Compact layout (collapsed sidebar)
  if (isCompact) {
    return (
      <div 
        className="flex flex-col items-center gap-1.5 py-3 border-y border-border/20 bg-background/20 select-none cursor-pointer"
        onClick={togglePlay}
        title={`Pomodoro ${mode === 'work' ? 'Work' : 'Break'} - ${isPlaying ? 'Click to Pause' : 'Click to Start'}`}
      >
        {mode === 'work' ? (
          <Flame size={18} className={`${isPlaying ? 'text-red-500 animate-pulse' : 'text-red-400'}`} />
        ) : (
          <Coffee size={18} className={`${isPlaying ? 'text-teal-500 animate-pulse' : 'text-teal-400'}`} />
        )}
        <span className="text-[10px] font-mono font-semibold text-foreground">
          {Math.ceil(timeLeft / 60)}m
        </span>
      </div>
    );
  }

  // Expanded/Full layout
  return (
    <div className="mx-3 my-2 p-3.5 rounded-xl border border-border/40 bg-gradient-to-br from-background-input/60 to-background-input/20 backdrop-blur-md select-none transition-all duration-300">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          {mode === 'work' ? (
            <div className="flex items-center gap-1 bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full text-xs font-semibold">
              <Flame size={12} className={isPlaying ? 'animate-pulse' : ''} />
              <span>Focus</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-teal-500/10 text-teal-500 border border-teal-500/20 px-2 py-0.5 rounded-full text-xs font-semibold">
              <Coffee size={12} className={isPlaying ? 'animate-pulse' : ''} />
              <span>Break</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1 rounded-md hover:bg-foreground/5 transition-colors ${soundEnabled ? 'text-primary' : 'text-foreground-secondary'}`}
            title={soundEnabled ? 'Mute ticks' : 'Enable ticks'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1 rounded-md hover:bg-foreground/5 transition-colors ${showSettings ? 'text-primary' : 'text-foreground-secondary'}`}
            title="Timer Settings"
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {!showSettings ? (
        <div className="flex flex-col items-center justify-center py-1.5">
          {/* Big timer clock */}
          <div className="text-3xl font-bold font-mono tracking-wider text-foreground mb-3 tabular-nums">
            {formatTime(timeLeft)}
          </div>

          {/* Progress bar background & filling */}
          <div className="w-full h-1.5 bg-foreground/10 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full transition-all duration-1000 rounded-full ${mode === 'work' ? 'bg-red-500' : 'bg-teal-500'}`}
              style={{
                width: `${((mode === 'work' ? workMinutes : breakMinutes) * 60 - timeLeft) / ((mode === 'work' ? workMinutes : breakMinutes) * 60) * 100}%`
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 w-full">
            <button
              onClick={togglePlay}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-sm ${
                isPlaying 
                  ? 'bg-foreground text-background hover:bg-foreground/80' 
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              }`}
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <button
              onClick={resetTimer}
              className="p-1.5 rounded-full hover:bg-foreground/5 text-foreground-secondary hover:text-foreground transition-colors"
              title="Reset"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={skipMode}
              className="text-xs font-semibold text-foreground-secondary hover:text-foreground hover:bg-foreground/5 px-2 py-1 rounded transition-colors"
              title="Skip Session"
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 py-1 text-xs transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-foreground-secondary">Work Duration:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="120"
                value={workMinutes}
                onChange={(e) => setWorkMinutes(Math.max(1, parseInt(e.target.value) || 25))}
                className="w-10 text-center py-0.5 rounded border border-border/40 bg-background-input text-foreground text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-foreground-secondary">min</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-foreground-secondary">Break Duration:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="60"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Math.max(1, parseInt(e.target.value) || 5))}
                className="w-10 text-center py-0.5 rounded border border-border/40 bg-background-input text-foreground text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-foreground-secondary">min</span>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setShowSettings(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
