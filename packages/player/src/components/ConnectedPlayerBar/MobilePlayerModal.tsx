import { Link } from '@tanstack/react-router';
import {
  Activity,
  ChevronDown,
  Heart,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { FC } from 'react';

import { Button, Slider } from '@nuclearplayer/ui';

import { useQueueStore } from '../../stores/queueStore';
import { useSoundStore } from '../../stores/soundStore';

type MobilePlayerModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const MobilePlayerModal: FC<MobilePlayerModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const currentItem = useQueueStore((state) => state.getCurrentItem());
  const goToNext = useQueueStore((state) => state.goToNext);
  const goToPrevious = useQueueStore((state) => state.goToPrevious);
  const track = currentItem?.track;
  const { status, toggle, seek, duration, seekTo } = useSoundStore();
  const isPlaying = status === 'playing';

  const trackTitle = (track as any)?.name || (track as any)?.title || 'No Track Selected';
  const artistName =
    (track as any)?.artist ||
    (track as any)?.artists?.[0]?.name ||
    'Unknown Artist';
  const coverUrl =
    (track as any)?.thumbnail ||
    (track as any)?.album?.artwork?.items?.[0]?.url ||
    (track as any)?.album?.coverImage ||
    '';

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col justify-between p-6 backdrop-blur-2xl md:hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button size="icon" variant="text" onClick={onClose}>
          <ChevronDown size={28} />
        </Button>
        <div className="text-center">
          <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold">
            Playing from Queue
          </div>
          <div className="text-text max-w-[200px] truncate text-sm font-bold">
            {artistName}
          </div>
        </div>
        <Link to="/visualizer" onClick={onClose}>
          <Button size="icon" variant="text" className="text-primary hover:text-foreground" aria-label="Visualizer">
            <Activity size={22} />
          </Button>
        </Link>
      </div>

      {/* Album Artwork */}
      <div className="my-auto flex justify-center px-4 py-6">
        <div className="border-border shadow-2xl relative aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="size-full object-cover select-none"
            />
          ) : (
            <div className="bg-background-secondary text-foreground-secondary flex size-full items-center justify-center text-4xl font-bold">
              🎵
            </div>
          )}
        </div>
      </div>

      {/* Track Details & Favorite */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="min-w-0 flex-1 pr-4">
          <h2 className="text-text truncate text-2xl font-extrabold tracking-tight">
            {trackTitle}
          </h2>
          <p className="text-text-secondary truncate text-base font-medium">
            {artistName}
          </p>
        </div>
        <Button size="icon" variant="text" className="text-primary">
          <Heart size={24} />
        </Button>
      </div>

      {/* Progress / Seek Bar */}
      <div className="mb-6 space-y-1.5 px-2">
        <Slider
          value={seek || 0}
          max={duration || 100}
          step={1}
          onValueChange={(val) => seekTo(val)}
        />
        <div className="text-text-secondary flex justify-between text-xs font-semibold">
          <span>{formatTime(seek || 0)}</span>
          <span>{formatTime(duration || 0)}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="mb-8 flex items-center justify-between px-4">
        <Button size="icon" variant="text" className="text-text-secondary">
          <Shuffle size={22} />
        </Button>
        <Button size="icon" variant="text" onClick={goToPrevious}>
          <SkipBack size={32} />
        </Button>
        <Button
          size="icon"
          onClick={toggle}
          className="bg-primary text-primary-foreground flex size-16 items-center justify-center rounded-full shadow-lg"
        >
          {isPlaying ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
        </Button>
        <Button size="icon" variant="text" onClick={goToNext}>
          <SkipForward size={32} />
        </Button>
        <Button size="icon" variant="text" className="text-text-secondary">
          <Repeat size={22} />
        </Button>
      </div>
    </div>
  );
};
