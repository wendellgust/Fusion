import { create } from 'zustand';
import { usePlaylistStore } from '../stores/playlistStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { registerBuiltInWebProviders } from './builtInWebProviders';

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

function getStoredAuth(): UserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
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
  if (typeof window === 'undefined') return;
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
  if (!dump || typeof window === 'undefined') return;
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
      registerBuiltInWebProviders();
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Login error', isLoading: false });
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

      await get().syncDataToServer();
      registerBuiltInWebProviders();
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Registration error', isLoading: false });
      return false;
    }
  },

  logout: () => {
    setStoredAuth(null);
    clearWebStorageForAccountSwitch();
    useFavoritesStore.setState({ tracks: [], albums: [], artists: [] });
    usePlaylistStore.setState({ index: [], playlists: new Map() });
    set({ user: null, error: null });
    registerBuiltInWebProviders();
  },

  syncDataToServer: async () => {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('Failed to sync user data to server:', err);
    }
  },

  fetchDataFromServer: async () => {
    const { user } = get();
    const token = user?.token || 'default-token';

    try {
      const res = await fetch(`/api/user/data?token=${token}`);
      if (!res.ok) return;
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
            if (item && item.id) mergedIndexMap.set(item.id, item);
          }
          for (const item of playlists) {
            if (item && item.id) mergedIndexMap.set(item.id, item);
          }
          const mergedIndex = Array.from(mergedIndexMap.values());
          usePlaylistStore.setState({ index: mergedIndex, loaded: true });
        }
        if (fullPlaylists && Array.isArray(fullPlaylists)) {
          const map = new Map(usePlaylistStore.getState().playlists);
          for (const pl of fullPlaylists) {
            if (pl && pl.id) {
              map.set(pl.id, pl);
            }
          }
          usePlaylistStore.setState({ playlists: map });
        }
        if (favorites) {
          useFavoritesStore.setState({
            tracks: favorites.tracks || [],
            albums: favorites.albums || [],
            artists: favorites.artists || [],
            loaded: true,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch user data from server:', err);
    } finally {
      registerBuiltInWebProviders();
    }
  },
}));

let syncTimer: any = null;
function scheduleAutoSync() {
  if (syncTimer) clearTimeout(syncTimer);
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
  }, 100);
}
