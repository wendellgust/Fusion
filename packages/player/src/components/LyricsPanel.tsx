import { AlignJustify, MicVocal, Music, ScrollText } from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';

import { useCurrentQueueItem } from '../hooks/useCurrentQueueItem';
import { useSoundStore } from '../stores/soundStore';
import { useVisualizerStore } from '../stores/visualizerStore';

const WaveformBar: FC = () => {
  const analyser = useVisualizerStore((s) => s.analyser);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let raf: number;
    const BAR_COUNT = 48;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      analyser.getByteFrequencyData(dataArray);
      const binsPerBar = Math.floor(bufferLength / BAR_COUNT);
      const barW = w / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < binsPerBar; j++) {
          sum += dataArray[i * binsPerBar + j];
        }
        const val = sum / binsPerBar / 255;
        const barH = val * h * 0.85;
        if (barH < 1) {
          continue;
        }

        const grad = ctx.createLinearGradient(0, h, 0, h - barH);
        grad.addColorStop(0, 'rgba(139,92,246,0.7)');
        grad.addColorStop(1, 'rgba(99,202,255,0.4)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(i * barW + 1, h - barH, barW - 2, barH, 2);
        ctx.fill();
      }
    };

    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser]);

  if (!analyser) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-14">
      <div className="from-background-secondary/80 absolute inset-0 bg-gradient-to-t to-transparent" />
      <canvas
        ref={canvasRef}
        className="absolute bottom-0 left-0 h-full w-full"
      />
    </div>
  );
};

type LrcLine = {
  time: number;
  text: string;
};

type LyricsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'synced'; lines: LrcLine[] }
  | { status: 'plain'; text: string }
  | { status: 'instrumental' }
  | { status: 'not-found' }
  | { status: 'error'; message?: string };

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](feat|ft|with|featuring)[^)\]]*[)\]]/gi, '')
    .replace(
      /\s*-\s*(remaster(ed)?|radio edit|album version|single version|live|acoustic|demo|explicit|clean|deluxe|extended|version)\b.*/gi,
      '',
    )
    .replace(
      /\s*[([](remaster(ed)?|radio edit|album version|single version|live|acoustic|demo|explicit|clean|deluxe|extended)\b[^)]*[)\]]/gi,
      '',
    )
    .trim();
}

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split('\n')) {
    const match = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!match) {
      continue;
    }
    const mins = parseInt(match[1]);
    const secs = parseInt(match[2]);
    const ms = parseInt(match[3].padEnd(3, '0'));
    const time = mins * 60 + secs + ms / 1000;
    const text = match[4].trim();
    lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

const HEADERS = {
  'Lrclib-Client': 'Fusion Music Player (https://github.com/nukeop/nuclear)',
};

type LrclibResult = {
  syncedLyrics?: string;
  plainLyrics?: string;
  instrumental?: boolean;
  duration?: number;
};

function pickBestResult(
  results: LrclibResult[],
  durationSec: number | null,
): LrclibResult {
  if (!results.length) {
    return results[0];
  }
  if (durationSec === null) {
    return results.find((r) => r.syncedLyrics) ?? results[0];
  }
  const TOLERANCE = 15;
  const matching = results.filter(
    (r) => Math.abs((r.duration ?? 0) - durationSec) <= TOLERANCE,
  );
  const pool =
    matching.length > 0
      ? matching
      : [...results].sort(
          (a, b) =>
            Math.abs((a.duration ?? 999) - durationSec) -
            Math.abs((b.duration ?? 999) - durationSec),
        );
  return pool.find((r) => r.syncedLyrics) ?? pool[0];
}

function applyData(data: LrclibResult, set: (s: LyricsState) => void) {
  if (data.instrumental) {
    set({ status: 'instrumental' });
  } else if (data.syncedLyrics) {
    set({ status: 'synced', lines: parseLrc(data.syncedLyrics) });
  } else if (data.plainLyrics) {
    set({ status: 'plain', text: data.plainLyrics });
  } else {
    set({ status: 'not-found' });
  }
}

