import { Battery, ChevronRight, Pause, Play, X } from 'lucide-react';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFavoritesStore } from '../../stores/favoritesStore';
import { useIpodClassicStore } from '../../stores/ipodClassicStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import { useQueueStore } from '../../stores/queueStore';
import { useSoundStore } from '../../stores/soundStore';
import { getTrackArtworkUrl } from '../../utils/artworkHelper';

type ScreenView =
  | 'main'
  | 'music'
  | 'queue'
  | 'playlists'
  | 'favorites'
  | 'nowPlaying'
  | 'settings';

let audioCtx: AudioContext | null = null;
const playIpodClick = () => {
  try {
    if (!audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      300,
      audioCtx.currentTime + 0.005,
    );
    gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.005);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.006);
  } catch {
    // ignore audio context restrictions
  }
};

export const IpodClassicModal: FC = () => {
  const { isOpen, close, theme, setTheme, soundEnabled, toggleSound } =
    useIpodClassicStore();
  const currentItem = useQueueStore((s) => s.getCurrentItem());
  const queueItems = useQueueStore((s) => s.items);
  const queueIndex = useQueueStore((s) => s.currentIndex);
  const goToNext = useQueueStore((s) => s.goToNext);
  const goToPrevious = useQueueStore((s) => s.goToPrevious);
  const goToIndex = useQueueStore((s) => s.goToIndex);
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const clearQueue = useQueueStore((s) => s.clearQueue);

  const { status, toggle, seek, duration, seekTo, play } = useSoundStore();
  const isPlaying = status === 'playing';

  const favoriteEntries = useFavoritesStore((s) => s.tracks);
  const playlistsIndex = usePlaylistStore((s) => s.index);
  const loadPlaylist = usePlaylistStore((s) => s.loadPlaylist);

  const [currentView, setCurrentView] = useState<ScreenView>('main');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const track = currentItem?.track;
  const coverUrl = getTrackArtworkUrl(track);

  const trackTitle = track?.title || 'No Track Playing';
  const artistName = track?.artists?.[0]?.name || 'Unknown Artist';
  const albumName = 'Fusion Player';

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) {
      return '0:00';
    }
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const remainingTime = duration && seek ? duration - seek : 0;

  const playClick = useCallback(() => {
    if (soundEnabled) {
      playIpodClick();
    }
  }, [soundEnabled]);

  // Main Menu Items
  const mainMenuItems = useMemo(() => {
    const items = [
      { id: 'nowPlaying', label: 'Now Playing' },
      { id: 'music', label: 'Music' },
      { id: 'queue', label: `Queue (${queueItems.length})` },
      { id: 'playlists', label: `Playlists (${playlistsIndex.length})` },
      { id: 'favorites', label: `Favorites (${favoriteEntries.length})` },
      { id: 'shuffle', label: 'Shuffle All' },
      { id: 'settings', label: 'Settings' },
    ];
    return items;
  }, [queueItems.length, playlistsIndex.length, favoriteEntries.length]);

  const musicMenuItems = useMemo(
    () => [
      { id: 'queue', label: 'Current Queue' },
      { id: 'playlists', label: 'Playlists' },
      { id: 'favorites', label: 'Favorites' },
    ],
    [],
  );

  const settingsMenuItems = useMemo(
    () => [
      {
        id: 'theme',
        label: `Theme: ${theme === 'classic' ? 'Silver / White' : 'U2 / Black'}`,
      },
      {
        id: 'sound',
        label: `Click Wheel Sound: ${soundEnabled ? 'ON' : 'OFF'}`,
      },
      { id: 'exit', label: 'Exit to Fusion Player' },
    ],
    [theme, soundEnabled],
  );

  const getActiveListLength = useCallback(() => {
    switch (currentView) {
      case 'main':
        return mainMenuItems.length;
      case 'music':
        return musicMenuItems.length;
      case 'queue':
        return queueItems.length;
      case 'playlists':
        return playlistsIndex.length;
      case 'favorites':
        return favoriteEntries.length;
      case 'settings':
        return settingsMenuItems.length;
      default:
        return 0;
    }
  }, [
    currentView,
    mainMenuItems.length,
    musicMenuItems.length,
    queueItems.length,
    playlistsIndex.length,
    favoriteEntries.length,
    settingsMenuItems.length,
  ]);

  const scrollSelection = useCallback(
    (direction: 1 | -1) => {
      const total = getActiveListLength();
      if (total === 0) {
        return;
      }
      playClick();
      setSelectedIndex((prev) => {
        let next = prev + direction;
        if (next < 0) {
          next = total - 1;
        }
        if (next >= total) {
          next = 0;
        }
        return next;
      });
    },
    [getActiveListLength, playClick],
  );

  // Handle select button
  const handleSelect = useCallback(async () => {
    playClick();
    if (currentView === 'main') {
      const selected = mainMenuItems[selectedIndex];
      if (!selected) {
        return;
      }
      if (selected.id === 'nowPlaying') {
        setCurrentView('nowPlaying');
      } else if (selected.id === 'music') {
        setCurrentView('music');
        setSelectedIndex(0);
      } else if (selected.id === 'queue') {
        setCurrentView('queue');
        setSelectedIndex(queueIndex >= 0 ? queueIndex : 0);
      } else if (selected.id === 'playlists') {
        setCurrentView('playlists');
        setSelectedIndex(0);
      } else if (selected.id === 'favorites') {
        setCurrentView('favorites');
        setSelectedIndex(0);
      } else if (selected.id === 'shuffle') {
        if (queueItems.length > 0) {
          const shuffledIndex = Math.floor(Math.random() * queueItems.length);
          goToIndex(shuffledIndex);
          play();
          setCurrentView('nowPlaying');
        }
      } else if (selected.id === 'settings') {
        setCurrentView('settings');
        setSelectedIndex(0);
      }
    } else if (currentView === 'music') {
      const selected = musicMenuItems[selectedIndex];
      if (!selected) {
        return;
      }
      if (selected.id === 'queue') {
        setCurrentView('queue');
        setSelectedIndex(queueIndex >= 0 ? queueIndex : 0);
      } else if (selected.id === 'playlists') {
        setCurrentView('playlists');
        setSelectedIndex(0);
      } else if (selected.id === 'favorites') {
        setCurrentView('favorites');
        setSelectedIndex(0);
      }
    } else if (currentView === 'queue') {
      if (selectedIndex >= 0 && selectedIndex < queueItems.length) {
        goToIndex(selectedIndex);
        play();
        setCurrentView('nowPlaying');
      }
    } else if (currentView === 'playlists') {
      const plItem = playlistsIndex[selectedIndex];
      if (plItem) {
        const fullPlaylist = await loadPlaylist(plItem.id);
        if (
          fullPlaylist &&
          fullPlaylist.items &&
          fullPlaylist.items.length > 0
        ) {
          const tracks = fullPlaylist.items.map((it) => it.track);
          clearQueue();
          addToQueue(tracks);
          goToIndex(0);
          play();
          setCurrentView('nowPlaying');
        }
      }
    } else if (currentView === 'favorites') {
      const fav = favoriteEntries[selectedIndex];
      if (fav && fav.ref) {
        const tracks = favoriteEntries.map((e) => e.ref);
        clearQueue();
        addToQueue(tracks);
        goToIndex(selectedIndex);
        play();
        setCurrentView('nowPlaying');
      }
    } else if (currentView === 'settings') {
      const selected = settingsMenuItems[selectedIndex];
      if (!selected) {
        return;
      }
      if (selected.id === 'theme') {
        setTheme(theme === 'classic' ? 'black' : 'classic');
      } else if (selected.id === 'sound') {
        toggleSound();
      } else if (selected.id === 'exit') {
        close();
      }
    } else if (currentView === 'nowPlaying') {
      toggle();
    }
  }, [
    currentView,
    selectedIndex,
    mainMenuItems,
    musicMenuItems,
    settingsMenuItems,
    queueItems,
    queueIndex,
    playlistsIndex,
    favoriteEntries,
    theme,
    setTheme,
    toggleSound,
    close,
    playClick,
    goToIndex,
    play,
    toggle,
    loadPlaylist,
    clearQueue,
    addToQueue,
  ]);

  // Handle Menu button (go back)
  const handleMenu = useCallback(() => {
    playClick();
    if (currentView === 'nowPlaying') {
      setCurrentView('main');
      setSelectedIndex(0);
    } else if (
      currentView === 'music' ||
      currentView === 'queue' ||
      currentView === 'playlists' ||
      currentView === 'favorites' ||
      currentView === 'settings'
    ) {
      setCurrentView('main');
      setSelectedIndex(0);
    } else if (currentView === 'main') {
      if (track) {
        setCurrentView('nowPlaying');
      }
    }
  }, [currentView, track, playClick]);

  // Handle Previous button
  const handlePrevButton = useCallback(() => {
    playClick();
    if (currentView === 'nowPlaying') {
      goToPrevious();
    } else {
      scrollSelection(-1);
    }
  }, [currentView, goToPrevious, scrollSelection, playClick]);

  // Handle Next button
  const handleNextButton = useCallback(() => {
    playClick();
    if (currentView === 'nowPlaying') {
      goToNext();
    } else {
      scrollSelection(1);
    }
  }, [currentView, goToNext, scrollSelection, playClick]);

  // Handle Play/Pause button
  const handlePlayPause = useCallback(() => {
    playClick();
    toggle();
  }, [toggle, playClick]);

  // Rotary Click Wheel tracking
  const wheelRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number | null>(null);
  const angleAccumulatorRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  const getAngle = (clientX: number, clientY: number) => {
    if (!wheelRef.current) {
      return 0;
    }
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.role === 'center') {
      return;
    }

    isDraggingRef.current = true;
    lastAngleRef.current = getAngle(e.clientX, e.clientY);
    angleAccumulatorRef.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || lastAngleRef.current === null) {
      return;
    }
    const currentAngle = getAngle(e.clientX, e.clientY);
    let diff = currentAngle - lastAngleRef.current;

    // Handle wrapping around PI / -PI
    if (diff > Math.PI) {
      diff -= 2 * Math.PI;
    }
    if (diff < -Math.PI) {
      diff += 2 * Math.PI;
    }

    angleAccumulatorRef.current += diff;
    lastAngleRef.current = currentAngle;

    // Trigger step every ~18 degrees (0.31 radians)
    const STEP_THRESHOLD = 0.28;
    if (Math.abs(angleAccumulatorRef.current) >= STEP_THRESHOLD) {
      const step = angleAccumulatorRef.current > 0 ? 1 : -1;
      angleAccumulatorRef.current = 0;

      if (currentView === 'nowPlaying') {
        if (duration > 0) {
          const newTime = Math.max(0, Math.min(duration, seek + step * 5));
          seekTo(newTime);
          playClick();
        }
      } else {
        scrollSelection(step as 1 | -1);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    lastAngleRef.current = null;
    angleAccumulatorRef.current = 0;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowUp') {
        scrollSelection(-1);
      } else if (e.key === 'ArrowDown') {
        scrollSelection(1);
      } else if (e.key === 'Enter') {
        handleSelect();
      } else if (e.key === 'Backspace') {
        handleMenu();
      } else if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === 'ArrowLeft') {
        handlePrevButton();
      } else if (e.key === 'ArrowRight') {
        handleNextButton();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    close,
    scrollSelection,
    handleSelect,
    handleMenu,
    handlePlayPause,
    handlePrevButton,
    handleNextButton,
  ]);

  // Keep selected item in view
  const activeItemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, currentView]);

  if (!isOpen) {
    return null;
  }

  const isClassicTheme = theme === 'classic';

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-md duration-200 select-none md:p-6">
      {/* iPod Chassis Container */}
      <div
        className={`relative flex flex-col justify-between rounded-[40px] border shadow-2xl transition-all duration-300 ${
          isClassicTheme
            ? 'border-[#c8c8c8] bg-gradient-to-b from-[#f3f4f6] via-[#e5e7eb] to-[#d1d5db] text-slate-800'
            : 'border-[#333333] bg-gradient-to-b from-[#222222] via-[#161616] to-[#0a0a0a] text-zinc-100'
        }`}
        style={{
          width: 'min(380px, 94vw)',
          height: 'min(640px, 92vh)',
          boxShadow: isClassicTheme
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.8), inset 0 -4px 8px rgba(0, 0, 0, 0.15)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.9), inset 0 2px 3px rgba(255, 255, 255, 0.1), inset 0 -4px 10px rgba(0, 0, 0, 0.8)',
          padding: '24px 20px',
        }}
      >
        {/* Top bar controls */}
        <div className="absolute top-3 right-4 flex items-center gap-2">
          <button
            onClick={() => setTheme(isClassicTheme ? 'black' : 'classic')}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
              isClassicTheme
                ? 'border-gray-400 bg-white/70 text-gray-700 hover:bg-white'
                : 'border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Toggle Silver / U2 Black Theme"
          >
            {isClassicTheme ? 'Silver' : 'Black'}
          </button>
          <button
            onClick={close}
            className={`flex size-6 items-center justify-center rounded-full transition-colors ${
              isClassicTheme
                ? 'text-gray-600 hover:bg-black/10'
                : 'text-zinc-400 hover:bg-white/10'
            }`}
            title="Close iPod"
          >
            <X size={16} />
          </button>
        </div>

        {/* 1. LCD Screen */}
        <div
          className="relative mx-auto flex w-full flex-col overflow-hidden rounded-xl border border-[#9ca3af]/40 bg-[#f0f4f8] shadow-inner"
          style={{
            height: '240px',
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Chicago", sans-serif',
          }}
        >
          {/* LCD Header Bar */}
          <div className="flex h-6 w-full shrink-0 items-center justify-between border-b border-[#cbd5e1] bg-gradient-to-b from-[#e2e8f0] via-[#cbd5e1] to-[#94a3b8] px-2.5 text-[11px] font-bold text-[#1e293b]">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate">
                {currentView === 'main'
                  ? 'iPod'
                  : currentView === 'nowPlaying'
                    ? 'Now Playing'
                    : currentView === 'queue'
                      ? 'Queue'
                      : currentView === 'playlists'
                        ? 'Playlists'
                        : currentView === 'favorites'
                          ? 'Favorites'
                          : currentView === 'settings'
                            ? 'Settings'
                            : 'Music'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isPlaying ? (
                <Play size={9} fill="currentColor" />
              ) : (
                <Pause size={9} fill="currentColor" />
              )}
              <Battery size={13} />
            </div>
          </div>

          {/* Screen Content Body */}
          <div className="relative flex flex-1 overflow-hidden bg-white text-[#0f172a]">
            {/* View: Now Playing */}
            {currentView === 'nowPlaying' && (
              <div className="flex size-full flex-col justify-between p-3">
                <div className="flex gap-3">
                  {/* Album Artwork with subtle reflection */}
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-sm border border-gray-300 shadow-md">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-gray-200 text-xl font-bold text-gray-400">
                        🎵
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
                    <div className="text-[10px] font-semibold text-gray-500">
                      {queueIndex >= 0
                        ? `${queueIndex + 1} of ${queueItems.length}`
                        : 'Now Playing'}
                    </div>
                    <div
                      className="truncate text-xs leading-snug font-bold text-gray-900"
                      title={trackTitle}
                    >
                      {trackTitle}
                    </div>
                    <div
                      className="truncate text-[11px] font-medium text-gray-700"
                      title={artistName}
                    >
                      {artistName}
                    </div>
                    <div
                      className="truncate text-[10px] text-gray-500"
                      title={albumName}
                    >
                      {albumName}
                    </div>
                  </div>
                </div>

                {/* Retro Scrubber Progress Bar */}
                <div className="mt-2 flex flex-col gap-1">
                  <div className="relative h-2 w-full overflow-hidden rounded-full border border-gray-400 bg-gray-200">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-150"
                      style={{
                        width:
                          duration > 0
                            ? `${Math.min(100, Math.max(0, (seek / duration) * 100))}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-semibold text-gray-600">
                    <span>{formatTime(seek)}</span>
                    <span>-{formatTime(remainingTime)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* View: Main Menu (Split Screen) */}
            {currentView === 'main' && (
              <div className="flex size-full">
                {/* Left: Menu Items */}
                <div className="w-1/2 overflow-y-auto border-r border-gray-200 [scrollbar-width:none]">
                  {mainMenuItems.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <div
                        key={item.id}
                        ref={isSelected ? activeItemRef : null}
                        onClick={() => {
                          setSelectedIndex(idx);
                          handleSelect();
                        }}
                        className={`flex cursor-pointer items-center justify-between px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                          isSelected
                            ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white shadow-sm'
                            : 'text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <ChevronRight
                          size={11}
                          className={
                            isSelected ? 'text-white' : 'text-gray-400'
                          }
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Right: Album Artwork or iPod Logo Preview */}
                <div className="flex w-1/2 items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-2">
                  {coverUrl ? (
                    <div className="size-24 overflow-hidden rounded-sm border border-gray-300 shadow-md">
                      <img
                        src={coverUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl"></div>
                      <div className="text-[10px] font-bold text-gray-400">
                        Fusion iPod
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* View: Submenus / Lists (Music, Queue, Playlists, Favorites, Settings) */}
            {currentView !== 'nowPlaying' && currentView !== 'main' && (
              <div className="flex size-full flex-col overflow-y-auto [scrollbar-width:none]">
                {currentView === 'music' &&
                  musicMenuItems.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <div
                        key={item.id}
                        ref={isSelected ? activeItemRef : null}
                        onClick={() => {
                          setSelectedIndex(idx);
                          handleSelect();
                        }}
                        className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-[11px] font-bold ${
                          isSelected
                            ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white'
                            : 'text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <ChevronRight
                          size={11}
                          className={
                            isSelected ? 'text-white' : 'text-gray-400'
                          }
                        />
                      </div>
                    );
                  })}

                {currentView === 'queue' &&
                  queueItems.map((qItem, idx) => {
                    const isSelected = selectedIndex === idx;
                    const isCurrentPlaying = queueIndex === idx;
                    const title = qItem.track.title || 'Unknown';
                    const artist = qItem.track.artists?.[0]?.name || '';
                    return (
                      <div
                        key={qItem.id}
                        ref={isSelected ? activeItemRef : null}
                        onClick={() => {
                          setSelectedIndex(idx);
                          handleSelect();
                        }}
                        className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-[11px] ${
                          isSelected
                            ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] font-bold text-white'
                            : 'text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          {isCurrentPlaying && (
                            <span className="shrink-0 text-[10px] font-black text-emerald-600">
                              ▶
                            </span>
                          )}
                          <span className="truncate">{title}</span>
                          {artist && (
                            <span
                              className={`truncate text-[9px] ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}
                            >
                              - {artist}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {currentView === 'playlists' &&
                  (playlistsIndex.length === 0 ? (
                    <div className="flex size-full items-center justify-center p-4 text-xs font-bold text-gray-400">
                      No Playlists Found
                    </div>
                  ) : (
                    playlistsIndex.map((pl, idx) => {
                      const isSelected = selectedIndex === idx;
                      return (
                        <div
                          key={pl.id}
                          ref={isSelected ? activeItemRef : null}
                          onClick={() => {
                            setSelectedIndex(idx);
                            handleSelect();
                          }}
                          className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-[11px] font-bold ${
                            isSelected
                              ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white'
                              : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <span className="truncate">{pl.name}</span>
                          <ChevronRight
                            size={11}
                            className={
                              isSelected ? 'text-white' : 'text-gray-400'
                            }
                          />
                        </div>
                      );
                    })
                  ))}

                {currentView === 'favorites' &&
                  (favoriteEntries.length === 0 ? (
                    <div className="flex size-full items-center justify-center p-4 text-xs font-bold text-gray-400">
                      No Favorites Added
                    </div>
                  ) : (
                    favoriteEntries.map((entry, idx) => {
                      const isSelected = selectedIndex === idx;
                      const title = entry.ref?.title || 'Unknown';
                      const artist = entry.ref?.artists?.[0]?.name || '';
                      return (
                        <div
                          key={entry.ref?.source?.id || idx}
                          ref={isSelected ? activeItemRef : null}
                          onClick={() => {
                            setSelectedIndex(idx);
                            handleSelect();
                          }}
                          className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-[11px] ${
                            isSelected
                              ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] font-bold text-white'
                              : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="truncate font-bold">{title}</span>
                            {artist && (
                              <span
                                className={`truncate text-[9px] ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}
                              >
                                - {artist}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ))}

                {currentView === 'settings' &&
                  settingsMenuItems.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <div
                        key={item.id}
                        ref={isSelected ? activeItemRef : null}
                        onClick={() => {
                          setSelectedIndex(idx);
                          handleSelect();
                        }}
                        className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-[11px] font-bold ${
                          isSelected
                            ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white'
                            : 'text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <ChevronRight
                          size={11}
                          className={
                            isSelected ? 'text-white' : 'text-gray-400'
                          }
                        />
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* 2. The Iconic Click Wheel */}
        <div className="my-auto flex items-center justify-center pt-2">
          <div
            ref={wheelRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={(e) => {
              e.preventDefault();
              scrollSelection(e.deltaY > 0 ? 1 : -1);
            }}
            className={`relative size-56 touch-none rounded-full transition-shadow select-none ${
              isClassicTheme
                ? 'bg-[#ffffff] shadow-[0_6px_16px_rgba(0,0,0,0.18),inset_0_2px_4px_rgba(255,255,255,0.9),inset_0_-2px_6px_rgba(0,0,0,0.08)]'
                : 'bg-[#1e1e1e] shadow-[0_6px_20px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-2px_6px_rgba(0,0,0,0.8)]'
            }`}
          >
            {/* MENU (Top) */}
            <button
              onClick={handleMenu}
              className={`absolute top-2.5 left-1/2 -translate-x-1/2 text-xs font-black tracking-wider transition-opacity hover:opacity-80 active:scale-95 ${
                isClassicTheme ? 'text-[#9ca3af]' : 'text-zinc-400'
              }`}
            >
              MENU
            </button>

            {/* PREVIOUS / REWIND |<< (Left) */}
            <button
              onClick={handlePrevButton}
              className={`absolute top-1/2 left-3 -translate-y-1/2 text-sm font-black transition-opacity hover:opacity-80 active:scale-95 ${
                isClassicTheme ? 'text-[#9ca3af]' : 'text-zinc-400'
              }`}
            >
              |◀◀
            </button>

            {/* NEXT / FORWARD >>| (Right) */}
            <button
              onClick={handleNextButton}
              className={`absolute top-1/2 right-3 -translate-y-1/2 text-sm font-black transition-opacity hover:opacity-80 active:scale-95 ${
                isClassicTheme ? 'text-[#9ca3af]' : 'text-zinc-400'
              }`}
            >
              ▶▶|
            </button>

            {/* PLAY / PAUSE ▶|| (Bottom) */}
            <button
              onClick={handlePlayPause}
              className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 text-sm font-black transition-opacity hover:opacity-80 active:scale-95 ${
                isClassicTheme ? 'text-[#9ca3af]' : 'text-zinc-400'
              }`}
            >
              ▶||
            </button>

            {/* Center SELECT Button */}
            <button
              data-role="center"
              onClick={handleSelect}
              className={`absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform active:scale-95 ${
                isClassicTheme
                  ? 'bg-gradient-to-b from-[#f3f4f6] to-[#e5e7eb] shadow-[inset_0_2px_4px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)]'
                  : 'bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_2px_4px_rgba(0,0,0,0.4)]'
              }`}
              title="Select"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
