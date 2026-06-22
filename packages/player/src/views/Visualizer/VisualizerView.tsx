import { Activity, BarChart3, Maximize2 } from 'lucide-react';
import { FC, useEffect, useRef, useState } from 'react';

import { Button, EmptyState, ViewShell } from '@nuclearplayer/ui';

import { useCoreSetting } from '../../hooks/useCoreSetting';
import { useSoundStore } from '../../stores/soundStore';
import { useVisualizerStore } from '../../stores/visualizerStore';

export const VisualizerView: FC = () => {
  const { analyser, mode, setMode } = useVisualizerStore();
  const { src } = useSoundStore();
  const [bypassWebAudio] = useCoreSetting<boolean>('playback.bypassWebAudio');
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

  // Automatically try to resume context when visualizer view mounts or user interacts
  useEffect(() => {
    if (!analyser || !analyser.context) {
      return;
    }

    const ctx = analyser.context as AudioContext;

    const resume = () => {
      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => {
            console.log('AudioContext resumed in VisualizerView');
          })
          .catch((err: unknown) => {
            console.warn('Failed to resume AudioContext:', err);
          });
      }
    };

    // Try immediately
    resume();

    // Also register single-use click/keydown listeners to resume context on first interaction
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });

    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
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
      document.exitFullscreen();
    }
  };

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let animationFrameId: number;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Optimized visualizer density (72 bars is perfect)
    const barCount = 72;
    const peaks: number[] = new Array(barCount).fill(0);
    const peakHoldTime: number[] = new Array(barCount).fill(0);
    const gravity = 1.2;

    const resizeObserver = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      const { width, height } = last.contentRect;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
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

      // Clear with a slightly transparent dark background for a trailing motion blur effect
      ctx.fillStyle = 'rgba(10, 10, 15, 0.2)';
      ctx.fillRect(0, 0, width, height);

      // Grid: single batched path instead of N individual stroke() calls
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
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
        analyser.getByteFrequencyData(dataArray);

        const binsPerBar = Math.floor(bufferLength / barCount);
        const barWidth = width / barCount;
        let x = 0;

        // Shared gradient (create once per frame instead of per bar)
        const gradient = ctx.createLinearGradient(0, height, 0, height * 0.25);
        gradient.addColorStop(0, '#a200ff');
        gradient.addColorStop(0.5, '#00ccff');
        gradient.addColorStop(1, '#00ffcc');
        ctx.fillStyle = gradient;

        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < binsPerBar; j++) {
            sum += dataArray[i * binsPerBar + j];
          }
          const val = sum / binsPerBar;
          const percent = val / 255;
          const barHeight = percent * (height * 0.75);

          if (barHeight > 0) {
            // Draw rounded frequency bars
            ctx.beginPath();
            ctx.roundRect(x, height - barHeight, barWidth - 3, barHeight, 3);
            ctx.fill();
          }

          // Physics for falling peak indicators
          if (val > peaks[i]) {
            peaks[i] = val;
            peakHoldTime[i] = 10; // hold frame count
          } else {
            if (peakHoldTime[i] > 0) {
              peakHoldTime[i]--;
            } else {
              peaks[i] = Math.max(0, peaks[i] - gravity);
            }
          }

          // Draw the peak indicator dot (no shadowBlur for performance)
          const peakPercent = peaks[i] / 255;
          const peakY = height - peakPercent * (height * 0.75);
          if (peakY < height) {
            ctx.fillStyle = '#00ffcc';
            ctx.fillRect(x, peakY - 3, barWidth - 3, 2);
          }

          x += barWidth;
        }
      } else {
        // Oscilloscope mode (optimized using double line drawings for glow effect instead of shadowBlur)
        analyser.getByteTimeDomainData(dataArray);

        const sliceWidth = width / bufferLength;

        const drawLine = (lineWidth: number, strokeStyle: string) => {
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = strokeStyle;
          ctx.beginPath();
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
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

        // Draw background glow path
        drawLine(6, 'rgba(0, 255, 204, 0.2)');
        // Draw sharp foreground path
        drawLine(2.5, '#00ffcc');
      }
    };

    draw();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, mode]);

  const hasAudioTrack = src !== null && analyser !== null;
  const isBypassedWithoutAnalyser =
    bypassWebAudio && src !== null && analyser === null;

  return (
    <ViewShell data-testid="visualizer-view" title="Visualizer">
      <div className="flex h-full w-full flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">Visualizer</h1>
            <p className="text-muted-foreground text-sm">
              Real-time music spectrum and oscilloscope
            </p>
          </div>

          {hasAudioTrack && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={mode === 'spectrum' ? 'default' : 'text'}
                onClick={() => setMode('spectrum')}
                className="flex items-center gap-2"
              >
                <BarChart3 size={16} />
                Spectrum
              </Button>
              <Button
                size="sm"
                variant={mode === 'oscilloscope' ? 'default' : 'text'}
                onClick={() => setMode('oscilloscope')}
                className="flex items-center gap-2"
              >
                <Activity size={16} />
                Oscilloscope
              </Button>
              <Button
                size="icon-sm"
                variant="text"
                onClick={toggleFullscreen}
                className="ml-2"
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
                title={
                  isBypassedWithoutAnalyser
                    ? 'Web Audio Bypassed'
                    : 'No Audio Stream'
                }
                description={
                  isBypassedWithoutAnalyser
                    ? 'Click anywhere to activate the audio analyser.'
                    : 'Play a song or tune into an online radio station to see real-time visualizations!'
                }
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
