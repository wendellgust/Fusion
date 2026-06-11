import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

export type RadioStation = {
  id: string;
  name: string;
  url: string;
  logoUrl?: string;
};

const RADIO_FILE = 'radio_stations.json';
const store = new LazyStore(RADIO_FILE);

type RadioState = {
  stations: RadioStation[];
  loaded: boolean;
  loadFromDisk: () => Promise<void>;
  addStation: (station: Omit<RadioStation, 'id'>) => Promise<void>;
  removeStation: (id: string) => Promise<void>;
  editStation: (id: string, updates: Partial<RadioStation>) => Promise<void>;
};

const saveToDisk = async (): Promise<void> => {
  const state = useRadioStore.getState();
  await store.set('radio.stations', state.stations);
  await store.save();
};

export const useRadioStore = create<RadioState>((set) => ({
  stations: [],
  loaded: false,

  loadFromDisk: async () => {
    let stations =
      (await store.get<RadioStation[]>('radio.stations')) ?? [];
    
    // Provide some default popular radio stations if empty
    if (stations.length === 0) {
      const defaultStations: RadioStation[] = [
        {
          id: 'def-1',
          name: 'SomaFM Groove Salad',
          url: 'https://ice3.somafm.com/groovesalad-128-mp3',
        },
        {
          id: 'def-2',
          name: 'SomaFM Space Station Soma',
          url: 'https://ice3.somafm.com/spacestation-128-mp3',
        },
        {
          id: 'def-3',
          name: 'Chillhop Lounge',
          url: 'https://streams.fluxfm.de/Chillhop/mp3-128/',
        },
      ];
      set({ stations: defaultStations, loaded: true });
      await store.set('radio.stations', defaultStations);
      await store.save();
    } else {
      // Migrate old non-working URLs to updated active ones
      let migrated = false;
      stations = stations.map((s) => {
        if (s.url === 'https://ice1.somafm.com/groovesalad-128-mp3') {
          migrated = true;
          return { ...s, url: 'https://ice3.somafm.com/groovesalad-128-mp3' };
        }
        if (s.url === 'https://ice1.somafm.com/spacestation-128-mp3') {
          migrated = true;
          return { ...s, url: 'https://ice3.somafm.com/spacestation-128-mp3' };
        }
        if (s.url === 'https://stream.zeno.fm/f3wvbbqbef8uv') {
          migrated = true;
          return {
            ...s,
            name: 'Chillhop Lounge',
            url: 'https://streams.fluxfm.de/Chillhop/mp3-128/',
          };
        }
        return s;
      });

      set({ stations, loaded: true });
      if (migrated) {
        await store.set('radio.stations', stations);
        await store.save();
      }
    }
  },

  addStation: async (newStation) => {
    const id = Date.now().toString();
    const station = { ...newStation, id };
    set((state) => ({ stations: [...state.stations, station] }));
    await saveToDisk();
  },

  removeStation: async (id) => {
    set((state) => ({
      stations: state.stations.filter((s) => s.id !== id),
    }));
    await saveToDisk();
  },

  editStation: async (id, updates) => {
    set((state) => ({
      stations: state.stations.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      ),
    }));
    await saveToDisk();
  },
}));

export const initializeRadioStore = async (): Promise<void> => {
  await useRadioStore.getState().loadFromDisk();
};
