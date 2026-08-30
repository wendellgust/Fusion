import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { FavoriteButton, PlayerBar } from '@nuclearplayer/ui';

import { useFavoritesStore } from '../../stores/favoritesStore';
import { useQueueStore } from '../../stores/queueStore';
import { getTrackArtworkUrl } from '../../utils/artworkHelper';
import { PlaylistPopover } from './PlaylistPopover';

export const ConnectedNowPlaying: FC = () => {
  const { t } = useTranslation('playerBar');
  const { t: tTrack } = useTranslation('track');
  const currentItem = useQueueStore((s) => s.getCurrentItem());
  const { isTrackFavorite, addTrack, removeTrack } = useFavoritesStore();

  const track = currentItem?.track;
  const isFavorite = track
    ? isTrackFavorite(track.source) ||
      isTrackFavorite(track as unknown as Parameters<typeof isTrackFavorite>[0])
    : false;

  const coverUrl = getTrackArtworkUrl(track);
  const title =
    track?.title ??
    (track as unknown as { name?: string })?.name ??
    t('noTrackPlaying');
  const artist =
    track?.artists?.[0]?.name ??
    (track as unknown as { artist?: string })?.artist ??
    '';

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

  return (
    <PlayerBar.NowPlaying
      title={title}
      artist={artist}
      coverUrl={coverUrl}
      action={
        track && (
          <div className="flex items-center gap-2">
            <FavoriteButton
              size="sm"
              isFavorite={isFavorite}
              onToggle={handleToggleFavorite}
              ariaLabelAdd={tTrack('actions.addToFavorites')}
              ariaLabelRemove={tTrack('actions.removeFromFavorites')}
            />
            <PlaylistPopover track={track} />
          </div>
        )
      }
    />
  );
};
