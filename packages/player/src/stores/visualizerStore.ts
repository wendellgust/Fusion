import { create } from 'zustand';

type VisualizerState = {
  analyser: AnalyserNode | null;
  mode: 'spectrum' | 'oscilloscope';
};

type VisualizerActions = {
  setAnalyser: (analyser: AnalyserNode | null) => void;
  setMode: (mode: 'spectrum' | 'oscilloscope') => void;
};

export const useVisualizerStore = create<VisualizerState & VisualizerActions>(
  (set) => ({
    analyser: null,
    mode: 'spectrum',
    setAnalyser: (analyser) => set({ analyser }),
    setMode: (mode) => set({ mode }),
  }),
);
