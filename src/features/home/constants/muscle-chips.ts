/**
 * Relocated to src/lib/muscle-chips.const.ts (round 5) so the exercise
 * library's track↔muscle association highlight can import the same
 * canonical mapping without a cross-domain import (src/features/{domain}/
 * is meant to be self-contained — shared utilities belong in src/lib/).
 * Re-exported here so WorkoutBuilderSheet.tsx / UserWorkoutAdjuster.tsx
 * don't need to change their import path.
 */
export * from '@/lib/muscle-chips.const';
