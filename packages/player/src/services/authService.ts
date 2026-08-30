import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

import { useFavoritesStore } from '../stores/favoritesStore';
import { usePlaylistStore } from '../stores/playlistStore';
import { registerBuiltInWebProviders } from './builtInWebProviders';
import { playlistFileService } from './playlistFileService';

export type UserProfile = {
  username: string;
  token: string;
  isLoggedIn: boolean;
};

type AuthState = {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  syncDataToServer: () => Promise<void>;
  fetchDataFromServer: () => Promise<void>;
};

const AUTH_STORAGE_KEY = 'nuclear_web_auth_user';
let isHydratedFromServer = false;

function getStoredAuth(): UserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setStoredAuth(user: UserProfile | null) {
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function clearWebStorageForAccountSwitch() {
  if (typeof window === 'undefined') {
    return;
  }
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      key !== AUTH_STORAGE_KEY &&
      (key.includes('playlist') ||
        key.includes('favorite') ||
        key.includes('plugin') ||
        key.includes('setting') ||
        key.includes('theme') ||
        key.startsWith('nuclear_') ||
        key.startsWith('__tauri'))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

function dumpAllUserConfiguration() {
  const dump: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        key !== AUTH_STORAGE_KEY &&
        (key.startsWith('nuclear_') ||
          key.includes('plugin') ||
          key.includes('setting') ||
          key.includes('favorite') ||
          key.includes('playlist') ||
          key.includes('theme') ||
          key.startsWith('__tauri'))
      ) {
        dump[key] = localStorage.getItem(key) || '';
      }
    }
  }
  return dump;
}

function restoreAllUserConfiguration(dump: Record<string, string>) {
  if (!dump || typeof window === 'undefined') {
    return;
  }
  Object.entries(dump).forEach(([k, v]) => {
    if (typeof v === 'string' && k !== AUTH_STORAGE_KEY) {
      localStorage.setItem(k, v);
    }
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getStoredAuth(),
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    isHydratedFromServer = false;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login failed');
      }

      clearWebStorageForAccountSwitch();
      useFavoritesStore.setState({ tracks: [], albums: [], artists: [] });
      usePlaylistStore.setState({ index: [], playlists: new Map() });

      const user: UserProfile = {
        username: data.username,
        token: data.token,
        isLoggedIn: true,
      };
      setStoredAuth(user);
      set({ user, isLoading: false });

      await get().fetchDataFromServer();
      isHydratedFromServer = true;
      registerBuiltInWebProviders();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login error';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      clearWebStorageForAccountSwitch();
      useFavoritesStore.setState({ tracks: [], albums: [], artists: [] });
      usePlaylistStore.setState({ index: [], playlists: new Map() });

      const user: UserProfile = {
        username: data.username,
        token: data.token,
        isLoggedIn: true,
      };
      setStoredAuth(user);
      set({ user, isLoading: false });

      isHydratedFromServer = true;
      await get().syncDataToServer();
      registerBuiltInWebProviders();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration error';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  logout: () => {
    isHydratedFromServer = false;
    setStoredAuth(null);
    clearWebStorageForAccountSwitch();
    useFavoritesStore.setState({ tracks: [], albums: [], artists: [] });
    usePlaylistStore.setState({ index: [], playlists: new Map() });
    set({ user: null, error: null });
    registerBuiltInWebProviders();
  },

  syncDataToServer: async () => {
    if (!isHydratedFromServer) {
      return;
    }
    const { user } = get();
    const token = user?.token || 'default-token';

    try {
      const playlistsIndex = usePlaylistStore.getState().index;
      const playlistsMap = usePlaylistStore.getState().playlists;
      const fullPlaylists = Array.from(playlistsMap.values());
      const favoritesTracks = useFavoritesStore.getState().tracks;
      const favoritesAlbums = useFavoritesStore.getState().albums;
      const favoritesArtists = useFavoritesStore.getState().artists;
      const storageDump = dumpAllUserConfiguration();

      const payload = {
        token,
        username: user?.username,
        data: {
          playlists: playlistsIndex || [],
          fullPlaylists: fullPlaylists || [],
          favorites: {
            tracks: favoritesTracks || [],
            albums: favoritesAlbums || [],
            artists: favoritesArtists || [],
          },
          storageDump,
        },
      };

      await fetch('/api/user/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-username': user?.username || '',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('Failed to sync user data to server:', err);
    }
  },

  fetchDataFromServer: async () => {
    const { user } = get();
    const token = user?.token || 'default-token';
    const username = user?.username || '';

    try {
      const res = await fetch(
        `/api/user/data?token=${encodeURIComponent(token)}&username=${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-username': username,
          },
        },
      );
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        const { playlists, fullPlaylists, favorites, storageDump } = json.data;

        if (storageDump) {
          restoreAllUserConfiguration(storageDump);
        }

        registerBuiltInWebProviders();

        if (playlists && Array.isArray(playlists)) {
          const localIndex = usePlaylistStore.getState().index || [];
          const mergedIndexMap = new Map();
          for (const item of localIndex) {
            if (item && item.id) {
              mergedIndexMap.set(item.id, item);
            }
          }
          for (const item of playlists) {
            if (item && item.id) {
              mergedIndexMap.set(item.id, item);
            }
          }
          const mergedIndex = Array.from(mergedIndexMap.values());
          usePlaylistStore.setState({ index: mergedIndex, loaded: true });
        }

        if (
          fullPlaylists &&
          Array.isArray(fullPlaylists) &&
          fullPlaylists.length > 0
        ) {
          const map = new Map(usePlaylistStore.getState().playlists);
          for (const pl of fullPlaylists) {
            if (pl && pl.id) {
              map.set(pl.id, pl);
              try {
                await playlistFileService.savePlaylist(pl);
              } catch {
                /* ignore */
              }
            }
          }
          usePlaylistStore.setState({ playlists: map });
        }

        if (favorites) {
          const tracks = favorites.tracks || [];
          const albums = favorites.albums || [];
          const artists = favorites.artists || [];
          useFavoritesStore.setState({
            tracks,
            albums,
            artists,
            loaded: true,
          });

          try {
            const favStore = new LazyStore('favorites.json');
            await favStore.set('favorites.tracks', tracks);
            await favStore.set('favorites.albums', albums);
            await favStore.set('favorites.artists', artists);
            await favStore.save();
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch user data from server:', err);
    } finally {
      isHydratedFromServer = true;
      registerBuiltInWebProviders();
    }
  },
}));

let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutoSync() {
  if (!isHydratedFromServer) {
    return;
  }
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    useAuthStore.getState().syncDataToServer();
  }, 1000);
}

// Automatic store subscriptions for instant auto-saving across all devices
if (typeof window !== 'undefined') {
  useFavoritesStore.subscribe(() => scheduleAutoSync());
  usePlaylistStore.subscribe(() => scheduleAutoSync());

  setTimeout(() => {
    registerBuiltInWebProviders();
    useAuthStore.getState().fetchDataFromServer();
  }, 50);
}
