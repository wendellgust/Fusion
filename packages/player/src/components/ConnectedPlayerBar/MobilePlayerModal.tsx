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

import { useFavoritesStore } from '../../stores/favoritesStore';
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
  if (!isOpen) {
    return null;
  }

  const currentItem = useQueueStore((state) => state.getCurrentItem());
  const goToNext = useQueueStore((state) => state.goToNext);
  const goToPrevious = useQueueStore((state) => state.goToPrevious);
  const track = currentItem?.track;
  const { status, toggle, seek, duration, seekTo } = useSoundStore();
  const isPlaying = status === 'playing';

  const isFavorite = track?.source
    ? useFavoritesStore((s) => s.isTrackFavorite(track.source))
    : false;
  const addTrack = useFavoritesStore((s) => s.addTrack);
  const removeTrack = useFavoritesStore((s) => s.removeTrack);

  const handleToggleFavorite = () => {
    if (!track) {
      return;
    }
    if (isFavorite) {
      removeTrack(track.source);
    } else {
      addTrack(track);
    }
  };

  const trackRecord = track as unknown as
    | {
        name?: string;
        title?: string;
        artist?: string;
        artists?: Array<{ name: string }>;
        thumbnail?: string;
        album?: {
          artwork?: { items?: Array<{ url: string }> };
          coverImage?: string;
        };
      }
    | undefined;

  const trackTitle =
    trackRecord?.title || trackRecord?.name || 'No Track Selected';
  const artistName =
    trackRecord?.artist || trackRecord?.artists?.[0]?.name || 'Unknown Artist';
  const coverUrl =
    trackRecord?.thumbnail ||
    trackRecord?.album?.artwork?.items?.[0]?.url ||
    trackRecord?.album?.coverImage ||
    '';

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-background/98 fixed inset-0 z-50 flex flex-col justify-between p-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-2xl select-none md:hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          size="icon"
          variant="text"
          onClick={onClose}
          className="text-foreground"
        >
          <ChevronDown size={28} />
        </Button>
        <div className="text-center">
          <div className="text-text-secondary text-xs font-semibold tracking-wider uppercase">
            Playing from Queue
          </div>
          <div className="text-text max-w-[200px] truncate text-sm font-bold">
            {artistName}
          </div>
        </div>
        <Link to="/visualizer" onClick={onClose}>
          <Button
            size="icon"
            variant="text"
            className="text-primary hover:text-foreground"
            aria-label="Visualizer"
          >
            <Activity size={22} />
          </Button>
        </Link>
      </div>

      {/* Album Artwork */}
      <div className="my-auto flex justify-center px-4 py-4">
        <div className="border-border relative aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border shadow-2xl">
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
          <h2 className="text-text truncate text-xl font-extrabold tracking-tight">
            {trackTitle}
          </h2>
          <p className="text-text-secondary truncate text-sm font-medium">
            {artistName}
          </p>
        </div>
        <Button
          size="icon"
          variant="text"
          onClick={handleToggleFavorite}
          className={
            isFavorite
              ? 'text-red-500 hover:text-red-600'
              : 'text-foreground-secondary hover:text-foreground'
          }
        >
          <Heart size={26} className={isFavorite ? 'fill-current' : ''} />
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
          {isPlaying ? (
            <Pause size={32} />
          ) : (
            <Play size={32} className="ml-1" />
          )}
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
