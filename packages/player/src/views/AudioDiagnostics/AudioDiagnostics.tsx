import { PlayIcon, RefreshCwIcon, SquareIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Button,
  ScrollableArea,
  SectionShell,
  Select,
  Slider,
  Toggle,
  ViewShell,
} from '@nuclearplayer/ui';

import {
  getBluetooth,
  listSinks,
  setCardProfile,
  setDefaultSink,
  type BluetoothInfo,
  type SinkInfo,
} from '../../services/audioDevices';
import { Logger } from '../../services/logger';

const EQ_BANDS = [
  { label: 'Low', type: 'lowshelf' as const, freq: 250 },
  { label: 'Mid', type: 'peaking' as const, freq: 1000 },
  { label: 'High', type: 'highshelf' as const, freq: 4000 },
];

export const AudioDiagnostics = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const eqRef = useRef<BiquadFilterNode[]>([]);
  const rafRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [freq, setFreq] = useState(440);
  const [volume, setVolume] = useState(50);
  const [muted, setMuted] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0]);
  const [level, setLevel] = useState(0);
  const [ctxInfo, setCtxInfo] = useState<{ rate: number; state: string }>({
    rate: 0,
    state: 'none',
  });

  const [sinks, setSinks] = useState<SinkInfo[]>([]);
  const [bt, setBt] = useState<BluetoothInfo | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([listSinks(), getBluetooth()]);
      setSinks(s);
      setBt(b);
    } catch (err) {
      Logger.streaming.error(`Audio device query failed: ${String(err)}`);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;

      const eq = EQ_BANDS.map((band) => {
        const node = ctx.createBiquadFilter();
        node.type = band.type;
        node.frequency.value = band.freq;
        node.gain.value = 0;
        return node;
      });
      eq.reduce<AudioNode>((prev, node) => {
        prev.connect(node);
        return node;
      }, gain);
      eq[eq.length - 1].connect(analyser);
      analyser.connect(ctx.destination);

      ctxRef.current = ctx;
      gainRef.current = gain;
      analyserRef.current = analyser;
      eqRef.current = eq;
    }
    return ctxRef.current;
  }, []);

  const applyGain = useCallback(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = muted ? 0 : volume / 100;
    }
  }, [muted, volume]);

  useEffect(() => {
    applyGain();
  }, [applyGain]);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    setLevel(Math.sqrt(sum / data.length));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    Logger.playback.debug(`[AUDIO] AudioDiagnostics: Starting test tone. Freq: ${freq}Hz, Vol: ${volume}%`);
    const ctx = ensureContext();
    Logger.playback.debug(`[AUDIO] AudioDiagnostics: Resuming AudioContext. State: ${ctx.state}`);
    await ctx.resume();
    Logger.playback.debug(`[AUDIO] AudioDiagnostics: AudioContext state after resume: ${ctx.state}`);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gainRef.current!);
    osc.start();
    oscRef.current = osc;
    applyGain();
    setPlaying(true);
    setCtxInfo({ rate: ctx.sampleRate, state: ctx.state });
    rafRef.current = requestAnimationFrame(tick);
  }, [ensureContext, freq, volume, applyGain, tick]);

  const stop = useCallback(() => {
    Logger.playback.debug(`[AUDIO] AudioDiagnostics: Stopping test tone`);
    oscRef.current?.stop();
    oscRef.current?.disconnect();
    oscRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevel(0);
    setPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      oscRef.current?.stop();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      ctxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (oscRef.current) {
      oscRef.current.frequency.value = freq;
    }
  }, [freq]);

  const setEqBand = (index: number, value: number) => {
    setEqGains((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    const node = eqRef.current[index];
    if (node) {
      node.gain.value = value;
    }
  };

  return (
    <ViewShell
      title="Audio Diagnostics"
      subtitle="Test the output path directly"
    >
      <ScrollableArea className="flex-1 overflow-hidden">
        <div className="flex flex-col gap-4 px-2 pb-6">
          <SectionShell title="Test tone">
            <div className="flex flex-col gap-4 p-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="default"
                  onClick={playing ? stop : start}
                  intent={playing ? 'danger' : undefined}
                >
                  {playing ? <SquareIcon /> : <PlayIcon />}
                  {playing ? 'Stop' : 'Play tone'}
                </Button>
                <div
                  className="bg-background-input h-4 flex-1 overflow-hidden rounded"
                  title="Live output level"
                >
                  <div
                    className="bg-primary h-full transition-[width] duration-75"
                    style={{ width: `${Math.min(100, level * 180)}%` }}
                  />
                </div>
              </div>
              <Slider
                label="Frequency"
                value={freq}
                min={50}
                max={2000}
                step={10}
                unit="Hz"
                showValue
                onValueChange={setFreq}
              />
              <Slider
                label="Volume"
                value={volume}
                min={0}
                max={100}
                step={1}
                unit="%"
                showValue
                onValueChange={setVolume}
              />
              <Toggle label="Mute" checked={muted} onChange={setMuted} />
            </div>
          </SectionShell>

          <SectionShell title="Equalizer">
            <div className="flex flex-col gap-4 p-2">
              {EQ_BANDS.map((band, i) => (
                <Slider
                  key={band.label}
                  label={`${band.label} (${band.freq}Hz)`}
                  value={eqGains[i]}
                  min={-20}
                  max={20}
                  step={1}
                  unit="dB"
                  showValue
                  onValueChange={(v) => setEqBand(i, v)}
                />
              ))}
            </div>
          </SectionShell>

          <SectionShell title="WebAudio output">
            <div className="text-foreground-secondary flex flex-col gap-1 p-2 text-sm">
              <div>
                Context state:{' '}
                <span className="text-foreground">{ctxInfo.state}</span>
              </div>
              <div>
                Sample rate:{' '}
                <span className="text-foreground">
                  {ctxInfo.rate ? `${ctxInfo.rate} Hz` : '—'}
                </span>
              </div>
              <div>
                Output level:{' '}
                <span className="text-foreground">
                  {(level * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </SectionShell>

          <SectionShell title="System output">
            <div className="flex flex-col gap-4 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground-secondary text-sm">
                  Output device
                </span>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={refreshDevices}
                >
                  <RefreshCwIcon />
                </Button>
              </div>
              <Select
                value={sinks.find((s) => s.is_default)?.name}
                options={sinks.map((s) => ({
                  id: s.name,
                  label: s.description,
                }))}
                onValueChange={async (name) => {
                  Logger.playback.debug(`[AUDIO] AudioDiagnostics: Setting default sink to ${name}`);
                  await setDefaultSink(name);
                  refreshDevices();
                }}
              />
              {bt ? (
                <>
                  <span className="text-foreground-secondary text-sm">
                    Bluetooth codec / profile
                  </span>
                  <Select
                    value={bt.active_profile}
                    options={bt.profiles.map((p) => ({
                      id: p.name,
                      label: p.description,
                    }))}
                    onValueChange={async (profile) => {
                      Logger.playback.debug(`[AUDIO] AudioDiagnostics: Setting Bluetooth profile to ${profile}`);
                      await setCardProfile(bt.card_name, profile);
                      setTimeout(refreshDevices, 800);
                    }}
                  />
                  <div className="text-foreground-secondary text-sm">
                    Active codec:{' '}
                    <span className="text-foreground uppercase">
                      {bt.active_codec || '—'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-foreground-secondary text-sm">
                  No Bluetooth audio device connected.
                </div>
              )}
            </div>
          </SectionShell>
        </div>
      </ScrollableArea>
    </ViewShell>
  );
};
