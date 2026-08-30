import { Pause, Play, SkipForward } from 'lucide-react';
import { FC, useState } from 'react';

import { Button, PlayerBar } from '@nuclearplayer/ui';

import { useQueueStore } from '../../stores/queueStore';
import { useSoundStore } from '../../stores/soundStore';
import { getTrackArtworkUrl } from '../../utils/artworkHelper';
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
      }
    | undefined;

  const trackTitle =
    trackRecord?.title || trackRecord?.name || 'No Track Selected';
  const artistName =
    trackRecord?.artist || trackRecord?.artists?.[0]?.name || 'Unknown Artist';
  const coverUrl = getTrackArtworkUrl(track);

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
      <div className="border-border bg-background/95 fixed right-0 bottom-0 left-0 z-40 block border-t p-2 backdrop-blur-lg md:hidden">
        <ConnectedSeekBar />
        <div
          className="flex cursor-pointer items-center justify-between gap-3 px-1 py-1"
          onClick={() => setIsMobileModalOpen(true)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-background-secondary border-border size-10 shrink-0 overflow-hidden rounded-lg border">
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
