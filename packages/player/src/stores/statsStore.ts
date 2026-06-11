import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Track } from '@nuclearplayer/model';
import { formatArtistNames, pickArtwork } from '@nuclearplayer/model';
import { eventBus } from '../services/eventBus';

const STATS_FILE = 'stats.json';
const store = new LazyStore(STATS_FILE);

export interface PlayHistoryEntry {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  timestamp: number;
  durationMs?: number;
}

type StatsState = {
  history: PlayHistoryEntry[];
  loaded: boolean;

  loadFromDisk: () => Promise<void>;
  addPlay: (track: Track) => Promise<void>;
  clearHistory: () => Promise<void>;
};

const saveToDisk = async (): Promise<void> => {
  const state = useStatsStore.getState();
  await store.set('stats.history', state.history);
  await store.save();
};

let lastLoggedTrackKey = '';
let lastLoggedTimestamp = 0;

export const useStatsStore = create<StatsState>((set, get) => ({
  history: [],
  loaded: false,

  loadFromDisk: async () => {
    const history = (await store.get<PlayHistoryEntry[]>('stats.history')) ?? [];
    set({ history, loaded: true });
  },

  addPlay: async (track: Track) => {
    if (!track || !track.title) return;
    
    const artist = formatArtistNames(track.artists || []);
    const trackKey = `${track.title} - ${artist}`;
    const now = Date.now();

    if (trackKey === lastLoggedTrackKey && now - lastLoggedTimestamp < 10000) {
      return;
    }

    lastLoggedTrackKey = trackKey;
    lastLoggedTimestamp = now;

    const entry: PlayHistoryEntry = {
      id: uuidv4(),
      title: track.title,
      artist: artist,
      artworkUrl: pickArtwork(track.artwork, 'thumbnail', 64)?.url,
      timestamp: now,
      durationMs: track.durationMs
    };

    const currentHistory = get().history;
    const newHistory = [entry, ...currentHistory].slice(0, 5000);

    set({ history: newHistory });
    await saveToDisk();
  },

  clearHistory: async () => {
    set({ history: [] });
    await saveToDisk();
  }
}));

export const initializeStatsStore = async (): Promise<void> => {
  await useStatsStore.getState().loadFromDisk();

  eventBus.on('trackStarted', async (track) => {
    await useStatsStore.getState().addPlay(track);
  });
};
