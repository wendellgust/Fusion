import { useNavigate } from '@tanstack/react-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FC,
  type PropsWithChildren,
} from 'react';
import { toast } from 'sonner';

import { useTranslation } from '@nuclearplayer/i18n';
import type { PlaylistProvider } from '@nuclearplayer/plugin-sdk';

import { providersHost } from '../../services/providersHost';
import { usePlaylistStore } from '../../stores/playlistStore';

type CreatePlaylistContextValue = {
  isCreateDialogOpen: boolean;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  createPlaylist: (name: string) => Promise<void>;
};

type ImportFromUrlContextValue = {
  isUrlDialogOpen: boolean;
  openUrlDialog: () => void;
  closeUrlDialog: () => void;
  importFromUrl: (url: string) => Promise<void>;
};

const CreatePlaylistContext = createContext<CreatePlaylistContextValue | null>(
  null,
);

const ImportFromUrlContext = createContext<ImportFromUrlContextValue | null>(
  null,
);

export const useCreatePlaylistContext = () => {
  const ctx = useContext(CreatePlaylistContext);
  if (!ctx) {
    throw new Error(
      'useCreatePlaylistContext must be used within <PlaylistsProvider>',
    );
  }
  return ctx;
};

export const useImportFromUrlContext = () => {
  const ctx = useContext(ImportFromUrlContext);
  if (!ctx) {
    throw new Error(
      'useImportFromUrlContext must be used within <PlaylistsProvider>',
    );
  }
  return ctx;
};

const CreatePlaylistProvider: FC<PropsWithChildren> = ({ children }) => {
  const storeCreatePlaylist = usePlaylistStore((state) => state.createPlaylist);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const openCreateDialog = useCallback(() => setIsCreateDialogOpen(true), []);
  const closeCreateDialog = useCallback(() => setIsCreateDialogOpen(false), []);

  const createPlaylist = useCallback(
    async (name: string) => {
      await storeCreatePlaylist(name);
      setIsCreateDialogOpen(false);
    },
    [storeCreatePlaylist],
  );

  const value = useMemo(
    () => ({
      isCreateDialogOpen,
      openCreateDialog,
      closeCreateDialog,
      createPlaylist,
    }),
    [isCreateDialogOpen, openCreateDialog, closeCreateDialog, createPlaylist],
  );

  return (
    <CreatePlaylistContext.Provider value={value}>
      {children}
    </CreatePlaylistContext.Provider>
  );
};

const ImportFromUrlProvider: FC<PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation('playlists');
  const navigate = useNavigate();
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);

  const openUrlDialog = useCallback(() => setIsUrlDialogOpen(true), []);
  const closeUrlDialog = useCallback(() => setIsUrlDialogOpen(false), []);

  const importFromUrl = useCallback(
    async (url: string) => {
      const providers = providersHost.list('playlists') as PlaylistProvider[];
      const matchingProvider = providers.find((provider) =>
        provider.matchesUrl(url),
      );

      if (!matchingProvider) {
        toast.error(t('importUrlNoProvider'));
        return;
      }

      setIsUrlDialogOpen(false);
      navigate({
        to: '/playlists/import/$providerId',
        params: { providerId: matchingProvider.id },
        search: { url: encodeURIComponent(url) },
      });
    },
    [navigate, t],
  );

  const value = useMemo(
    () => ({
      isUrlDialogOpen,
      openUrlDialog,
      closeUrlDialog,
      importFromUrl,
    }),
    [isUrlDialogOpen, openUrlDialog, closeUrlDialog, importFromUrl],
  );

  return (
    <ImportFromUrlContext.Provider value={value}>
      {children}
    </ImportFromUrlContext.Provider>
  );
};

