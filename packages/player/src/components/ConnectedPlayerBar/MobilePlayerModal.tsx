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
import { getTrackArtworkUrl } from '../../utils/artworkHelper';

type MobilePlayerModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const MobilePlayerModal: FC<MobilePlayerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const currentItem = useQueueStore((state) => state.getCurrentItem());
  const goToNext = useQueueStore((state) => state.goToNext);
  const goToPrevious = useQueueStore((state) => state.goToPrevious);
  const track = currentItem?.track;
  const { status, toggle, seek, duration, seekTo } = useSoundStore();
  const isPlaying = status === 'playing';

  const isTrackFavorite = useFavoritesStore((s) => s.isTrackFavorite);
  const addTrack = useFavoritesStore((s) => s.addTrack);
  const removeTrack = useFavoritesStore((s) => s.removeTrack);

  const isFavorite = track
    ? isTrackFavorite(track.source) ||
      isTrackFavorite(track as unknown as Parameters<typeof isTrackFavorite>[0])
    : false;

  const handleToggleFavorite = () => {
    if (!track) {
      return;
    }
    if (isFavorite) {
      if (track.source) {
        removeTrack(track.source);
      }
      removeTrack(track as unknown as Parameters<typeof removeTrack>[0]);
    } else {
      addTrack(track);
    }
  };

  if (!isOpen) {
    return null;
  }

  const trackRecord = track as unknown as
    | {
        name?: string;
        title?: string;
        artist?: string;
        artists?: Array<{ name: string }>;
      }
    | undefined;

  const trackTitle =
    trackRecord?.title || trackRecord?.name || 'No Track Selected';
  const artistName =
    trackRecord?.artist || trackRecord?.artists?.[0]?.name || 'Unknown Artist';
  const coverUrl = getTrackArtworkUrl(track);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) {
      return '0:00';
    }
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
      <div className="my-auto flex justify-center px-4 py-6">
        <div className="border-border relative aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border shadow-2xl">
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
        <Button
          size="icon"
          variant="text"
          onClick={handleToggleFavorite}
          className={isFavorite ? 'text-red-500' : 'text-foreground-secondary'}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={26} fill={isFavorite ? 'currentColor' : 'none'} />
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
