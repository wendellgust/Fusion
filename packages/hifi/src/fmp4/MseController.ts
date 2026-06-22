import { audioLog } from '../logger';
import { parseInitSegment, SegmentReference } from './parser';

const HEADER_FETCH_SIZE = 8192;
const LOOKAHEAD_SECONDS = 30;
const SEEK_PREFETCH_COUNT = 3;
const MAX_CONSECUTIVE_FETCH_FAILURES = 20;
const MAX_SEGMENT_APPEND_RETRIES = 3;
const FETCH_RETRY_DELAYS_MS = [500, 1500, 4000];

type MseBackend = {
  Constructor: typeof MediaSource;
  managed: boolean;
};

function getMseBackend(): MseBackend | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  if ('ManagedMediaSource' in window) {
    return {
      Constructor: (window as unknown as Record<string, typeof MediaSource>)
        .ManagedMediaSource,
      managed: true,
    };
  }

  if ('MediaSource' in window) {
    return { Constructor: MediaSource, managed: false };
  }

  return undefined;
}

function waitForUpdateEnd(sourceBuffer: SourceBuffer): Promise<void> {
  return new Promise((resolve) => {
    if (!sourceBuffer.updating) {
      resolve();
      return;
    }

    const onUpdateEnd = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd);
      resolve();
    };
    sourceBuffer.addEventListener('updateend', onUpdateEnd);
  });
}

function findSegmentForTime(
  time: number,
  segments: SegmentReference[],
): number {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const segment = segments[mid];

    if (time < segment.startTime) {
      high = mid - 1;
    } else if (time >= segment.endTime) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
  }
}

// The proxy returns 502 when the upstream (YouTube) returns an error.
// The upstream status is embedded in the response body.
function parseUpstreamStatus(body: string): number | undefined {
  const match = body.match(/(\d{3})/);
  return match ? parseInt(match[1]) : undefined;
}

