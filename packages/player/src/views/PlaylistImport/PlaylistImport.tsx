import { useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, type FC } from 'react';

import { CenteredLoader } from '@nuclearplayer/ui';

import { ConnectedTrackTable } from '../../components/ConnectedTrackTable';
import { buildThumbnails } from '../../services/playlistFileService/buildThumbnails';
import { PlaylistDetailHeader } from '../Playlists/components/PlaylistDetailHeader';
import { PlaylistImportActions } from './PlaylistImportActions';
import { usePlaylistFromProvider } from './usePlaylistFromProvider';
import { useSaveLocally } from './useSaveLocally';

export const PlaylistImport: FC = () => {
  const { providerId } = useParams({
    from: '/playlists/import/$providerId',
  });
  const { url } = useSearch({ from: '/playlists/import/$providerId' });

  const { playlist, items, tracks, isLoading } = usePlaylistFromProvider(providerId, url);
  const { saveLocally } = useSaveLocally(playlist);

  const thumbnails = useMemo(
    () => (playlist ? buildThumbnails(playlist) : []),
    [playlist],
  );

  const getItemId = useCallback(
    (_track: unknown, index: number) => items[index]?.id ?? String(index),
    [items],
  );

  return (
    <div
      className="bg-background flex h-full flex-col overflow-hidden"
      data-testid="playlist-import-view"
    >
      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <CenteredLoader />
        </div>
      )}
      {playlist && (
        <div className="shrink-0 p-6 pb-2">
          <PlaylistDetailHeader
            playlist={playlist}
            thumbnails={thumbnails}
          >
            <PlaylistImportActions
              tracks={tracks}
              title={playlist.name}
              onSaveLocally={saveLocally}
            />
          </PlaylistDetailHeader>
        </div>
      )}
      {tracks.length > 0 && (
        <div className="min-h-0 flex-1 px-6 pb-6">
          <ConnectedTrackTable
            tracks={tracks}
            getItemId={getItemId}
            features={{ header: true, reorderable: false }}
            display={{
              displayThumbnail: true,
              displayArtist: true,
              displayDuration: tracks.some((track) => track.durationMs != null),
              displayQueueControls: true,
              displayDeleteButton: false,
            }}
          />
        </div>
      )}
    </div>
  );
};
