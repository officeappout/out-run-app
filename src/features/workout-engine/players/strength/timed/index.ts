/**
 * Timed blocks (AMRAP / EMOM / Tabata) inside the strength player — home v2
 * only. StrengthRunner calls useTimedSegment (cheap gate + a stable store),
 * mounts <TimedRuntime> (the engine, a leaf) and the subscribing screens.
 * With the flag off (or in a hybrid station) everything here is inert.
 */
export { useTimedSegment } from './hooks/useTimedSegment';
export type { TimedSegmentGate } from './hooks/useTimedSegment';
export { useMixedStoryBars } from './hooks/useMixedStoryBars';
export { useTimedPlaylistRenderer } from './hooks/useTimedPlaylistRenderer';
export { default as TimedRuntime } from './components/TimedRuntime';
export { default as TimedBlockPlayer } from './components/TimedBlockPlayer';
export { default as TimedListBehind } from './components/TimedListBehind';
export { default as TimedMiniPlayerBar } from './components/TimedMiniPlayerBar';
export { mergeSegmentLog, segmentLogId, resolveTimedSegment } from './logic/timed-segment';
export { timedResultsFor } from './state/timed-results';
