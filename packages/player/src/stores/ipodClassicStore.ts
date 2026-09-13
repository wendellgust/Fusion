import { create } from 'zustand';

export type IpodTheme = 'classic' | 'black';

interface IpodClassicState {
  isOpen: boolean;
  theme: IpodTheme;
  soundEnabled: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setTheme: (theme: IpodTheme) => void;
  toggleSound: () => void;
}

export const useIpodClassicStore = create<IpodClassicState>((set) => ({
  isOpen: false,
  theme: 'classic',
  soundEnabled: true,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setTheme: (theme) => set({ theme }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
}));
