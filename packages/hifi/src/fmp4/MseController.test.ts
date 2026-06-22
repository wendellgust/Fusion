import { MseController } from './MseController';
import { buildBoxWithPadding, buildSidxBox } from './test-helpers';

const TIMESCALE = 44100;
const SEGMENT_REFS = [
  { referencedSize: 50000, subsegmentDuration: TIMESCALE * 60 },
  { referencedSize: 60000, subsegmentDuration: TIMESCALE * 60 },
  { referencedSize: 45000, subsegmentDuration: TIMESCALE * 60 },
];

const FTYP = buildBoxWithPadding('ftyp', 20);
const MOOV = buildBoxWithPadding('moov', 100);
const SIDX = buildSidxBox({
  version: 0,
  timescale: TIMESCALE,
  earliestPresentationTime: 0,
  firstOffset: 0,
  references: SEGMENT_REFS,
});

const FAKE_HEADER = new Uint8Array([...FTYP, ...MOOV, ...SIDX]);
const INIT_SEGMENT_END = 120;

const HEADER_RESPONSE = new Uint8Array(8192);
HEADER_RESPONSE.set(FAKE_HEADER, 0);

const MSE_URL = 'http://127.0.0.1:3000/stream/test';

type EventHandler = (...args: unknown[]) => void;

class MockTimeRanges {
  private ranges: [number, number][] = [];
  get length() {
    return this.ranges.length;
  }
  start(index: number) {
    return this.ranges[index][0];
  }
  end(index: number) {
    return this.ranges[index][1];
  }
  addRange(start: number, end: number) {
    this.ranges.push([start, end]);
  }
}

class MockSourceBuffer {
  updating = false;
  buffered = new MockTimeRanges();
  private listeners: Record<string, EventHandler[]> = {};
  appendBuffer = vi.fn(() => {
    this.updating = true;
    Promise.resolve().then(() => {
      this.updating = false;
      this.fireEvent('updateend');
    });
  });
  remove = vi.fn(() => {
    this.updating = true;
    Promise.resolve().then(() => {
      this.updating = false;
      this.fireEvent('updateend');
    });
  });
  abort = vi.fn(() => {
    this.updating = false;
  });
  addEventListener = vi.fn((type: string, handler: EventHandler) => {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  });
  removeEventListener = vi.fn((type: string, handler: EventHandler) => {
    const handlers = this.listeners[type];
    if (handlers) {
      this.listeners[type] = handlers.filter(
        (existing) => existing !== handler,
      );
    }
  });
  fireEvent(type: string) {
    const handlers = this.listeners[type];
    if (handlers) {
      for (const handler of [...handlers]) {
        handler();
      }
    }
  }
}

class MockMediaSource {
  readyState = 'closed' as string;
  duration = 0;
  sourceBuffers: MockSourceBuffer[] = [];
  private listeners: Record<string, EventHandler[]> = {};

  addSourceBuffer = vi.fn((): MockSourceBuffer => {
    const sourceBuffer = new MockSourceBuffer();
    this.sourceBuffers.push(sourceBuffer);
    return sourceBuffer;
  });
  endOfStream = vi.fn(() => {
    this.readyState = 'ended';
  });
  addEventListener = vi.fn((type: string, handler: EventHandler) => {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  });
  removeEventListener = vi.fn((type: string, handler: EventHandler) => {
    const handlers = this.listeners[type];
    if (handlers) {
      this.listeners[type] = handlers.filter(
        (existing) => existing !== handler,
      );
    }
  });

  open() {
    this.readyState = 'open';
    this.fireEvent('sourceopen');
  }

