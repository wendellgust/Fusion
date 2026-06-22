import { FC } from 'react';

import { PlayerBar } from '@nuclearplayer/ui';

import { ConnectedControls } from './ConnectedControls';
import { ConnectedNowPlaying } from './ConnectedNowPlaying';
import { ConnectedSeekBar } from './ConnectedSeekBar';
import { ConnectedVolume } from './ConnectedVolume';
import { VisualizerButton } from './VisualizerButton';

export const ConnectedPlayerBar: FC = () => {
  return (
    <>
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
    </>
  );
};
