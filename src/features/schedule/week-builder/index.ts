/**
 * Week builder (enable_week_builder_v1) — the reusable two-level schedule UI's logic.
 * A host turns its engine-v2 week into a WbWeek (adapters/*), mounts <WeekBuilder> with a
 * WeekBuilderEngine (createWeekEngine), and turns the edited week back into its own write.
 * Phase 2 (re-arranging the current week from home) mounts the same pieces.
 */
export type * from './types';
export { needsWeekBuilder, weekComplexity, shapeOfWeek, isSplitWeek, sessionKey, MANY_DAYS, type WeekShape, type WeekComplexity } from './needsWeekBuilder';
export { applyMove, findSession, orderDaySessions, toPlacedDays, trainingDowsOf } from './layout';
export { moveSession, createWeekEngine, weekViolations, newViolationCode, type MoveOptions } from './moveSession';
export { applyPlannedMoves, type WbPlannedMove, type WbApplyResult } from './applyMoves';
export { explainWeek, strengthGapLineHe } from './explain';
export { dropReasonHe, type WbDropCode } from './dropReasons';
export { trackCounts, tracksOf, weekChips, inTab, trainingDayCount, type WbTab, type WbChip } from './summary';
export { detailLineHe, emptyWeek, refreshDetails, runTitleHe } from './adapters/shared';
