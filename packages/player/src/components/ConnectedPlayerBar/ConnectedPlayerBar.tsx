import { Pause, Play, SkipForward } from 'lucide-react';
import { FC, useState } from 'react';

import { Button, PlayerBar } from '@nuclearplayer/ui';

import { useQueueStore } from '../../stores/queueStore';
import { useSoundStore } from '../../stores/soundStore';
import { ConnectedControls } from './ConnectedControls';
import { ConnectedNowPlaying } from './ConnectedNowPlaying';
import { ConnectedSeekBar } from './ConnectedSeekBar';
import { ConnectedVolume } from './ConnectedVolume';
import { MobilePlayerModal } from './MobilePlayerModal';
import { VisualizerButton } from './VisualizerButton';

export const ConnectedPlayerBar: FC = () => {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const currentItem = useQueueStore((state) => state.getCurrentItem());
  const goToNext = useQueueStore((state) => state.goToNext);
  const track = currentItem?.track;
  const { status, toggle } = useSoundStore();
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

  return (
    <>
      {/* Desktop Player Bar */}
      <div className="hidden md:block">
        <ConnectedSeekBar />
        <PlayerBar
          left={<ConnectedNowPlaying />}
          center={<ConnectedControls />}
          right={
            <div className="flex items-center gap-3">
              <VisualizerButton />
              <ConnectedVolume />
            </div>
          }
        />
      </div>

      {/* Spotify Mobile Floating Mini-Player Bar */}
      <div className="border-border bg-background/95 fixed bottom-0 left-0 right-0 z-40 block border-t p-2 backdrop-blur-lg md:hidden">
        <ConnectedSeekBar />
        <div
          className="flex items-center justify-between gap-3 px-1 py-1 cursor-pointer"
          onClick={() => setIsMobileModalOpen(true)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-background-secondary size-10 shrink-0 overflow-hidden rounded-lg border border-border">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="size-full object-cover select-none" />
              ) : (
                <div className="flex size-full items-center justify-center text-xs">🎵</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-text truncate text-sm font-bold">{trackTitle}</div>
              <div className="text-text-secondary truncate text-xs">{artistName}</div>
            </div>
          </div>

          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="icon" variant="text" onClick={toggle}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </Button>
            <Button size="icon" variant="text" onClick={goToNext}>
              <SkipForward size={20} />
            </Button>
          </div>
        </div>
      </div>

      {/* Fullscreen Spotify Mobile Overlay */}
      <MobilePlayerModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />
    </>
  );
};
