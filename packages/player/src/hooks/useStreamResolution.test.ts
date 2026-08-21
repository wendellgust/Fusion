import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockTrack } from '../test/utils/mockTrack';
import { useQueueStore } from '../stores/queueStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSoundStore } from '../stores/soundStore';
import {
  handleCurrentTrackFailure,
  resetStreamResolutionFailuresForTesting,
  STREAM_CACHE_WINDOW_SIZE,
} from './useStreamResolution';

describe('useStreamResolution - Cache and Error Handling', () => {
  const mockT = vi.fn((key: string) => key) as any;

  beforeEach(() => {
    resetStreamResolutionFailuresForTesting();
    useQueueStore.setState({
      items: [],
      currentIndex: 0,
      isReady: true,
      isLoading: false,
    });
    useSettingsStore.setState({ values: {} });
    useSoundStore.setState({
      src: null,
      status: 'stopped',
      seek: 0,
      duration: 0,
    });
  });

  it('defines cache window size as 5', () => {
    expect(STREAM_CACHE_WINDOW_SIZE).toBe(5);
  });

  it('moves failed 1st track to after 5th track, advancing 6th to 5th and playing 2nd as new 1st', () => {
    const tracks = ['Song 1', 'Song 2', 'Song 3', 'Song 4', 'Song 5', 'Song 6', 'Song 7'].map(
      (title) => createMockTrack(title),
    );
    useQueueStore.getState().addToQueue(tracks);
    useQueueStore.setState({ currentIndex: 0 });

    handleCurrentTrackFailure(mockT);

    const items = useQueueStore.getState().items;
    const titles = items.map((i) => i.track.title);

    // Song 1 failed -> moved to index 5 (after Song 2..6)
    // Song 6 advanced to 5th position in window
    // Song 2 is now at index 0 (the new 1st)
    expect(titles).toEqual([
      'Song 2',
      'Song 3',
      'Song 4',
      'Song 5',
      'Song 6',
      'Song 1',
      'Song 7',
    ]);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('moves failed track to end of queue when fewer than 6 tracks in queue', () => {
    const tracks = ['Song A', 'Song B', 'Song C'].map((title) =>
      createMockTrack(title),
    );
    useQueueStore.getState().addToQueue(tracks);
    useQueueStore.setState({ currentIndex: 0 });

    handleCurrentTrackFailure(mockT);

    const items = useQueueStore.getState().items;
    const titles = items.map((i) => i.track.title);

    expect(titles).toEqual(['Song B', 'Song C', 'Song A']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('stops playback and sets error if all tracks fail consecutively', () => {
    const tracks = ['Track 1', 'Track 2'].map((title) =>
      createMockTrack(title),
    );
    useQueueStore.getState().addToQueue(tracks);
    useQueueStore.setState({ currentIndex: 0 });

    // 1st failure: Track 1 -> moved to index 1, Track 2 is now index 0
    handleCurrentTrackFailure(mockT);
    expect(useQueueStore.getState().items[0].track.title).toBe('Track 2');

    // 2nd failure: Track 2 fails -> all tracks in queue have failed
    handleCurrentTrackFailure(mockT);
    expect(useSoundStore.getState().status).toBe('stopped');
  });
});