  private fireEvent(type: string) {
    const handlers = this.listeners[type];
    if (handlers) {
      for (const handler of [...handlers]) {
        handler();
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = window as any;

let latestMediaSource: MockMediaSource | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURLSpy: ReturnType<
  typeof vi.fn<(obj: MediaSource | Blob) => string>
>;
let revokeObjectURLSpy: ReturnType<typeof vi.fn<(url: string) => void>>;
let originalMediaSource: unknown;
let originalManagedMediaSource: unknown;
let audio: HTMLAudioElement;

function makeSegmentData(size: number): Uint8Array {
  return new Uint8Array(size).fill(0xab);
}

function createFetchMock() {
  return vi.fn(async (_url: string, options?: RequestInit) => {
    const rangeHeader = (options?.headers as Record<string, string>)?.Range;
    if (!rangeHeader) {
      return { ok: true, arrayBuffer: async () => HEADER_RESPONSE.buffer };
    }

    const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
    if (!match) {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }

    const startByte = parseInt(match[1], 10);
    const endByte = parseInt(match[2], 10);

    if (startByte === 0 && endByte === 8191) {
      return {
        ok: true,
        arrayBuffer: async () => HEADER_RESPONSE.buffer.slice(0),
      };
    }

    const size = endByte - startByte + 1;
    return {
      ok: true,
      arrayBuffer: async () => makeSegmentData(size).buffer,
    };
  });
}

function installMocks() {
  originalMediaSource = win.MediaSource;
  originalManagedMediaSource = win.ManagedMediaSource;

  const MockMSConstructor = vi.fn(function () {
    latestMediaSource = new MockMediaSource();
    return latestMediaSource;
  });
  win.MediaSource = MockMSConstructor;
  delete win.ManagedMediaSource;

  fetchMock = createFetchMock();
  vi.stubGlobal('fetch', fetchMock);

  createObjectURLSpy = vi.fn(() => 'blob:mock-url');
  revokeObjectURLSpy = vi.fn();
  URL.createObjectURL = createObjectURLSpy;
  URL.revokeObjectURL = revokeObjectURLSpy;

  audio = document.createElement('audio');
  document.body.appendChild(audio);
}

function removeMocks() {
  if (originalMediaSource !== undefined) {
    win.MediaSource = originalMediaSource;
  } else {
    delete win.MediaSource;
  }

  if (originalManagedMediaSource !== undefined) {
    win.ManagedMediaSource = originalManagedMediaSource;
  } else {
    delete win.ManagedMediaSource;
  }

  latestMediaSource = null;
  vi.restoreAllMocks();

  if (audio && audio.parentNode) {
    audio.parentNode.removeChild(audio);
  }
}

async function initController(
  controller: MseController,
): Promise<MockMediaSource> {
  const initPromise = controller.init(audio, MSE_URL, 180);

  await vi.waitFor(() => expect(latestMediaSource).not.toBeNull());
  latestMediaSource!.open();

  await initPromise;
  return latestMediaSource!;
}

async function flushMicrotasks() {
  for (let round = 0; round < 10; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('MseController', () => {
  beforeEach(() => {
    installMocks();
  });

  afterEach(() => {
    removeMocks();
  });

  it('creates MediaSource and sets audio.src to object URL', async () => {
    const controller = new MseController();
    await initController(controller);

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(audio.src).toContain('blob:mock-url');
  });

  it('sets mediaSource.duration to the provided value', async () => {
    const controller = new MseController();
    await initController(controller);

    expect(latestMediaSource!.duration).toBe(180);
  });

  it('appends init segment to SourceBuffer on sourceopen', async () => {
    const controller = new MseController();
    const mediaSource = await initController(controller);

    const sourceBuffer = mediaSource.sourceBuffers[0];
    expect(sourceBuffer.appendBuffer).toHaveBeenCalled();

    const calls = sourceBuffer.appendBuffer.mock.calls as unknown[][];
    const firstAppendArg = calls[0][0] as ArrayBuffer;
    expect(new Uint8Array(firstAppendArg).byteLength).toBe(INIT_SEGMENT_END);
  });

  it('fetches first media segment after init segment is appended', async () => {
    const controller = new MseController();
    await initController(controller);

    expect(fetchMock).toHaveBeenCalledWith(
      MSE_URL,
      expect.objectContaining({
        headers: { Range: 'bytes=0-8191' },
      }),
    );

    const segmentFetchCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const opts = call[1] as { headers?: { Range?: string } } | undefined;
      const range = opts?.headers?.Range;
      return range && range !== 'bytes=0-8191';
    });

    expect(segmentFetchCall).toBeDefined();
  });

  it('does not create MediaSource when getMseBackend returns undefined', async () => {
    delete win.MediaSource;
    delete win.ManagedMediaSource;

    const controller = new MseController();
    await controller.init(audio, MSE_URL, 180);

    await flushMicrotasks();

    expect(latestMediaSource).toBeNull();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('cleans up on destroy', async () => {
    const controller = new MseController();
    const mediaSource = await initController(controller);

    controller.destroy(audio);

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    expect(mediaSource.endOfStream).toHaveBeenCalled();
  });

  it('destroy handles null audio gracefully', async () => {
    const controller = new MseController();
    await initController(controller);

    controller.destroy(null);

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('handles seeking by fetching the correct segment', async () => {
    const controller = new MseController();
    const mediaSource = await initController(controller);

    fetchMock.mockClear();

    const sourceBuffer = mediaSource.sourceBuffers[0];
    sourceBuffer.buffered = new MockTimeRanges();

    Object.defineProperty(audio, 'currentTime', {
      value: 90,
      writable: true,
      configurable: true,
    });

    await controller.handleSeeking(audio);
    await flushMicrotasks();

    const segmentFetchCalls = fetchMock.mock.calls.filter((call: unknown[]) => {
      const opts = call[1] as { headers?: { Range?: string } } | undefined;
      return opts?.headers?.Range && opts.headers.Range !== 'bytes=0-8191';
    });

    expect(segmentFetchCalls.length).toBeGreaterThan(0);
  });

  it('prefers ManagedMediaSource over MediaSource when available', async () => {
    const managedConstructor = vi.fn(function () {
      latestMediaSource = new MockMediaSource();
      return latestMediaSource;
    });
    win.ManagedMediaSource = managedConstructor;

    const controller = new MseController();
    await initController(controller);

    expect(managedConstructor).toHaveBeenCalledOnce();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(audio.srcObject).toBe(latestMediaSource);
  });

  it('fetches next segment on timeupdate when buffer is low', async () => {
    const controller = new MseController();
    const mediaSource = await initController(controller);

    fetchMock.mockClear();

    const sourceBuffer = mediaSource.sourceBuffers[0];
    sourceBuffer.buffered = new MockTimeRanges();
    sourceBuffer.buffered.addRange(0, 20);

    Object.defineProperty(audio, 'currentTime', {
      value: 10,
      writable: true,
      configurable: true,
    });

    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    const segmentFetchCalls = fetchMock.mock.calls.filter((call: unknown[]) => {
      const opts = call[1] as { headers?: { Range?: string } } | undefined;
      return opts?.headers?.Range && opts.headers.Range !== 'bytes=0-8191';
    });

    expect(segmentFetchCalls.length).toBeGreaterThan(0);
  });

  it('fetches next segment on timeupdate when buffer is empty', async () => {
    const controller = new MseController();
    const mediaSource = await initController(controller);

    fetchMock.mockClear();

    const sourceBuffer = mediaSource.sourceBuffers[0];
    sourceBuffer.buffered = new MockTimeRanges();

    Object.defineProperty(audio, 'currentTime', {
      value: 70,
      writable: true,
      configurable: true,
    });

    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    const segmentFetchCalls = fetchMock.mock.calls.filter((call: unknown[]) => {
      const opts = call[1] as { headers?: { Range?: string } } | undefined;
      return opts?.headers?.Range && opts.headers.Range !== 'bytes=0-8191';
    });

    expect(segmentFetchCalls.length).toBeGreaterThan(0);
  });

  it('retries a failed segment fetch on a later timeupdate', async () => {
    const controller = new MseController();
    const mediaSource = await initController(controller);

    const sourceBuffer = mediaSource.sourceBuffers[0];
    sourceBuffer.buffered = new MockTimeRanges();
    sourceBuffer.buffered.addRange(0, 60);

    Object.defineProperty(audio, 'currentTime', {
      value: 55,
      writable: true,
      configurable: true,
    });

    fetchMock.mockClear();
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    sourceBuffer.appendBuffer.mockClear();

    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sourceBuffer.appendBuffer).toHaveBeenCalled();
  });

  it('refetches a segment whose append did not extend the buffer', async () => {
    const controller = new MseController();
    await initController(controller);

    const getSegmentRanges = () =>
      fetchMock.mock.calls
        .map((call: unknown[]) => {
          const opts = call[1] as { headers?: { Range?: string } } | undefined;
          return opts?.headers?.Range;
        })
        .filter((range?: string) => range && range !== 'bytes=0-8191');

    // Mock buffered stays empty, so init's append of segment 0 fails the
    // buffered verification and the segment should be retried.
    const initialSegmentRange = getSegmentRanges()[0];
    expect(initialSegmentRange).toBeDefined();
    fetchMock.mockClear();

    Object.defineProperty(audio, 'currentTime', {
      value: 0,
      writable: true,
      configurable: true,
    });

    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    expect(getSegmentRanges()).toContain(initialSegmentRange);
  });

  it('abandons a segment after repeated silent append drops and moves on', async () => {
    const controller = new MseController();
    await initController(controller);

    const getSegmentRanges = () =>
      fetchMock.mock.calls
        .map((call: unknown[]) => {
          const opts = call[1] as { headers?: { Range?: string } } | undefined;
          return opts?.headers?.Range;
        })
        .filter((range?: string) => range && range !== 'bytes=0-8191');

    const firstSegmentRange = getSegmentRanges()[0];
    expect(firstSegmentRange).toBeDefined();

    Object.defineProperty(audio, 'currentTime', {
      value: 0,
      writable: true,
      configurable: true,
    });

    // Init was attempt 1; two more ticks exhaust the retries for segment 0.
    for (let tick = 0; tick < 2; tick++) {
      controller.handleTimeUpdate(audio);
      await flushMicrotasks();
    }

    fetchMock.mockClear();
    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    const segmentRanges = getSegmentRanges();

    // Segment 0 is abandoned; refill should fetch the next segment instead
    // of looping on the broken one forever.
    expect(segmentRanges.length).toBeGreaterThan(0);
    expect(segmentRanges).not.toContain(firstSegmentRange);
  });

  it('does not skip the next segment when buffered end drifts past its start time', async () => {
    const controller = new MseController();

    const initPromise = controller.init(audio, MSE_URL, 180);
    await vi.waitFor(() => expect(latestMediaSource).not.toBeNull());

    // Make appends land in a pre-existing buffered range whose end sits
    // slightly past segment 0's sidx end time (real-world timestamp drift).
    latestMediaSource!.addSourceBuffer.mockImplementation(
      (): MockSourceBuffer => {
        const sourceBuffer = new MockSourceBuffer();
        sourceBuffer.buffered.addRange(0, 60.05);
        latestMediaSource!.sourceBuffers.push(sourceBuffer);
        return sourceBuffer;
      },
    );

    latestMediaSource!.open();
    await initPromise;

    const segmentRanges = () =>
      fetchMock.mock.calls
        .map((call: unknown[]) => {
          const opts = call[1] as { headers?: { Range?: string } } | undefined;
          return opts?.headers?.Range;
        })
        .filter((range?: string) => range && range !== 'bytes=0-8191');

    const firstRange = segmentRanges()[0];
    const match = firstRange!.match(/bytes=(\d+)-(\d+)/)!;
    const segment1Range = `bytes=${Number(match[2]) + 1}-${
      Number(match[2]) + SEGMENT_REFS[1].referencedSize
    }`;
    fetchMock.mockClear();

    Object.defineProperty(audio, 'currentTime', {
      value: 50,
      writable: true,
      configurable: true,
    });

    controller.handleTimeUpdate(audio);
    await flushMicrotasks();

    expect(segmentRanges()).toContain(segment1Range);
  });

  it('reports an error after repeated segment fetch failures', async () => {
    const onError = vi.fn();
    const controller = new MseController();

    const initPromise = controller.init(
      audio,
      MSE_URL,
      180,
      undefined,
      onError,
    );
    await vi.waitFor(() => expect(latestMediaSource).not.toBeNull());
    latestMediaSource!.open();
    await initPromise;

    const sourceBuffer = latestMediaSource!.sourceBuffers[0];
    sourceBuffer.buffered = new MockTimeRanges();
    sourceBuffer.buffered.addRange(0, 60);

    Object.defineProperty(audio, 'currentTime', {
      value: 55,
      writable: true,
      configurable: true,
    });

    fetchMock.mockRejectedValue(new Error('HTTP 403'));

    for (let attempt = 0; attempt < 6; attempt++) {
      controller.handleTimeUpdate(audio);
      await flushMicrotasks();
    }

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);

    fetchMock.mockClear();
    controller.handleTimeUpdate(audio);
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
