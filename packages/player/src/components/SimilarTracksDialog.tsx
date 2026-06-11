import { useState, useEffect, type FC } from 'react';
import { Play, Plus, Sparkles, Loader2, Music, Check, FolderHeart } from 'lucide-react';
import { toast } from 'sonner';

import type { Track } from '@nuclearplayer/model';
import { Button, Dialog } from '@nuclearplayer/ui';

import { discoveryHost } from '../services/discoveryHost';
import { providersHost } from '../services/providersHost';
import { usePlaylistStore } from '../stores/playlistStore';
import { useQueueActions } from '../hooks/useQueueActions';

type SimilarTracksDialogProps = {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
};

export const SimilarTracksDialog: FC<SimilarTracksDialogProps> = ({
  track,
  isOpen,
  onClose,
}) => {

  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedPlaylistId, setSavedPlaylistId] = useState<string | null>(null);

  const queueActions = useQueueActions();
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  const addTracks = usePlaylistStore((state) => state.addTracks);

  useEffect(() => {
    if (!isOpen) return;

    setSavedPlaylistId(null);
    setRecommendations([]);
    setError(null);

    const fetchRecommendations = async () => {
      setLoading(true);
      try {
        const activeId = providersHost.getActive('discovery');
        if (!activeId) {
          setError('No active discovery provider found. Please activate one in Settings > Sources.');
          setLoading(false);
          return;
        }

        const recs = await discoveryHost.getRecommendations([track], { limit: 10, variety: 0.5 });
        if (!recs || recs.length === 0) {
          setError('No similar tracks found for this song.');
        } else {
          setRecommendations(recs);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load recommendations.');
      } finally {
        setLoading(false);
      }
    };

    void fetchRecommendations();
  }, [isOpen, track]);

  const handleSaveAsPlaylist = async () => {
    if (recommendations.length === 0) return;

    try {
      const playlistName = `Similar to: ${track.title}`;
      const playlistId = await createPlaylist(playlistName);
      await addTracks(playlistId, recommendations);
      setSavedPlaylistId(playlistId);
      toast.success(`Playlist "${playlistName}" created with ${recommendations.length} songs!`);
    } catch (err: any) {
      toast.error('Failed to create playlist');
    }
  };

  const handlePlayAll = () => {
    if (recommendations.length === 0) return;
    queueActions.clearQueue();
    queueActions.addToQueue(recommendations);
    toast.success(`Playing ${recommendations.length} similar songs`);
    onClose();
  };

  const handleQueueAll = () => {
    if (recommendations.length === 0) return;
    queueActions.addToQueue(recommendations);
    toast.success(`Added ${recommendations.length} songs to queue`);
    onClose();
  };

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      <Dialog.Title>
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-purple-500 animate-pulse" />
          <span>Similar Songs</span>
        </div>
      </Dialog.Title>

      <div className="mt-4 min-h-[250px] max-h-[400px] overflow-y-auto pr-1">
        <div className="text-sm text-foreground-secondary mb-3 flex items-center gap-2 bg-foreground/5 p-3 rounded-lg border border-border/40">
          <Music size={16} className="text-indigo-400" />
          <div>
            Recommendations based on: <strong className="text-foreground">{track.title}</strong> by <span className="italic text-foreground">{track.artists.map(a => a.name).join(', ')}</span>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader2 size={36} className="animate-spin text-primary" />
            <span className="text-sm text-foreground-secondary animate-pulse">Finding similar music...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive text-sm bg-destructive/10 rounded-lg p-4 border border-destructive/20 mx-2">
            {error}
          </div>
        )}

        {!loading && !error && recommendations.length > 0 && (
          <div className="space-y-2">
            {recommendations.map((rec, index) => {
              const artistNames = rec.artists.map(a => a.name).join(', ');
              return (
                <div
                  key={rec.source.id || index}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-background-input/40 hover:bg-background-input border border-border/20 transition-all duration-200 group hover:translate-x-1"
                >
                  <div className="flex flex-col min-w-0 flex-1 pr-4">
                    <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {rec.title}
                    </span>
                    <span className="text-xs text-foreground-secondary truncate">
                      {artistNames}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        queueActions.playNow(rec);
                        toast.success(`Playing "${rec.title}"`);
                      }}
                      className="p-1.5 rounded-md hover:bg-foreground/10 text-foreground transition-colors"
                      title="Play Now"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => {
                        queueActions.addToQueue([rec]);
                        toast.success(`Added "${rec.title}" to queue`);
                      }}
                      className="p-1.5 rounded-md hover:bg-foreground/10 text-foreground transition-colors"
                      title="Add to Queue"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog.Actions>
        <div className="mt-6 flex flex-wrap justify-between items-center w-full gap-2">
          <div className="flex gap-2">
            {recommendations.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveAsPlaylist}
                disabled={savedPlaylistId !== null}
                className="flex items-center gap-1.5 hover:border-purple-400 hover:text-purple-400 transition-colors"
              >
                {savedPlaylistId ? (
                  <>
                    <Check size={14} className="text-green-500" />
                    Saved
                  </>
                ) : (
                  <>
                    <FolderHeart size={14} />
                    Save as Playlist
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {recommendations.length > 0 && (
              <>
                <Button size="sm" onClick={handlePlayAll}>
                  Play All
                </Button>
                <Button variant="secondary" size="sm" onClick={handleQueueAll}>
                  Queue All
                </Button>
              </>
            )}
            <Dialog.Close>Close</Dialog.Close>
          </div>
        </div>
      </Dialog.Actions>
    </Dialog.Root>
  );
};
