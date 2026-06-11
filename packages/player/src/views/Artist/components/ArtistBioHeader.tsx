import isEmpty from 'lodash-es/isEmpty';
import { FC } from 'react';
import { Ban } from 'lucide-react';

import { useTranslation } from '@nuclearplayer/i18n';
import { pickArtwork } from '@nuclearplayer/model';
import { Loader, Button } from '@nuclearplayer/ui';

import { ConnectedFavoriteButton } from '../../../components/ConnectedFavoriteButton';
import { useArtistBio } from '../hooks/useArtistBio';
import { useBlockStore } from '../../../stores/blockStore';

const AVATAR_SIZE_PX = 300;

type ArtistBioHeaderProps = {
  providerId: string;
  artistId: string;
};

export const ArtistBioHeader: FC<ArtistBioHeaderProps> = ({
  providerId,
  artistId,
}) => {
  const { t } = useTranslation('artist');
  const {
    data: artist,
    isLoading,
    isError,
  } = useArtistBio(providerId, artistId);

  const isBlocked = useBlockStore((state) =>
    artist ? state.isArtistBlocked(artist.name) : false,
  );

  const toggleBlock = async () => {
    if (!artist) return;
    if (isBlocked) {
      await useBlockStore.getState().removeBlockedArtist(artist.name);
    } else {
      await useBlockStore.getState().addBlockedArtist(artist.name);
    }
  };

  if (isLoading) {
    return (
      <div className="border-border bg-primary shadow-shadow m-4 flex items-center justify-center rounded-md border-(length:--border-width) p-6">
        <Loader size="xl" data-testid="artist-header-loader" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-border bg-primary shadow-shadow m-4 rounded-md border-(length:--border-width) p-6">
        <div className="text-accent-red">{t('errors.failedToLoadDetails')}</div>
      </div>
    );
  }

  if (!artist) {
    return null;
  }

  const cover = pickArtwork(artist.artwork, 'cover', 1200);
  const avatar = pickArtwork(artist.artwork, 'avatar', AVATAR_SIZE_PX);

  return (
    <div className="border-border bg-primary shadow-shadow relative m-4 rounded-md border-(length:--border-width) p-6">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Button
          size="icon"
          variant="text"
          className="bg-background border-border rounded-md border-(length:--border-width)"
          onClick={(e) => {
            e.stopPropagation();
            toggleBlock();
          }}
          title={isBlocked ? 'Unblock Artist' : 'Block Artist'}
          data-testid="artist-block-button"
        >
          <Ban
            size={24}
            className={isBlocked ? 'text-accent-red fill-accent-red/20' : 'text-foreground-secondary hover:text-foreground'}
          />
        </Button>
        <ConnectedFavoriteButton
          type="artist"
          source={{ provider: providerId, id: artistId }}
          data={{ name: artist.name, artwork: artist.artwork }}
          className="bg-background border-border rounded-md border-(length:--border-width)"
          data-testid="artist-favorite-button"
        />
      </div>
      <div className="flex gap-6">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-5">
            {avatar && (
              <img
                className="border-border shadow-shadow h-24 w-24 rounded-full border-(length:--border-width) object-cover"
                src={avatar.url}
                alt={`${artist.name} avatar`}
              />
            )}
            <div className="flex flex-col gap-1">
              <h1 className="font-heading text-5xl font-extrabold tracking-tight">
                {artist.name}
              </h1>
              {artist.disambiguation && (
                <span className="text-foreground-secondary text-sm">
                  {artist.disambiguation}
                </span>
              )}
            </div>
          </div>
          {!isEmpty(artist.tags) && (
            <div className="flex flex-wrap gap-2">
              {artist.tags?.map((tag) => (
                <span
                  key={tag}
                  className="border-border bg-background rounded-md border px-2 py-0.5 text-sm font-bold"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {artist.onTour && (
            <span className="bg-accent-green border-border inline-flex w-fit rounded-md border px-2 py-0.5 text-sm font-bold">
              {t('onTour')}
            </span>
          )}
          {artist.bio && (
            <p className="text-foreground-secondary line-clamp-5 text-sm leading-relaxed">
              {artist.bio}
            </p>
          )}
        </div>
        {cover && (
          <div className="w-72 shrink-0 self-stretch">
            <img
              className="border-border shadow-shadow h-full w-full rounded-md border-(length:--border-width) object-cover"
              src={cover.url}
              alt={`${artist.name} cover`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
