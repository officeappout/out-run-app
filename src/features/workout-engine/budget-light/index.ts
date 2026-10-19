/**
 * Budget light mode (panel flag enable_budget_light_mode, default OFF) — see policy.ts.
 *
 * Recommended vs manual entry points (who gets the light session, who is never restricted):
 *   recommended → home trio (StatsOverview), full park workout (composeFullParkWorkout),
 *                 route stops + smart "הליכה + כוח" (composeRouteStopsWorkout), map hybrid
 *                 cards (rankHybridCards), Kelly's generate_workout (client-tools)
 *   manual      → WorkoutBuilderSheet (isManualOverride), UserWorkoutAdjuster (budgetEntry)
 */
export * from './policy';
export * from './copy';
export * from './snapshot';
export * from './cap-sets';
export { isBudgetLightModeEnabled } from './flag';
export * from './trio-gate';
