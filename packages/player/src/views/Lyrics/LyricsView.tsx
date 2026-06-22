import { AlignJustify, MicVocal, Music, ScrollText } from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';

import { pickArtwork } from '@nuclearplayer/model';

import { useCurrentQueueItem } from '../../hooks/useCurrentQueueItem';
import { useSoundStore } from '../../stores/soundStore';
import { useVisualizerStore } from '../../stores/visualizerStore';

type LrcLine = { time: number; text: string };

type LyricsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'synced'; lines: LrcLine[] }
  | { status: 'plain'; text: string }
  | { status: 'instrumental' }
  | { status: 'not-found' }
  | { status: 'error'; message?: string };

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
    lines.push({ time: mins * 60 + secs + ms / 1000, text: match[4].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

type LrclibResult = {
  syncedLyrics?: string;
  plainLyrics?: string;
  instrumental?: boolean;
  duration?: number;
};

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

const HEADERS = {
  'Lrclib-Client': 'Fusion Music Player (https://github.com/nukeop/nuclear)',
};

const WaveformCanvas: FC = () => {
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
    const BAR_COUNT = 80;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

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
        grad.addColorStop(0, 'rgba(139,92,246,0.6)');
        grad.addColorStop(0.5, 'rgba(168,85,247,0.4)');
        grad.addColorStop(1, 'rgba(99,202,255,0.25)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(i * barW + 1, h - barH, barW - 2, barH, 3);
        ctx.fill();
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
    />
  );
};

export const LyricsView: FC = () => {
  const currentItem = useCurrentQueueItem();
  const seek = useSoundStore((s) => s.seek);
  const [lyrics, setLyrics] = useState<LyricsState>({ status: 'idle' });
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const track = currentItem?.track;
  const artwork = track?.artwork
    ? pickArtwork(track.artwork, 'cover', 512)
    : null;

  useEffect(() => {
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
    const durationSec = track.durationMs ? track.durationMs / 1000 : null;

    const lrcGet = async (trackName: string, artist: string) => {
      const p = new URLSearchParams({
        track_name: trackName,
        artist_name: artist,
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

    const lrcSearch = async (
      trackName: string,
      artist: string,
    ): Promise<LrclibResult[] | null> => {
      const p = new URLSearchParams({
        track_name: trackName,
        artist_name: artist,
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

    const applyData = (data: LrclibResult) => {
      if (data.instrumental) {
        setLyrics({ status: 'instrumental' });
      } else if (data.syncedLyrics) {
        setLyrics({ status: 'synced', lines: parseLrc(data.syncedLyrics) });
      } else if (data.plainLyrics) {
        setLyrics({ status: 'plain', text: data.plainLyrics });
      } else {
        setLyrics({ status: 'not-found' });
      }
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
        if (
          data &&
          durationSec &&
          data.duration &&
          Math.abs(data.duration - durationSec) > 20
        ) {
          data = null;
        }
        if (data) {
          applyData(data);
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
          applyData(pickBestResult(results, durationSec));
          return;
        }
        setLyrics({ status: 'not-found' });
      } catch (err: unknown) {
        if (!cancelled) {
          setLyrics({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
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

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ background: '#0d0d14' }}
    >
      {artwork?.url && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${artwork.url})`,
              filter: 'blur(60px)',
              transform: 'scale(1.3)',
              opacity: 0.18,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 0%, #0d0d14 70%)',
            }}
          />
        </>
      )}
      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-10 h-24"
        style={{
          background: 'linear-gradient(to bottom, #0d0d14, transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-32"
        style={{ background: 'linear-gradient(to top, #0d0d14, transparent)' }}
      />

      <div className="absolute right-0 bottom-16 left-0 z-20 h-20">
        <WaveformCanvas />
      </div>

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {!track && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Music size={56} style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
              No track playing
            </p>
          </div>
        )}

        {track && (lyrics.status === 'idle' || lyrics.status === 'loading') && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <MicVocal
              size={44}
              className="animate-pulse"
              style={{ color: 'rgba(139,92,246,0.5)' }}
            />
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
              Searching for lyrics…
            </p>
          </div>
        )}

        {track && lyrics.status === 'not-found' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <MicVocal size={48} style={{ color: 'rgba(255,255,255,0.12)' }} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              No lyrics found
            </p>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>
              {track.title} — {track.artists[0]?.name}
            </p>
          </div>
        )}

        {track && lyrics.status === 'instrumental' && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Music size={56} style={{ color: 'rgba(139,92,246,0.3)' }} />
            <p
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.875rem' }}
            >
              Instrumental
            </p>
          </div>
        )}

        {track && lyrics.status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.875rem' }}
            >
              Lyrics unavailable
            </p>
            {lyrics.message && (
              <p
                style={{
                  color: 'rgba(255,255,255,0.15)',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                }}
              >
                {lyrics.message}
              </p>
            )}
          </div>
        )}

        {lyrics.status === 'plain' && (
          <div
            ref={containerRef}
            className="h-full overflow-y-auto select-text"
            style={{
              padding: '3rem 3rem 8rem',
              textAlign: 'center',
              lineHeight: 2,
              color: 'rgba(255,255,255,0.55)',
              fontSize: '0.95rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {lyrics.text}
          </div>
        )}

        {/* Follow mode */}
        {lyrics.status === 'synced' && !showAll && (
          <div
            ref={containerRef}
            className="h-full overflow-y-auto select-text"
            style={{
              padding: '4rem 2rem 9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {lyrics.lines.map((line, i) => {
              const isCurrent = i === currentLineIndex;
              const dist = i - currentLineIndex;
              const isPast = dist < 0;
              const isFar = Math.abs(dist) > 4;

              let opacity = 0.3,
                fontSize = '1rem',
                fontWeight = '400';
              let color = 'rgba(255,255,255,0.3)',
                textShadow = 'none';
              let transform = 'scale(1)',
                marginBottom = '0.2rem';

              if (isCurrent) {
                opacity = 1;
                fontSize = '1.6rem';
                fontWeight = '700';
                color = '#fff';
                textShadow =
                  '0 0 40px rgba(139,92,246,0.9), 0 0 80px rgba(139,92,246,0.4)';
                transform = 'scale(1.02)';
                marginBottom = '0.6rem';
              } else if (dist === 1 || dist === -1) {
                opacity = isPast ? 0.35 : 0.55;
                fontSize = '1.15rem';
                color = isPast
                  ? 'rgba(255,255,255,0.35)'
                  : 'rgba(255,255,255,0.55)';
                marginBottom = '0.3rem';
              } else if (dist === 2 || dist === -2) {
                opacity = isPast ? 0.22 : 0.38;
                fontSize = '1.05rem';
                color = isPast
                  ? 'rgba(255,255,255,0.22)'
                  : 'rgba(255,255,255,0.38)';
              } else if (isFar) {
                opacity = 0.1;
                color = 'rgba(255,255,255,0.1)';
                fontSize = '0.9rem';
              }

              return (
                <div
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  style={{
                    textAlign: 'center',
                    maxWidth: '680px',
                    width: '100%',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'default',
                    lineHeight: 1.3,
                    letterSpacing: isCurrent ? '-0.01em' : '0',
                    opacity,
                    fontSize,
                    fontWeight,
                    color,
                    textShadow,
                    transform,
                    marginBottom,
                    padding: '0.1rem 0',
                  }}
                >
                  {line.text || ' '}
                </div>
              );
            })}
            <div style={{ height: '8rem', flexShrink: 0 }} />
          </div>
        )}

        {/* Show all mode */}
        {lyrics.status === 'synced' && showAll && (
          <div
            ref={containerRef}
            className="h-full overflow-y-auto select-text"
            style={{
              padding: '3rem 3rem 9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
            }}
          >
            {lyrics.lines.map((line, i) => {
              const isCurrent = i === currentLineIndex;
              const isPast = i < currentLineIndex;
              if (!line.text) {
                return <div key={i} style={{ height: '0.75rem' }} />;
              }
              return (
                <div
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  style={{
                    fontSize: isCurrent ? '1.1rem' : '1rem',
                    fontWeight: isCurrent ? '700' : '400',
                    lineHeight: 1.8,
                    cursor: 'default',
                    transition: 'all 0.3s ease',
                    color: isCurrent
                      ? '#fff'
                      : isPast
                        ? 'rgba(255,255,255,0.28)'
                        : 'rgba(255,255,255,0.62)',
                    textShadow: isCurrent
                      ? '0 0 24px rgba(139,92,246,0.8)'
                      : 'none',
                    letterSpacing: isCurrent ? '-0.01em' : '0',
                    paddingLeft: '0.75rem',
                    borderLeft: isCurrent
                      ? '3px solid rgba(139,92,246,0.9)'
                      : '3px solid transparent',
                    marginBottom: isCurrent ? '0.1rem' : '0',
                  }}
                >
                  {line.text}
                </div>
              );
            })}
            <div style={{ height: '8rem', flexShrink: 0 }} />
          </div>
        )}
      </div>

      {/* Bottom bar: track info + toggle */}
      {track && (
        <div className="absolute right-0 bottom-0 left-0 z-30 flex items-center gap-3 px-6 pt-2 pb-4">
          {artwork?.url && (
            <img
              src={artwork.url}
              alt={track.title}
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '0.375rem',
                objectFit: 'cover',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontWeight: 600,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {track.title}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: '0.7rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {track.artists[0]?.name}
            </div>
          </div>
          {lyrics.status === 'synced' && (
            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
              <button
                onClick={() => setShowAll(false)}
                title="Follow song"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.7rem',
                  background: !showAll
                    ? 'rgba(139,92,246,0.25)'
                    : 'rgba(255,255,255,0.05)',
                  color: !showAll
                    ? 'rgba(139,92,246,1)'
                    : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <ScrollText size={11} /> Follow
              </button>
              <button
                onClick={() => setShowAll(true)}
                title="Show all lyrics"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.7rem',
                  background: showAll
                    ? 'rgba(139,92,246,0.25)'
                    : 'rgba(255,255,255,0.05)',
                  color: showAll
                    ? 'rgba(139,92,246,1)'
                    : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <AlignJustify size={11} /> All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
