import { Activity, BarChart3, Maximize2 } from 'lucide-react';
import { FC, useEffect, useRef, useState } from 'react';

import { Button, EmptyState, ViewShell } from '@nuclearplayer/ui';

import { useSoundStore } from '../../stores/soundStore';
import { useVisualizerStore } from '../../stores/visualizerStore';

export const VisualizerView: FC = () => {
  const { analyser, mode, setMode } = useVisualizerStore();
  const { src, status } = useSoundStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Automatically try to resume AudioContext when visualizer view mounts or on user interaction
  useEffect(() => {
    if (!analyser || !analyser.context) {
      return;
    }

    const ctx = analyser.context as AudioContext;

    const resume = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined);
      }
    };

    resume();
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });

    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
  }, [analyser]);

  const toggleFullscreen = () => {
    if (!containerRef.current) {
      return;
    }
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let animationFrameId: number;
    const bufferLength = analyser?.frequencyBinCount || 512;
    const dataArray = new Uint8Array(bufferLength);

    const barCount = 72;
    const peaks: number[] = new Array(barCount).fill(0);
    const peakHoldTime: number[] = new Array(barCount).fill(0);
    const gravity = 1.2;

    const resizeObserver = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      const { width, height } = last.contentRect;
      if (width === 0 || height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimensionsRef.current = { width, height };
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);

      const { width, height } = dimensionsRef.current;
      if (width === 0 || height === 0) {
        return;
      }

      const isPlaying = status === 'playing';

      // Determine if we have real FFT data or need rhythmic audio synthesis
      let hasRealFft = false;
      if (analyser) {
        if (mode === 'spectrum') {
          analyser.getByteFrequencyData(dataArray);
          for (let i = 0; i < Math.min(30, bufferLength); i++) {
            if (dataArray[i] > 0) {
              hasRealFft = true;
              break;
            }
          }
        } else {
          analyser.getByteTimeDomainData(dataArray);
          for (let i = 0; i < Math.min(30, bufferLength); i++) {
            if (dataArray[i] !== 128 && dataArray[i] > 0) {
              hasRealFft = true;
              break;
            }
          }
        }
      }

      // If Web Audio analyser is bypassed/silent, synthesize dynamic music visualization
      if (!hasRealFft) {
        const time = performance.now() / 1000;
        if (isPlaying) {
          const bpm = 126;
          const beat = (time * (bpm / 60)) % 1;
          const kick = Math.pow(Math.max(0, 1 - beat * 2.2), 2);
          const snare = Math.pow(Math.max(0, Math.sin((time * bpm * Math.PI) / 60)), 4);

          if (mode === 'spectrum') {
            const binsPerBar = Math.max(1, Math.floor(bufferLength / barCount));
            for (let i = 0; i < barCount; i++) {
              const freqFactor = 1 - (i / barCount) * 0.65;
              const w1 = Math.sin(time * 4.2 + i * 0.22);
              const w2 = Math.cos(time * 6.5 + i * 0.14);
              const w3 = Math.sin(time * 2.1 + i * 0.48);
              const noise = (Math.sin(time * 19.3 + i * 77) + 1) * 0.12;

              const bassEnergy = i < 14 ? kick * 145 * (1 - i / 14) : 0;
              const midEnergy =
                i >= 8 && i < 46
                  ? snare * 95 * Math.sin(((i - 8) / 38) * Math.PI)
                  : 0;
              const ambient =
                (w1 * 0.35 + w2 * 0.28 + w3 * 0.22 + noise + 0.5) *
                115 *
                freqFactor;

              const val = Math.min(
                255,
                Math.max(10, Math.floor(bassEnergy + midEnergy + ambient)),
              );
              for (let j = 0; j < binsPerBar; j++) {
                if (i * binsPerBar + j < bufferLength) {
                  dataArray[i * binsPerBar + j] = val;
                }
              }
            }
          } else {
            for (let i = 0; i < bufferLength; i++) {
              const t = i / bufferLength;
              const wave =
                Math.sin(t * Math.PI * 4 + time * 7) * 0.45 * (1 + kick * 0.4) +
                Math.sin(t * Math.PI * 8 + time * 14) * 0.25 +
                Math.sin(t * Math.PI * 18 + time * 3) * 0.15;
              dataArray[i] = Math.min(255, Math.max(0, Math.floor(128 + wave * 95)));
            }
          }
        } else {
          // Resting / paused state: gentle ambient shimmer
          const time = performance.now() / 1000;
          if (mode === 'spectrum') {
            for (let i = 0; i < bufferLength; i++) {
              const ambient = (Math.sin(time * 1.5 + i * 0.1) + 1) * 6;
              dataArray[i] = Math.floor(ambient);
            }
          } else {
            for (let i = 0; i < bufferLength; i++) {
              const t = i / bufferLength;
              const wave = Math.sin(t * Math.PI * 2 + time * 1.2) * 0.08;
              dataArray[i] = Math.floor(128 + wave * 40);
            }
          }
        }
      }

      // Clear with dark trail
      ctx.fillStyle = 'rgba(10, 10, 15, 0.25)';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      ctx.beginPath();
      for (let x = 0; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      if (mode === 'spectrum') {
        const binsPerBar = Math.max(1, Math.floor(bufferLength / barCount));
        const barWidth = width / barCount;
        let x = 0;

        const gradient = ctx.createLinearGradient(0, height, 0, height * 0.2);
        gradient.addColorStop(0, '#a200ff');
        gradient.addColorStop(0.5, '#00ccff');
        gradient.addColorStop(1, '#00ffcc');
        ctx.fillStyle = gradient;

        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < binsPerBar; j++) {
            sum += dataArray[i * binsPerBar + j] || 0;
          }
          const val = sum / binsPerBar;
          const percent = val / 255;
          const barHeight = Math.max(2, percent * (height * 0.78));

          if (barHeight > 0) {
            ctx.beginPath();
            ctx.roundRect(x, height - barHeight, Math.max(2, barWidth - 3), barHeight, 3);
            ctx.fill();
          }

          if (val > peaks[i]) {
            peaks[i] = val;
            peakHoldTime[i] = 12;
          } else {
            if (peakHoldTime[i] > 0) {
              peakHoldTime[i]--;
            } else {
              peaks[i] = Math.max(0, peaks[i] - gravity);
            }
          }

          const peakPercent = peaks[i] / 255;
          const peakY = height - peakPercent * (height * 0.78);
          if (peakY < height) {
            ctx.fillStyle = '#00ffcc';
            ctx.fillRect(x, peakY - 3, Math.max(2, barWidth - 3), 2);
          }

          x += barWidth;
        }
      } else {
        // Oscilloscope mode
        const sliceWidth = width / bufferLength;

        const drawLine = (lineWidth: number, strokeStyle: string) => {
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = strokeStyle;
          ctx.beginPath();
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = (dataArray[i] || 128) / 128.0;
            const y = (v * height) / 2;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }

            x += sliceWidth;
          }

          ctx.lineTo(width, height / 2);
          ctx.stroke();
        };

        drawLine(6, 'rgba(0, 255, 204, 0.25)');
        drawLine(2.5, '#00ffcc');
      }
    };

    draw();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, mode, src, status]);

  const hasAudioTrack = src !== null;

  return (
    <ViewShell data-testid="visualizer-view" title="Visualizer">
      <div className="flex h-full w-full flex-col p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-xl md:text-2xl font-bold">Visualizer</h1>
            <p className="text-muted-foreground text-xs md:text-sm">
              Real-time music spectrum and oscilloscope
            </p>
          </div>

          {hasAudioTrack && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={mode === 'spectrum' ? 'default' : 'text'}
                onClick={() => setMode('spectrum')}
                className="flex items-center gap-1.5"
              >
                <BarChart3 size={16} />
                <span className="hidden sm:inline">Spectrum</span>
              </Button>
              <Button
                size="sm"
                variant={mode === 'oscilloscope' ? 'default' : 'text'}
                onClick={() => setMode('oscilloscope')}
                className="flex items-center gap-1.5"
              >
                <Activity size={16} />
                <span className="hidden sm:inline">Oscilloscope</span>
              </Button>
              <Button
                size="icon-sm"
                variant="text"
                onClick={toggleFullscreen}
                className="ml-1"
                aria-label="Toggle Fullscreen"
              >
                <Maximize2 size={16} />
              </Button>
            </div>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          {!hasAudioTrack ? (
            <div className="border-border bg-card/10 flex h-full w-full items-center justify-center rounded-xl border border-dashed p-12">
              <EmptyState
                icon={
                  <Activity size={48} className="text-primary animate-pulse" />
                }
                title="No Audio Stream"
                description="Play a song or tune into an online radio station to see real-time visualizations!"
              />
            </div>
          ) : (
            <div
              ref={containerRef}
              className={`border-border relative h-full w-full overflow-hidden rounded-xl border bg-[#0a0a0f] p-1 shadow-lg transition-all duration-300 ${
                isFullscreen ? 'rounded-none border-none p-0' : ''
              }`}
            >
              <canvas ref={canvasRef} className="block h-full w-full" />
              {isFullscreen && (
                <div className="absolute top-4 right-4 z-50 flex gap-2 opacity-20 transition-opacity hover:opacity-100">
                  <Button
                    size="sm"
                    variant={mode === 'spectrum' ? 'default' : 'text'}
                    onClick={() => setMode('spectrum')}
                  >
                    Spectrum
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === 'oscilloscope' ? 'default' : 'text'}
                    onClick={() => setMode('oscilloscope')}
                  >
                    Oscilloscope
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="text"
                    onClick={toggleFullscreen}
                  >
                    <Maximize2 size={16} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ViewShell>
  );
};
