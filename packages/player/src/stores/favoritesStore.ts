import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

import type {
  AlbumRef,
  ArtistRef,
  ProviderRef,
  Track,
} from '@nuclearplayer/model';
import type { FavoriteEntry, FavoritesData } from '@nuclearplayer/plugin-sdk';

export type { FavoriteEntry, FavoritesData };

const FAVORITES_FILE = 'favorites.json';
const store = new LazyStore(FAVORITES_FILE);

type RefWithSource = { source: ProviderRef };

type FavoritesState = FavoritesData & {
  loaded: boolean;

  loadFromDisk: () => Promise<void>;

  addTrack: (track: Track) => Promise<void>;
  removeTrack: (source: ProviderRef) => Promise<void>;
  isTrackFavorite: (source: ProviderRef) => boolean;

  addAlbum: (ref: AlbumRef) => Promise<void>;
  removeAlbum: (source: ProviderRef) => Promise<void>;
  isAlbumFavorite: (source: ProviderRef) => boolean;

  addArtist: (ref: ArtistRef) => Promise<void>;
  removeArtist: (source: ProviderRef) => Promise<void>;
  isArtistFavorite: (source: ProviderRef) => boolean;
};

const matchesEntry = (
  entryRef: {
    source?: ProviderRef;
    title?: string;
    name?: string;
    artists?: Array<{ name: string }>;
    artist?: string;
  },
  target:
    | ProviderRef
    | {
        source?: ProviderRef;
        title?: string;
        name?: string;
        artists?: Array<{ name: string }>;
        artist?: string;
      },
): boolean => {
  if (!entryRef || !target) {
    return false;
  }

  const targetSource = 'provider' in target ? target : target.source;
  const entrySource = entryRef.source;

  if (
    entrySource &&
    targetSource &&
    entrySource.provider &&
    targetSource.provider &&
    entrySource.id &&
    targetSource.id
  ) {
    if (
      entrySource.provider === targetSource.provider &&
      String(entrySource.id) === String(targetSource.id)
    ) {
      return true;
    }
  }

  // Fallback: match by title and artist name
  const entryTitle = (entryRef.title || entryRef.name || '')
    .toLowerCase()
    .trim();
  const targetTitle = (
    ('title' in target ? target.title : '') ||
    ('name' in target ? target.name : '') ||
    ''
  )
    .toLowerCase()
    .trim();

  const entryArtist = (entryRef.artists?.[0]?.name || entryRef.artist || '')
    .toLowerCase()
    .trim();
  const targetArtist = (
    ('artists' in target && Array.isArray(target.artists)
      ? target.artists[0]?.name
      : '') ||
    ('artist' in target ? (target.artist as string) : '') ||
    ''
  )
    .toLowerCase()
    .trim();

  if (entryTitle && targetTitle && entryTitle === targetTitle) {
    if (!entryArtist || !targetArtist || entryArtist === targetArtist) {
      return true;
    }
  }

  return false;
};

const saveToDisk = async (): Promise<void> => {
  const state = useFavoritesStore.getState();
  await store.set('favorites.tracks', state.tracks);
  await store.set('favorites.albums', state.albums);
  await store.set('favorites.artists', state.artists);
  await store.save();
};

type FavoritesKey = 'tracks' | 'albums' | 'artists';

const getList = <T extends RefWithSource>(key: FavoritesKey) =>
  useFavoritesStore.getState()[key] as unknown as FavoriteEntry<T>[];

type MatchableRef = {
  source?: ProviderRef;
  title?: string;
  name?: string;
  artists?: Array<{ name: string }>;
  artist?: string;
  id?: string;
};

const createAddFavorite =
  <T extends RefWithSource>(key: FavoritesKey) =>
  async (ref: T): Promise<void> => {
    if (!ref) {
      return;
    }
    const list = getList<T>(key);
    if (
      list.some((entry) =>
        matchesEntry(
          entry.ref as unknown as MatchableRef,
          ref as unknown as MatchableRef,
        ),
      )
    ) {
      return;
    }
    const safeRef = {
      ...ref,
      source: ref.source || {
        provider: 'custom',
        id:
          (ref as unknown as MatchableRef).id ||
          (ref as unknown as MatchableRef).title ||
          `${Date.now()}`,
      },
    };
    const entry: FavoriteEntry<T> = {
      ref: safeRef as T,
      addedAtIso: new Date().toISOString(),
    };
    useFavoritesStore.setState({ [key]: [...list, entry] });
    await saveToDisk();
  };

const createRemoveFavorite =
  <T extends RefWithSource>(key: FavoritesKey) =>
  async (target: ProviderRef | T): Promise<void> => {
    if (!target) {
      return;
    }
    const list = getList<T>(key);
    useFavoritesStore.setState({
      [key]: list.filter(
        (entry) =>
          !matchesEntry(
            entry.ref as unknown as MatchableRef,
            target as unknown as MatchableRef,
          ),
      ),
    });
    await saveToDisk();
  };

const createIsFavorite =
  <T extends RefWithSource>(key: FavoritesKey) =>
  (target: ProviderRef | T | undefined | null): boolean => {
    if (!target) {
      return false;
    }
    return getList<T>(key).some((entry) =>
      matchesEntry(
        entry.ref as unknown as MatchableRef,
        target as unknown as MatchableRef,
      ),
    );
  };

export const useFavoritesStore = create<FavoritesState>(() => ({
  tracks: [],
  albums: [],
  artists: [],
  loaded: false,

  loadFromDisk: async () => {
    const tracks =
      (await store.get<FavoriteEntry<Track>[]>('favorites.tracks')) ?? [];
    const albums =
      (await store.get<FavoriteEntry<AlbumRef>[]>('favorites.albums')) ?? [];
    const artists =
      (await store.get<FavoriteEntry<ArtistRef>[]>('favorites.artists')) ?? [];

    useFavoritesStore.setState({ tracks, albums, artists, loaded: true });
  },

  addTrack: createAddFavorite<Track>('tracks'),
  removeTrack: createRemoveFavorite<Track>('tracks'),
  isTrackFavorite: createIsFavorite<Track>('tracks'),

  addAlbum: createAddFavorite<AlbumRef>('albums'),
  removeAlbum: createRemoveFavorite<AlbumRef>('albums'),
  isAlbumFavorite: createIsFavorite<AlbumRef>('albums'),

  addArtist: createAddFavorite<ArtistRef>('artists'),
  removeArtist: createRemoveFavorite<ArtistRef>('artists'),
  isArtistFavorite: createIsFavorite<ArtistRef>('artists'),
}));

export const initializeFavoritesStore = async (): Promise<void> => {
  await useFavoritesStore.getState().loadFromDisk();
};
