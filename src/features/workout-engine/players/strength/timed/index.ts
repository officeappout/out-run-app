/**
 * Timed blocks (AMRAP / EMOM / Tabata) inside the strength player — home v2
 * only. StrengthRunner mounts useTimedSegment; with the flag off (or in a
 * hybrid station) it is inert and the player is exactly today's.
 */
export { useTimedSegment } from './hooks/useTimedSegment';
export type { TimedSegmentApi, UseTimedSegmentInput } from './hooks/useTimedSegment';
export { useMixedStoryBars } from './hooks/useMixedStoryBars';
export { default as TimedBlockPlayer } from './components/TimedBlockPlayer';
export { default as TimedListBehind } from './components/TimedListBehind';
export { mergeSegmentLog, segmentLogId, resolveTimedSegment } from './logic/timed-segment';
export { miniPlayerInfo } from './logic/timed-labels';
