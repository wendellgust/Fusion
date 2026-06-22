import { useNavigate } from '@tanstack/react-router';
import { EllipsisIcon, ListXIcon, Trash2Icon } from 'lucide-react';
import { FC, useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';
import { Button, Dialog, Input, Popover, QueuePanel } from '@nuclearplayer/ui';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { useCurrentQueueItem } from '../hooks/useCurrentQueueItem';
import { useQueue } from '../hooks/useQueue';
import { useQueueActions } from '../hooks/useQueueActions';
import { usePlaylistStore } from '../stores/playlistStore';

type ConnectedQueuePanelProps = {
  isCollapsed?: boolean;
};

export const ConnectedQueuePanel: FC<ConnectedQueuePanelProps> = ({
  isCollapsed = false,
}) => {
  const { t } = useTranslation('queue');
  const { t: tPlaylists } = useTranslation('playlists');
  const queue = useQueue();
  const currentItem = useCurrentQueueItem();
  const actions = useQueueActions();
  const playlistIndex = usePlaylistStore((state) => state.index);
  const addTracks = usePlaylistStore((state) => state.addTracks);
  const loadIndex = usePlaylistStore((state) => state.loadIndex);
  const loaded = usePlaylistStore((state) => state.loaded);

  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(
    null,
  );

  const handleReorder = (fromIndex: number, toIndex: number) => {
    actions.reorder(fromIndex, toIndex);
  };

  const handleSelectItem = (itemId: string) => {
    actions.goToId(itemId);
  };

  const handleRemoveItem = (itemId: string) => {
    actions.removeByIds([itemId]);
  };

  const handleAddToPlaylist = (itemId: string) => {
    const item = queue.items.find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    if (!loaded) {
      loadIndex();
    }
    setAddToPlaylistTrack(item.track);
  };

  const handlePickPlaylist = async (playlistId: string) => {
    if (!addToPlaylistTrack) {
      return;
    }
    await addTracks(playlistId, [addToPlaylistTrack]);
    setAddToPlaylistTrack(null);
  };

  return (
    <>
      <QueuePanel
        items={queue.items}
        currentItemId={currentItem?.id}
        isCollapsed={isCollapsed}
        reorderable={!isCollapsed}
        onReorder={handleReorder}
        onSelectItem={handleSelectItem}
        onRemoveItem={handleRemoveItem}
        onAddToPlaylist={isCollapsed ? undefined : handleAddToPlaylist}
        labels={{
          emptyTitle: t('empty.title'),
          emptySubtitle: t('empty.subtitle'),
          removeButton: t('actions.remove'),
          playbackError: t('errors.playback'),
          addToPlaylistButton: tPlaylists('addToPlaylist'),
        }}
      />
      <Dialog.Root
        isOpen={addToPlaylistTrack !== null}
        onClose={() => setAddToPlaylistTrack(null)}
      >
        <Dialog.Title>{tPlaylists('addToPlaylist')}</Dialog.Title>
        <div className="mt-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {playlistIndex.length === 0 ? (
            <p className="text-foreground-secondary text-sm">
              {tPlaylists('empty')}
            </p>
          ) : (
            playlistIndex.map((entry) => (
              <button
                key={entry.id}
                className="hover:bg-foreground/5 text-foreground rounded px-3 py-2 text-left text-sm transition-colors"
                onClick={() => handlePickPlaylist(entry.id)}
              >
                {entry.name}
              </button>
            ))
          )}
        </div>
        <Dialog.Actions>
          <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
        </Dialog.Actions>
      </Dialog.Root>
    </>
  );
};

export const QueueHeaderActions: FC = () => {
  const { t } = useTranslation('queue');
  const { t: tPlaylists } = useTranslation('playlists');
  const navigate = useNavigate();
  const queue = useQueue();
  const { clearQueue } = useQueueActions();
  const saveQueueAsPlaylist = usePlaylistStore(
    (state) => state.saveQueueAsPlaylist,
  );

  const [autoRemovePlayed, setAutoRemovePlayed] = useCoreSetting<boolean>(
    'playback.autoRemovePlayed',
  );
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  const handleSaveAsPlaylist = async () => {
    if (!playlistName.trim()) {
      return;
    }
    const playlistId = await saveQueueAsPlaylist(playlistName.trim());
    setSaveDialogOpen(false);
    setPlaylistName('');
    navigate({ to: '/playlists/$playlistId', params: { playlistId } });
  };

  if (queue.items.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        size="icon"
        variant={autoRemovePlayed ? 'default' : 'text'}
        onClick={() => setAutoRemovePlayed(!autoRemovePlayed)}
        title={
          autoRemovePlayed
            ? 'Auto-remove played: ON'
            : 'Auto-remove played: OFF'
        }
      >
        <ListXIcon />
      </Button>
      <Button size="icon" data-testid="clear-queue-button" onClick={clearQueue}>
        <Trash2Icon />
      </Button>
      <Popover
        className="relative"
        trigger={
          <Button size="icon" data-testid="queue-more-button">
            <EllipsisIcon />
          </Button>
        }
        anchor="bottom end"
      >
        <Popover.Menu>
          <Popover.Item
            onClick={() => setSaveDialogOpen(true)}
            data-testid="save-queue-as-playlist"
          >
            {t('actions.saveAsPlaylist')}
          </Popover.Item>
        </Popover.Menu>
      </Popover>
      <Dialog.Root
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSaveAsPlaylist();
          }}
        >
          <Dialog.Title>{t('actions.saveAsPlaylist')}</Dialog.Title>
          <div className="mt-4">
            <Input
              label={tPlaylists('name')}
              placeholder={tPlaylists('namePlaceholder')}
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
              data-testid="save-queue-playlist-name-input"
              autoFocus
            />
          </div>
          <Dialog.Actions>
            <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
            <Button type="submit">{t('common:actions.save')}</Button>
          </Dialog.Actions>
        </form>
      </Dialog.Root>
    </>
  );
};
