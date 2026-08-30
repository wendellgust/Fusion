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

      {/* Spotify Mobile Floating Mini-Player Bar (docked above bottom nav bar) */}
      <div className="border-border bg-background/95 fixed right-2 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-2 z-40 block rounded-xl border p-2 shadow-2xl backdrop-blur-xl md:hidden">
        <ConnectedSeekBar />
        <div
          className="flex cursor-pointer items-center justify-between gap-3 px-1 py-1"
          onClick={() => setIsMobileModalOpen(true)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-background-secondary border-border size-10 shrink-0 overflow-hidden rounded-lg border shadow-sm">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="size-full object-cover select-none"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs">
                  🎵
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-text truncate text-sm font-bold">
                {trackTitle}
              </div>
              <div className="text-text-secondary truncate text-xs">
                {artistName}
              </div>
            </div>
          </div>

          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="icon"
              variant="text"
              onClick={toggle}
              className="text-foreground"
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </Button>
            <Button
              size="icon"
              variant="text"
              onClick={goToNext}
              className="text-foreground"
            >
              <SkipForward size={22} />
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
