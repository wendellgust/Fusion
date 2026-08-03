import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FC, PropsWithChildren } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { useTranslation } from '@nuclearplayer/i18n';
import type { PlaylistProvider } from '@nuclearplayer/plugin-sdk';
import { providersHost } from '../../services/providersHost';

type CreatePlaylistContextValue = {
  isCreateDialogOpen: boolean;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
};

const CreatePlaylistContext = createContext<CreatePlaylistContextValue | null>(null);

export const useCreatePlaylistContext = () => {
  const ctx = useContext(CreatePlaylistContext);
  if (!ctx) {
    throw new Error('useCreatePlaylistContext must be used within <PlaylistsProvider>');
  }
  return ctx;
};

const CreatePlaylistProvider: FC<PropsWithChildren> = ({ children }) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const openCreateDialog = useCallback(() => setIsCreateDialogOpen(true), []);
  const closeCreateDialog = useCallback(() => setIsCreateDialogOpen(false), []);

  const value = useMemo(
    () => ({
      isCreateDialogOpen,
      openCreateDialog,
      closeCreateDialog,
    }),
    [isCreateDialogOpen, openCreateDialog, closeCreateDialog]
  );

  return (
    <CreatePlaylistContext.Provider value={value}>
      {children}
    </CreatePlaylistContext.Provider>
  );
};

type ImportFromUrlContextValue = {
  isUrlDialogOpen: boolean;
  openUrlDialog: () => void;
  closeUrlDialog: () => void;
  importFromUrl: (url: string) => Promise<void>;
};

const ImportFromUrlContext = createContext<ImportFromUrlContextValue | null>(null);

export const useImportFromUrlContext = () => {
  const ctx = useContext(ImportFromUrlContext);
  if (!ctx) {
    throw new Error('useImportFromUrlContext must be used within <PlaylistsProvider>');
  }
  return ctx;
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
        provider.matchesUrl(url)
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
    [navigate, t]
  );

  const value = useMemo(
    () => ({
      isUrlDialogOpen,
      openUrlDialog,
      closeUrlDialog,
      importFromUrl,
    }),
    [isUrlDialogOpen, openUrlDialog, closeUrlDialog, importFromUrl]
  );

  return (
    <ImportFromUrlContext.Provider value={value}>
      {children}
    </ImportFromUrlContext.Provider>
  );
};