export const PlaylistsProvider: FC<PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    const youtubePlaylistProvider: PlaylistProvider = {
      id: 'built-in-youtube-playlist',
      kind: 'playlists',
      name: 'YouTube Playlist',
      matchesUrl: (url: string) => {
        return (
          url.includes('youtube.com/playlist') ||
          url.includes('youtu.be/playlist') ||
          (url.includes('youtube.com/') && url.includes('list=')) ||
          (url.includes('music.youtube.com/') && url.includes('list='))
        );
      },
      fetchPlaylistByUrl: async (url: string) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<any>('ytdlp_get_playlist', { url });
        const nowIso = new Date().toISOString();
        return {
          id: info.id || url,
          name: info.title || 'YouTube Playlist',
          createdAtIso: nowIso,
          lastModifiedIso: nowIso,
          isReadOnly: true,
          items: (info.entries || []).map((entry: any, index: number) => ({
            id: crypto.randomUUID ? crypto.randomUUID() : `yt-${entry.id}-${index}`,
            addedAtIso: nowIso,
            track: {
              title: entry.title || 'Unknown Track',
              artists: entry.channel ? [{ name: entry.channel, roles: ['main'] }] : [],
              durationMs: entry.duration ? Math.round(entry.duration * 1000) : undefined,
              artwork: entry.thumbnails && entry.thumbnails.length > 0
                ? { items: entry.thumbnails.map((t: any) => ({ url: t.url, purpose: 'thumbnail' })) }
                : undefined,
              source: {
                provider: 'youtube',
                id: entry.id,
              }
            }
          }))
        };
      }
    };

    const spotifyPlaylistProvider: PlaylistProvider = {
      id: 'built-in-spotify-playlist',
      kind: 'playlists',
      name: 'Spotify Playlist',
      matchesUrl: (url: string) => {
        return (
          url.includes('spotify.com/playlist') ||
          url.includes('spotify.com/embed/playlist')
        );
      },
      fetchPlaylistByUrl: async (url: string) => {
        const playlistIdMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
        if (!playlistIdMatch) {
          throw new Error('Invalid Spotify playlist URL');
        }
        const playlistId = playlistIdMatch[1];
        const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
        
        const { httpHost } = await import('../../services/httpHost');
        const response = await httpHost.fetch(embedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch Spotify embed page: HTTP ${response.status}`);
        }

        const html = response.body;
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) {
          throw new Error('Could not find metadata in Spotify embed page');
        }

        const nextData = JSON.parse(match[1]);
        const pageProps = nextData.props?.pageProps;
        if (!pageProps) {
          throw new Error('Invalid metadata format in Spotify embed page');
        }

        if (pageProps.status === 404) {
          throw new Error('Spotify playlist not found or is private');
        }

        // Helper function to recursively find tracks array
        const findTracks = (obj: any): any[] | null => {
          if (!obj || typeof obj !== 'object') {
            return null;
          }
          if (Array.isArray(obj)) {
            const isTrackList = obj.some(item => {
              if (!item) return false;
              if (item.uri && item.uri.startsWith('spotify:track:')) return true;
              if (item.track && item.track.uri && item.track.uri.startsWith('spotify:track:')) return true;
              return false;
            });
            if (isTrackList) {
              return obj;
            }
            for (const item of obj) {
              const found = findTracks(item);
              if (found) return found;
            }
          } else {
            for (const key of Object.keys(obj)) {
              const found = findTracks(obj[key]);
              if (found) return found;
            }
          }
          return null;
        };

        const rawTracks = findTracks(pageProps) || [];
        const nowIso = new Date().toISOString();

        const getPlaylistTitle = () => {
          if (pageProps.title && pageProps.title !== 'Page not found') {
            return pageProps.title;
          }
          if (pageProps.state?.data?.entity?.name) {
            return pageProps.state.data.entity.name;
          }
          return 'Spotify Playlist';
        };

        const playlistTitle = getPlaylistTitle();

        const items = rawTracks.map((item: any, index: number) => {
          const t = item.track || item;
          const trackId = t.id || (t.uri ? t.uri.split(':').pop() : `sp-${index}`);
          return {
            id: crypto.randomUUID ? crypto.randomUUID() : `sp-item-${trackId}-${index}`,
            addedAtIso: nowIso,
            track: {
              title: t.name || t.title || 'Unknown Track',
              artists: Array.isArray(t.artists)
                ? t.artists.map((a: any) => ({ name: a.name, roles: ['main'] }))
                : [],
              album: t.album
                ? {
                    title: t.album.name || t.album.title || '',
                    source: { provider: 'spotify', id: t.album.uri || '' },
                  }
                : undefined,
              durationMs: t.duration_ms || t.duration || undefined,
              artwork: t.album && Array.isArray(t.album.images) && t.album.images.length > 0
                ? { items: t.album.images.map((img: any) => ({ url: img.url, purpose: 'thumbnail' })) }
                : undefined,
              source: {
                provider: 'spotify',
                id: trackId,
              }
            }
          };
        });

        return {
          id: playlistId,
          name: playlistTitle,
          createdAtIso: nowIso,
          lastModifiedIso: nowIso,
          isReadOnly: true,
          items,
        };
      }
    };

    if (!providersHost.get('built-in-youtube-playlist', 'playlists')) {
      providersHost.register(youtubePlaylistProvider);
    }
    if (!providersHost.get('built-in-spotify-playlist', 'playlists')) {
      providersHost.register(spotifyPlaylistProvider);
    }
  }, []);

  return (
    <CreatePlaylistProvider>
      <ImportFromUrlProvider>{children}</ImportFromUrlProvider>
    </CreatePlaylistProvider>
  );
};
