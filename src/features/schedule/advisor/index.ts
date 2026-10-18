/**
 * Schedule advisor — public surface. Pure (no Firebase, no clock, no React); adapters
 * build its input: ./adapters/client.ts (app stores) and
 * src/lib/ai/coach/schedule-advisor.server.ts (Admin SDK, Kelly).
 */
export { adviseWeek, adviseToday, resolveTodayMode, MAKEUP_MAX_AGE_DAYS, WELCOME_BACK_GAP_DAYS, FRESH_START_GAP_DAYS, detectMissed, periodizationView, runningPhaseOf, weeklyLoadOf, resolveControls } from './advisor';
export { materializePlanned, weekKeysOf, addDaysToKey, dayOfWeekOfKey, keysBetween } from './planned';
export { renderScheduleReasonHe, renderScheduleReasonsHe, type ScheduleReason, type ScheduleReasonCode } from '../engine/reasons';
export type * from './types';