async function fetchRange(
  url: string,
  startByte: number,
  endByte: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Range: `bytes=${startByte}-${endByte}` },
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    const upstreamStatus =
      response.status === 502 ? parseUpstreamStatus(body) : undefined;
    throw new FetchError(
      body || `Fetch failed with status ${response.status}`,
      response.status,
      upstreamStatus,
    );
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function fetchRangeWithRetry(
  url: string,
  startByte: number,
  endByte: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    if (signal.aborted) {
      throw new Error('aborted');
    }
    try {
      return await fetchRange(url, startByte, endByte, signal);
    } catch (error) {
      lastError = error;
      if (signal.aborted) {
        throw error;
      }
      const isExpiredUrl =
        error instanceof FetchError && error.upstreamStatus === 403;
      const isRetryable =
        !isExpiredUrl &&
        (!(error instanceof FetchError) || error.status >= 500);
      const delay = FETCH_RETRY_DELAYS_MS[attempt];
      if (!isRetryable || delay === undefined) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function isTimeBuffered(sourceBuffer: SourceBuffer, time: number): boolean {
  const { buffered } = sourceBuffer;
  for (let index = 0; index < buffered.length; index++) {
    if (time >= buffered.start(index) && time < buffered.end(index)) {
      return true;
    }
  }
  return false;
}

// End of the buffered range the playhead is in — not the end of the last
// range. Using the last range hides holes between the playhead and the end
// of the buffer, and a hole is exactly where the decoder stalls.
function contiguousBufferedEnd(
  sourceBuffer: SourceBuffer,
  time: number,
): number {
  const { buffered } = sourceBuffer;
  for (let index = 0; index < buffered.length; index++) {
    if (time >= buffered.start(index) - 0.1 && time <= buffered.end(index)) {
      return buffered.end(index);
    }
  }
  return time;
}

export class MseController {
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private segments: SegmentReference[] = [];
  private initSegment: Uint8Array | null = null;
  private fetchedSegments = new Set<number>();
  private abortController: AbortController | null = null;
  private objectUrl: string | null = null;
  private url = '';
  private isFetching = false;
  private onError?: (error: Error) => void;
  private consecutiveFailures = 0;
  private failed = false;
  private permanentlyFailed = false;
  private segmentRetryCounts = new Map<number, number>();
  private abandonedSegments = new Set<number>();

  async init(
    audio: HTMLAudioElement,
    url: string,
    durationSeconds: number,
    codec?: string,
    onError?: (error: Error) => void,
  ): Promise<void> {
    this.url = url;
    this.onError = onError;
    const abortController = new AbortController();
    this.abortController = abortController;
    const { signal } = abortController;

    let headerBytes: Uint8Array;
    try {
      headerBytes = await fetchRange(url, 0, HEADER_FETCH_SIZE - 1, signal);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error
          : new Error(`Failed to load stream: ${url}`),
      );
      return;
    }

    let index;
    try {
      index = parseInitSegment(headerBytes);
    } catch {
      onError?.(new Error('Failed to parse audio stream header'));
      return;
    }

    const { initSegmentEnd, segments } = index;
    this.segments = segments;

    const initSegment = headerBytes.slice(0, initSegmentEnd);
    this.initSegment = initSegment;
    this.fetchedSegments = new Set();

    const backend = getMseBackend();
    if (!backend) {
      return;
    }

    const mediaSource = new backend.Constructor();
    this.mediaSource = mediaSource;

    if (backend.managed) {
      audio.disableRemotePlayback = true;
      audio.srcObject = mediaSource;
    } else {
      const objectUrl = URL.createObjectURL(mediaSource);
      this.objectUrl = objectUrl;
      audio.src = objectUrl;
    }

    await new Promise<void>((resolve) => {
      const onSourceOpen = () => {
        mediaSource.removeEventListener('sourceopen', onSourceOpen);
        resolve();
      };
      mediaSource.addEventListener('sourceopen', onSourceOpen);
    });

    if (signal.aborted) {
      return;
    }

    const mimeType = `audio/mp4; codecs="${codec ?? 'mp4a.40.2'}"`;

    const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
    this.sourceBuffer = sourceBuffer;

    mediaSource.duration = durationSeconds;

    sourceBuffer.appendBuffer(initSegment.buffer as ArrayBuffer);
    await waitForUpdateEnd(sourceBuffer);

    if (signal.aborted || segments.length === 0) {
      return;
    }

    // Block timeupdate/watchdog-driven fetches until the first segment is
    // fully appended; concurrent appendBuffer calls throw InvalidStateError.
    this.isFetching = true;
    try {
      await this.fetchAndAppendSegment(0, signal);
    } finally {
      this.isFetching = false;
    }
  }

  handleTimeUpdate(audio: HTMLAudioElement): void {
    const { sourceBuffer, segments } = this;
    if (
      this.isFetching ||
      this.failed ||
      !sourceBuffer ||
      segments.length === 0
    ) {
      return;
    }

    const bufferedEnd = contiguousBufferedEnd(sourceBuffer, audio.currentTime);
    const lookAheadThreshold = audio.currentTime + LOOKAHEAD_SECONDS;

    if (bufferedEnd >= lookAheadThreshold) {
      return;
    }

    let nextIndex = this.findNextUnfetchedSegment(bufferedEnd);
    if (nextIndex === -1) {
      // Everything ahead is marked fetched yet the buffer ends early — a
      // segment was silently dropped after fetch. Un-mark it for refetch,
      // unless it's actually buffered and this is just edge rounding.
      const holeIndex = findSegmentForTime(bufferedEnd + 0.01, this.segments);
      if (
        holeIndex === -1 ||
        !this.fetchedSegments.has(holeIndex) ||
        this.abandonedSegments.has(holeIndex)
      ) {
        return;
      }
      const hole = this.segments[holeIndex];
      if (isTimeBuffered(sourceBuffer, (hole.startTime + hole.endTime) / 2)) {
        return;
      }
      this.fetchedSegments.delete(holeIndex);
      nextIndex = holeIndex;
    }

    const controller = this.abortController;
    if (!controller || controller.signal.aborted) {
      return;
    }

    this.isFetching = true;
    this.fetchAndAppendSegment(nextIndex, controller.signal).finally(() => {
      this.isFetching = false;
    });
  }

  async handleSeeking(audio: HTMLAudioElement): Promise<void> {
    const { sourceBuffer, segments, initSegment, abortController } = this;

    if (
      !sourceBuffer ||
      !initSegment ||
      !abortController ||
      abortController.signal.aborted ||
      segments.length === 0
    ) {
      return;
    }

    const seekTime = audio.currentTime;
    const targetIndex = findSegmentForTime(seekTime, segments);
    if (targetIndex === -1) {
      return;
    }

    if (isTimeBuffered(sourceBuffer, seekTime)) {
      return;
    }

    try {
      if (sourceBuffer.updating) {
        sourceBuffer.abort();
      }
      sourceBuffer.remove(0, Infinity);
      await waitForUpdateEnd(sourceBuffer);
      this.fetchedSegments.clear();
      this.segmentRetryCounts.clear();
      this.abandonedSegments.clear();

      if (abortController.signal.aborted) {
        return;
      }

      sourceBuffer.appendBuffer(initSegment.buffer as ArrayBuffer);
      await waitForUpdateEnd(sourceBuffer);

      if (abortController.signal.aborted) {
        return;
      }

      const lastIndex = Math.min(
        targetIndex + SEEK_PREFETCH_COUNT,
        segments.length,
      );
      for (
        let segmentIndex = targetIndex;
        segmentIndex < lastIndex;
        segmentIndex++
      ) {
        if (abortController.signal.aborted) {
          return;
        }
        await this.fetchAndAppendSegment(segmentIndex, abortController.signal);
      }
    } catch {
      return;
    }
  }

  destroy(audio: HTMLAudioElement | null): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (audio && audio.srcObject) {
      audio.srcObject = null;
    }

    const mediaSource = this.mediaSource;
    if (mediaSource && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream();
      } catch {
        // MediaSource may already be closing
      }
    }

    this.mediaSource = null;
    this.sourceBuffer = null;
    this.segments = [];
    this.initSegment = null;
    this.fetchedSegments = new Set();
    this.url = '';
    this.onError = undefined;
    this.consecutiveFailures = 0;
    this.failed = false;
    this.permanentlyFailed = false;
    this.segmentRetryCounts = new Map();
    this.abandonedSegments = new Set();
  }

  get isRecoverable(): boolean {
    return !this.permanentlyFailed;
  }

  resetFailed(): void {
    this.failed = false;
    this.consecutiveFailures = 0;
  }

  private registerSegmentFailure(
    segmentIndex: number,
    error: unknown,
    fallbackMessage: string,
  ): void {
    // Un-mark the segment so the next refill attempt retries it.
    this.fetchedSegments.delete(segmentIndex);
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FETCH_FAILURES) {
      this.failed = true;
      this.onError?.(
        error instanceof Error ? error : new Error(fallbackMessage),
      );
    }
  }

  private findNextUnfetchedSegment(bufferedEnd: number): number {
    for (let index = 0; index < this.segments.length; index++) {
      if (this.fetchedSegments.has(index)) {
        continue;
      }
      // Match by endTime, not startTime: the real buffered end (from the
      // media's own timestamps) can drift a few ms past the sidx-derived
      // startTime of the next segment, which would skip it forever and
      // leave a permanent hole. Re-appending overlap is harmless.
      if (this.segments[index].endTime > bufferedEnd + 0.01) {
        return index;
      }
    }
    return -1;
  }

  private async fetchAndAppendSegment(
    segmentIndex: number,
    signal: AbortSignal,
  ): Promise<void> {
    const { segments, sourceBuffer } = this;

    if (!sourceBuffer || segmentIndex >= segments.length) {
      return;
    }

    if (this.fetchedSegments.has(segmentIndex)) {
      return;
    }

    this.fetchedSegments.add(segmentIndex);

    const segment = segments[segmentIndex];

    let segmentData: Uint8Array;
    try {
      segmentData = await fetchRangeWithRetry(
        this.url,
        segment.startByte,
        segment.endByte,
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        this.fetchedSegments.delete(segmentIndex);
        return;
      }
      // YouTube returns 403 when signed URL expires; proxy wraps it as 502.
      // Retrying the same URL is pointless — signal for re-resolution.
      if (error instanceof FetchError && error.upstreamStatus === 403) {
        this.failed = true;
        this.permanentlyFailed = true;
        this.onError?.(new Error('stream:expired'));
        return;
      }
      this.registerSegmentFailure(
        segmentIndex,
        error,
        'Failed to fetch audio segment',
      );
      return;
    }

    if (signal.aborted) {
      this.fetchedSegments.delete(segmentIndex);
      return;
    }

    try {
      if (sourceBuffer.updating) {
        await waitForUpdateEnd(sourceBuffer);
      }
      sourceBuffer.appendBuffer(segmentData.buffer as ArrayBuffer);
      await waitForUpdateEnd(sourceBuffer);
    } catch (error) {
      this.registerSegmentFailure(
        segmentIndex,
        error,
        'Failed to append audio segment',
      );
      return;
    }

    // SourceBuffer can accept an append and still drop the data without a
    // synchronous error (async parse/decode failure). That leaves a hole in
    // the buffer that stalls the decoder at a fixed position, so verify the
    // segment actually landed before considering it done.
    const segmentMidTime = (segment.startTime + segment.endTime) / 2;
    if (!isTimeBuffered(sourceBuffer, segmentMidTime)) {
      const retries = (this.segmentRetryCounts.get(segmentIndex) ?? 0) + 1;
      this.segmentRetryCounts.set(segmentIndex, retries);
      audioLog(
        'warn',
        `MSE append of segment ${segmentIndex} (${segment.startTime.toFixed(1)}s-${segment.endTime.toFixed(1)}s) was not buffered, attempt ${retries}`,
      );
      if (retries < MAX_SEGMENT_APPEND_RETRIES) {
        this.fetchedSegments.delete(segmentIndex);
      } else {
        // Decoder keeps rejecting this segment; keep it marked fetched so
        // refill moves on, and let the stall watchdog jump the hole.
        this.abandonedSegments.add(segmentIndex);
      }
      return;
    }

    this.consecutiveFailures = 0;

    const allFetched = this.fetchedSegments.size === segments.length;
    const mediaSource = this.mediaSource;

    if (
      allFetched &&
      mediaSource &&
      mediaSource.readyState === 'open' &&
      !sourceBuffer.updating
    ) {
      mediaSource.endOfStream();
    }
  }
}
