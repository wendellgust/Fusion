import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

const BLOCKS_FILE = 'blocks.json';
const store = new LazyStore(BLOCKS_FILE);

type BlockState = {
  blockedArtists: string[];
  blockedGenres: string[];
  loaded: boolean;

  loadFromDisk: () => Promise<void>;
  addBlockedArtist: (artist: string) => Promise<void>;
  removeBlockedArtist: (artist: string) => Promise<void>;
  isArtistBlocked: (artist: string) => boolean;

  addBlockedGenre: (genre: string) => Promise<void>;
  removeBlockedGenre: (genre: string) => Promise<void>;
  isGenreBlocked: (genre: string) => boolean;
};

const saveToDisk = async (): Promise<void> => {
  const state = useBlockStore.getState();
  await store.set('blocks.artists', state.blockedArtists);
  await store.set('blocks.genres', state.blockedGenres);
  await store.save();
};

export const useBlockStore = create<BlockState>((set, get) => ({
  blockedArtists: [],
  blockedGenres: [],
  loaded: false,

  loadFromDisk: async () => {
    const blockedArtists = (await store.get<string[]>('blocks.artists')) ?? [];
    const blockedGenres = (await store.get<string[]>('blocks.genres')) ?? [];
    set({ blockedArtists, blockedGenres, loaded: true });
  },

  addBlockedArtist: async (artist: string) => {
    const trimmed = artist.trim();
    if (!trimmed) return;
    const current = get().blockedArtists;
    if (current.some(a => a.toLowerCase() === trimmed.toLowerCase())) return;
    set({ blockedArtists: [...current, trimmed] });
    await saveToDisk();
  },

  removeBlockedArtist: async (artist: string) => {
    const trimmed = artist.trim();
    set({
      blockedArtists: get().blockedArtists.filter(
        a => a.toLowerCase() !== trimmed.toLowerCase()
      )
    });
    await saveToDisk();
  },

  isArtistBlocked: (artist: string) => {
    if (!artist) return false;
    return get().blockedArtists.some(
      a => a.toLowerCase() === artist.trim().toLowerCase()
    );
  },

  addBlockedGenre: async (genre: string) => {
    const trimmed = genre.trim();
    if (!trimmed) return;
    const current = get().blockedGenres;
    if (current.some(g => g.toLowerCase() === trimmed.toLowerCase())) return;
    set({ blockedGenres: [...current, trimmed] });
    await saveToDisk();
  },

  removeBlockedGenre: async (genre: string) => {
    const trimmed = genre.trim();
    set({
      blockedGenres: get().blockedGenres.filter(
        g => g.toLowerCase() !== trimmed.toLowerCase()
      )
    });
    await saveToDisk();
  },

  isGenreBlocked: (genre: string) => {
    if (!genre) return false;
    return get().blockedGenres.some(
      g => g.toLowerCase() === genre.trim().toLowerCase()
    );
  }
}));

export const initializeBlockStore = async (): Promise<void> => {
  await useBlockStore.getState().loadFromDisk();
};
