import { FolderPlus, ListPlus, Plus } from 'lucide-react';
import { FC, useState } from 'react';
import { toast } from 'sonner';

import { Track } from '@nuclearplayer/model';
import { Button, Dialog, Input, Popover } from '@nuclearplayer/ui';

import { usePlaylistStore } from '../../stores/playlistStore';

type PlaylistPopoverProps = {
  track: Track;
};

export const PlaylistPopover: FC<PlaylistPopoverProps> = ({ track }) => {
  const playlists = usePlaylistStore((state) => state.index);
  const addTracks = usePlaylistStore((state) => state.addTracks);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const handleAddToPlaylist = async (
    playlistId: string,
    playlistName: string,
  ) => {
    try {
      await addTracks(playlistId, [track]);
      toast.success(`Added "${track.title}" to playlist "${playlistName}"`);
    } catch {
      toast.error('Failed to add song to playlist');
    }
  };

  const handleCreatePlaylist = async () => {
    const trimmedName = newPlaylistName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      const playlistId = await createPlaylist(trimmedName);
      await addTracks(playlistId, [track]);
      toast.success(
        `Created playlist "${trimmedName}" and added "${track.title}"`,
      );
      setIsDialogOpen(false);
      setNewPlaylistName('');
    } catch {
      toast.error('Failed to create playlist');
    }
  };

  const triggerButton = (
    <Button
      size="icon-sm"
      variant="text"
      className="text-muted-foreground hover:text-foreground"
      aria-label="Add to Playlist"
    >
      <ListPlus size={16} />
    </Button>
  );

  return (
    <>
      <Popover
        className="relative"
        trigger={triggerButton}
        anchor="top start"
        panelClassName="z-50 min-w-56 p-1 bg-card/45 backdrop-blur-md border border-border/40 shadow-xl rounded-lg mb-2"
      >
        <Popover.Menu>
          <div className="text-muted-foreground border-border/40 mb-1 border-b px-3 py-1.5 text-xs font-semibold">
            Add to Playlist
          </div>
          <div className="max-h-72 overflow-y-auto">
            {playlists.length === 0 ? (
              <div className="text-muted-foreground px-3 py-2 text-xs italic">
                No playlists found
              </div>
            ) : (
              playlists.map((playlist) => (
                <Popover.Item
                  key={playlist.id}
                  onClick={() =>
                    handleAddToPlaylist(playlist.id, playlist.name)
                  }
                  icon={<Plus size={14} />}
                >
                  {playlist.name}
                </Popover.Item>
              ))
            )}
          </div>
          <div className="border-border/40 mt-1 border-t pt-1">
            <Popover.Item
              onClick={() => setIsDialogOpen(true)}
              icon={<FolderPlus size={14} />}
              className="hover:text-primary"
            >
              Create Playlist
            </Popover.Item>
          </div>
        </Popover.Menu>
      </Popover>

      <Dialog.Root isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreatePlaylist();
          }}
        >
          <Dialog.Title>Create Playlist</Dialog.Title>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Playlist Name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="e.g. My Favorites"
              autoFocus
              required
            />
          </div>
          <Dialog.Actions>
            <Dialog.Close>Cancel</Dialog.Close>
            <Button type="submit">Create & Add</Button>
          </Dialog.Actions>
        </form>
      </Dialog.Root>
    </>
  );
};
