# CLAUDEDOING

**Project**: Fusion — personal build of the Nuclear music player (Tauri + React + TypeScript) with Pomodoro, live lyrics, queue-to-playlist, and waveform visualizer.

**Run**: `cd packages/player && npx tauri dev` (kills old server first with `fuser -k 5173/tcp && pkill -f 'target/debug/player'`)

**Changed**:
- `packages/hifi/src/fmp4/MseController.ts`: `MAX_CONSECUTIVE_FETCH_FAILURES` 5→20, added `FetchError` class with status code, added `fetchRangeWithRetry` with 3-attempt exponential backoff (500/1500/4000ms) for 5xx errors, added `resetFailed()` public method
- `packages/hifi/src/hooks/useMseSource.ts`: watchdog now calls `controller.resetFailed()` + re-triggers `handleTimeUpdate` when stuck with no bufferable gap (recovers from YouTube 502-induced stall)
- `packages/player/src/components/LyricsPanel.tsx`: added `pickBestResult()` helper — duration-based filtering on search fallback (±15s tolerance, prefers synced lyrics)
- `packages/player/src/views/Lyrics/LyricsView.tsx`: full redesign — proximity-aware opacity/size per line, purple glow on current, waveform at bottom-right, track info strip at bottom, radial dark vignette over blurred artwork

**Changing**: nothing

**Will Change**: nothing planned

---
*Session 2026-06-21*:
- `metadataHost.ts`: `search()` now fans out to ALL registered metadata providers (Spotify, YouTube, MusicBrainz, etc.) and merges results; single-provider search preserved when `providerId` is given explicitly
- `Search.tsx`: artist/album navigation now uses `item.source.provider` (from the result) instead of `provider.id` (the active provider), so clicking a Spotify result loads Spotify's artist page