export const LyricsPanel: FC = () => {
  const currentItem = useCurrentQueueItem();
  const seek = useSoundStore((s) => s.seek);
  const [lyrics, setLyrics] = useState<LyricsState>({ status: 'idle' });
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = currentItem?.track;
    if (!track) {
      setLyrics({ status: 'idle' });
      setCurrentLineIndex(-1);
      return;
    }

    let cancelled = false;
    setLyrics({ status: 'loading' });
    setCurrentLineIndex(-1);

    const artistName = track.artists[0]?.name ?? '';
    const cleanedTitle = cleanTitle(track.title);

    const lrcSearch = async (
      trackName: string,
      artistName: string,
    ): Promise<LrclibResult[] | null> => {
      const p = new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
      });
      const r = await fetch(`https://lrclib.net/api/search?${p}`, {
        headers: HEADERS,
      });
      if (!r.ok) {
        return null;
      }
      const results = (await r.json()) as LrclibResult[];
      return Array.isArray(results) && results.length > 0 ? results : null;
    };

    const lrcGet = async (
      trackName: string,
      artistName: string,
    ): Promise<LrclibResult | null> => {
      const p = new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
      });
      if (track.album?.title) {
        p.set('album_name', track.album.title);
      }
      if (track.durationMs) {
        p.set('duration', String(Math.round(track.durationMs / 1000)));
      }
      const r = await fetch(`https://lrclib.net/api/get?${p}`, {
        headers: HEADERS,
      });
      if (r.status === 404) {
        return null;
      }
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r.json() as Promise<LrclibResult>;
    };

    (async () => {
      try {
        let data = await lrcGet(track.title, artistName);
        if (cancelled) {
          return;
        }

        if (!data && cleanedTitle !== track.title) {
          data = await lrcGet(cleanedTitle, artistName);
          if (cancelled) {
            return;
          }
        }

        const durationSec = track.durationMs ? track.durationMs / 1000 : null;
        if (
          data &&
          durationSec &&
          data.duration &&
          Math.abs(data.duration - durationSec) > 20
        ) {
          data = null;
        }
        if (data) {
          applyData(data, setLyrics);
          return;
        }

        let results = await lrcSearch(cleanedTitle, artistName);
        if (cancelled) {
          return;
        }

        if (!results && cleanedTitle !== track.title) {
          results = await lrcSearch(track.title, artistName);
          if (cancelled) {
            return;
          }
        }

        if (!results) {
          results = await lrcSearch(cleanedTitle, '');
          if (cancelled) {
            return;
          }
        }

        if (results) {
          applyData(pickBestResult(results, durationSec), setLyrics);
          return;
        }

        setLyrics({ status: 'not-found' });
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        console.error('[LyricsPanel]', err);
        setLyrics({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentItem?.id]);

  useEffect(() => {
    if (lyrics.status !== 'synced') {
      return;
    }
    const { lines } = lyrics;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= seek) {
        idx = i;
      } else {
        break;
      }
    }
    setCurrentLineIndex(idx);
  }, [seek, lyrics]);

  useEffect(() => {
    if (showAll || currentLineIndex < 0) {
      return;
    }
    lineRefs.current[currentLineIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [currentLineIndex, showAll]);

  if (!currentItem) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <Music size={40} className="text-foreground-secondary opacity-40" />
        <p className="text-foreground-secondary text-sm">No track playing</p>
      </div>
    );
  }

  if (lyrics.status === 'idle' || lyrics.status === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <MicVocal
          size={32}
          className="text-foreground-secondary animate-pulse opacity-40"
        />
        <p className="text-foreground-secondary text-sm">Loading lyrics…</p>
      </div>
    );
  }

  if (lyrics.status === 'not-found') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <MicVocal size={40} className="text-foreground-secondary opacity-40" />
        <p className="text-foreground-secondary text-sm font-medium">
          No lyrics found
        </p>
        <p className="text-foreground-secondary text-xs opacity-60">
          {currentItem.track.title} — {currentItem.track.artists[0]?.name}
        </p>
      </div>
    );
  }

  if (lyrics.status === 'instrumental') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <Music size={40} className="text-foreground-secondary opacity-40" />
        <p className="text-foreground-secondary text-sm font-medium">
          Instrumental
        </p>
      </div>
    );
  }

  if (lyrics.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-foreground-secondary text-sm">
          Failed to load lyrics
        </p>
        {lyrics.message && (
          <p className="text-foreground-secondary font-mono text-xs break-all opacity-60">
            {lyrics.message}
          </p>
        )}
      </div>
    );
  }

  if (lyrics.status === 'plain') {
    return (
      <div className="relative h-full">
        <div
          ref={containerRef}
          className="text-foreground-secondary h-full overflow-y-auto px-4 py-6 pb-16 text-sm leading-relaxed whitespace-pre-wrap select-text"
        >
          {lyrics.text}
        </div>
        <WaveformBar />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-end gap-1 px-3 pt-2 pb-1">
        <button
          title="Follow song"
          onClick={() => setShowAll(false)}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${!showAll ? 'bg-primary/20 text-primary' : 'text-foreground-secondary hover:text-foreground'}`}
        >
          <ScrollText size={11} />
          Follow
        </button>
        <button
          title="Show all lyrics"
          onClick={() => setShowAll(true)}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${showAll ? 'bg-primary/20 text-primary' : 'text-foreground-secondary hover:text-foreground'}`}
        >
          <AlignJustify size={11} />
          All
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {showAll ? (
          <div
            ref={containerRef}
            className="flex h-full flex-col gap-0.5 overflow-y-auto px-4 py-3 pb-16 select-text"
          >
            {lyrics.lines.map((line, i) => {
              const isCurrent = i === currentLineIndex;
              const isPast = i < currentLineIndex;
              if (!line.text) {
                return <div key={i} className="h-2" />;
              }
              return (
                <div
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`cursor-default py-0.5 text-sm leading-relaxed transition-colors duration-200 ${
                    isCurrent
                      ? 'text-primary font-semibold'
                      : isPast
                        ? 'text-foreground-secondary opacity-35'
                        : 'text-foreground-secondary opacity-75'
                  }`}
                  style={
                    isCurrent
                      ? { textShadow: '0 0 10px rgba(139,92,246,0.5)' }
                      : undefined
                  }
                >
                  {line.text}
                </div>
              );
            })}
            <div className="h-20 shrink-0" />
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex h-full flex-col gap-2 overflow-y-auto px-4 py-8 pb-16"
          >
            {lyrics.lines.map((line, i) => {
              const isCurrent = i === currentLineIndex;
              const isPast = i < currentLineIndex;
              return (
                <div
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`cursor-default leading-snug font-medium transition-all duration-300 select-text ${
                    isCurrent
                      ? 'text-foreground origin-left scale-[1.02] text-base font-bold'
                      : isPast
                        ? 'text-foreground-secondary text-sm opacity-50'
                        : 'text-foreground-secondary text-sm opacity-70'
                  }`}
                  style={
                    isCurrent
                      ? { textShadow: '0 0 16px rgba(139,92,246,0.6)' }
                      : undefined
                  }
                >
                  {line.text || ' '}
                </div>
              );
            })}
            <div className="h-20 shrink-0" />
          </div>
        )}
        <WaveformBar />
      </div>
    </div>
  );
};
