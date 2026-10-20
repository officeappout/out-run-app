/**
 * Schedule engine v2 — one pure engine for every path that places or moves sessions
 * (signup, questionnaire, builder, Kelly, agenda drag). No callers are switched yet.
 * Spec: agent-briefs/schedule-combos.md §4; fixtures: __tests__/fixtures/.
 */
export { buildWeek } from './buildWeek';
export { defaultTrainingDays, saturdayMarked } from './availability';
export { planMakeup, type MakeupInput, type MakeupPlan, type MakeupChange, type MakeupAction } from './makeup';
export { planReturn, type ReturnInput, type ReturnPlan } from './returnPlan';
export { validateLayout, breaksH5 } from './validate';
export { PROGRAM_PROFILES, profileOf } from './programProfiles';
export { renderV2ReasonHe, renderV2ReasonsHe, type V2Reason, type V2ReasonCode } from './reasonsV2';
export * from './config';
export type * from './types';