export const PlaylistsProvider: FC<PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    const fetchYouTubePlaylist = async (url: string) => {
      const nowIso = new Date().toISOString();
      const listMatch = url.match(/[?&]list=([^&]+)/);
      const cleanListId = listMatch ? listMatch[1] : '';
      const cleanUrl = cleanListId
        ? `https://www.youtube.com/playlist?list=${cleanListId}`
        : url;

      // 1. Fetch via local server /api/yt-playlist endpoint
      try {
        const res = await fetch(`/api/yt-playlist?url=${encodeURIComponent(cleanUrl)}`);
        if (res.ok) {
          const data = await res.json();
          const entries = Array.isArray(data?.entries) ? data.entries : [];
          if (entries.length > 0) {
            const items = entries.map((e: any, index: number) => ({
              id: `yt-${e.id || index}-${index}`,
              addedAtIso: nowIso,
              track: {
                title: e.title || 'Unknown Track',
                artists: e.artist ? [{ name: e.artist, roles: ['main'] }] : [{ name: 'Unknown Artist', roles: ['main'] }],
                durationMs: e.duration ? Math.round(e.duration * 1000) : undefined,
                artwork: e.thumbnail ? { items: [{ url: e.thumbnail, purpose: 'thumbnail' }] } : undefined,
                source: {
                  provider: 'built-in-web-streaming',
                  id: `${e.artist || ''} ${e.title || ''}`.trim(),
                },
              },
            }));

            return {
              id: cleanListId || data.id || url,
              name: data.title || 'YouTube Playlist',
              createdAtIso: nowIso,
              lastModifiedIso: nowIso,
              isReadOnly: false,
              items,
            };
          }
        }
      } catch {
        /* try next fallback */
      }

      // 2. Try Invidious API fallbacks if listId is present
      if (cleanListId) {
        const invidiousEndpoints = [
          'https://inv.tux.pizza/api/v1/playlists/',
          'https://invidious.nerdvpn.de/api/v1/playlists/',
        ];

        for (const endpoint of invidiousEndpoints) {
          try {
            const res = await fetch(`/api/proxy-download?url=${encodeURIComponent(endpoint + cleanListId)}`);
            if (res.ok) {
              const data = await res.json();
              const videos = Array.isArray(data?.videos) ? data.videos : [];
              if (videos.length > 0) {
                const items = videos.map((v: any, index: number) => ({
                  id: `yt-${v.videoId || index}-${index}`,
                  addedAtIso: nowIso,
                  track: {
                    title: v.title || 'Unknown Track',
                    artists: [{ name: v.author || 'Unknown Artist', roles: ['main'] }],
                    durationMs: v.lengthSeconds ? Math.round(v.lengthSeconds * 1000) : undefined,
                    artwork: Array.isArray(v.videoThumbnails) && v.videoThumbnails.length > 0
                      ? { items: [{ url: v.videoThumbnails[0].url, purpose: 'thumbnail' }] }
                      : undefined,
                    source: {
                      provider: 'built-in-web-streaming',
                      id: `${v.author || ''} ${v.title || ''}`.trim(),
                    },
                  },
                }));

                return {
                  id: cleanListId,
                  name: data.title || 'YouTube Playlist',
                  createdAtIso: nowIso,
                  lastModifiedIso: nowIso,
                  isReadOnly: false,
                  items,
                };
              }
            }
          } catch {
            /* try next instance */
          }
        }
      }

      // 3. Fallback for Tauri desktop
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<any>('ytdlp_get_playlist', { url: cleanUrl });
        const entries = Array.isArray(info?.entries) ? info.entries : [];
        return {
          id: info?.id || url,
          name: info?.title || 'YouTube Playlist',
          createdAtIso: nowIso,
          lastModifiedIso: nowIso,
          isReadOnly: true,
          items: entries.map((entry: any, index: number) => {
            const thumbs = Array.isArray(entry?.thumbnails) ? entry.thumbnails : [];
            return {
              id: `yt-${entry?.id || index}-${index}`,
              addedAtIso: nowIso,
              track: {
                title: entry?.title || 'Unknown Track',
                artists: entry?.channel ? [{ name: entry.channel, roles: ['main'] }] : [],
                durationMs: entry?.duration ? Math.round(entry.duration * 1000) : undefined,
                artwork: thumbs.length > 0
                  ? { items: thumbs.map((t: any) => ({ url: t.url, purpose: 'thumbnail' })) }
                  : undefined,
                source: {
                  provider: 'youtube',
                  id: entry?.id || '',
                },
              },
            };
          }),
        };
      } catch {
        return {
          id: url,
          name: 'YouTube Playlist',
          createdAtIso: nowIso,
          lastModifiedIso: nowIso,
          isReadOnly: false,
          items: [],
        };
      }
    };

    const matchesYouTubeUrl = (url: string) => {
      return (
        url.includes('youtube.com/playlist') ||
        url.includes('youtu.be/playlist') ||
        (url.includes('youtube.com/') && url.includes('list=')) ||
        (url.includes('music.youtube.com/') && url.includes('list='))
      );
    };

    // Register YouTube provider under all matching IDs used across Nuclear UI routes
    const youtubeProviderIds = ['built-in-youtube-playlist', 'youtube-playlists', 'youtube-playlist', 'youtube'];
    for (const providerId of youtubeProviderIds) {
      providersHost.register({
        id: providerId,
        kind: 'playlists',
        name: 'YouTube Playlist',
        matchesUrl: matchesYouTubeUrl,
        fetchPlaylistByUrl: fetchYouTubePlaylist,
      } as PlaylistProvider);
    }

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
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
        const entity = nextData.props.pageProps.state.data.entity;

        const nowIso = new Date().toISOString();
        return {
          id: entity.id || playlistId,
          name: entity.name || 'Spotify Playlist',
          description: entity.description || '',
          createdAtIso: nowIso,
          lastModifiedIso: nowIso,
          isReadOnly: true,
          items: (entity.trackList || []).map((item: any, index: number) => ({
            id: `sp-${item.uri || index}`,
            addedAtIso: nowIso,
            track: {
              title: item.title || 'Unknown Track',
              artists: item.subtitle ? [{ name: item.subtitle, roles: ['main'] }] : [],
              durationMs: item.duration ? Math.round(item.duration) : undefined,
              artwork: item.audio
                ? { items: [{ url: item.audio, purpose: 'thumbnail' }] }
                : undefined,
              source: {
                provider: 'built-in-web-streaming',
                id: `${item.subtitle || ''} ${item.title || ''}`.trim(),
              },
            },
          })),
        };
      },
    };

    providersHost.register(spotifyPlaylistProvider);
  }, []);

  return (
    <CreatePlaylistProvider>
      <ImportFromUrlProvider>{children}</ImportFromUrlProvider>
    </CreatePlaylistProvider>
  );
};
