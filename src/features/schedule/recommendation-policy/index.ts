/**
 * Recommendation policy (enable_home_v2, owner 20.10.2026): level × goals × days →
 * how many sessions, which split, add-ons and Hebrew reasons. Data: policy.config.ts.
 */
export { RECOMMENDATION_POLICY } from './policy.config';
export { resolveRecommendation, matchesWhen } from './resolve';
export { normalizeGoals, resolveAudience, runBandOf, ageFromDob, GOAL_ID_MAP } from './signals';
export { buildPolicySignals, collectGoalIds, strengthLevelOf, parseIdList, addOnsLineHe } from './fromProfile';
export type * from './types';
