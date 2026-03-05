import type { WorkoutCategory, WarmupCooldownConfig } from '../types/running.types';

/**
 * Category → Warmup/Cooldown wrapper configuration.
 *
 * When materializeWorkout() encounters a template with a known category
 * AND no manually-defined warmup/cooldown blocks, it uses this mapping
 * to dynamically inject wrapper blocks around the core set.
 *
 * Durations follow standard running methodology:
 *   - High-intensity sessions need longer warmups to prepare the body.
 *   - Strides (4×20s) are added at the end of warmups before quality work
 *     to prime the neuromuscular system for fast running.
 *   - Easy/long runs are self-pacing and need no wrappers.
 */
export const WARMUP_COOLDOWN_BY_CATEGORY: Record<WorkoutCategory, WarmupCooldownConfig> = {
  short_intervals: {
    warmupMinutes: 15,
    warmupZone: 'easy',
    cooldownMinutes: 10,
    cooldownZone: 'easy',
    includeStrides: true,
    stridesCount: 4,
    stridesDurationSeconds: 20,
  },
  long_intervals: {
    warmupMinutes: 15,
    warmupZone: 'easy',
    cooldownMinutes: 10,
    cooldownZone: 'easy',
    includeStrides: true,
    stridesCount: 4,
    stridesDurationSeconds: 20,
  },
  fartlek_easy: {
    warmupMinutes: 10,
    warmupZone: 'easy',
    cooldownMinutes: 5,
    cooldownZone: 'easy',
  },
  fartlek_structured: {
    warmupMinutes: 15,
    warmupZone: 'easy',
    cooldownMinutes: 10,
    cooldownZone: 'easy',
    includeStrides: true,
    stridesCount: 4,
    stridesDurationSeconds: 20,
  },
  tempo: {
    warmupMinutes: 15,
    warmupZone: 'easy',
    cooldownMinutes: 10,
    cooldownZone: 'easy',
  },
  hill_long: {
    warmupMinutes: 15,
    warmupZone: 'easy',
    cooldownMinutes: 10,
    cooldownZone: 'easy',
  },
  hill_short: {
    warmupMinutes: 10,
    warmupZone: 'easy',
    cooldownMinutes: 5,
    cooldownZone: 'easy',
  },
  hill_sprints: {
    warmupMinutes: 15,
    warmupZone: 'easy',
    cooldownMinutes: 10,
    cooldownZone: 'easy',
    includeStrides: true,
    stridesCount: 4,
    stridesDurationSeconds: 20,
  },
  long_run: {
    warmupMinutes: 0,
    warmupZone: 'easy',
    cooldownMinutes: 0,
    cooldownZone: 'easy',
  },
  easy_run: {
    warmupMinutes: 0,
    warmupZone: 'easy',
    cooldownMinutes: 0,
    cooldownZone: 'easy',
  },
  strides: {
    warmupMinutes: 10,
    warmupZone: 'easy',
    cooldownMinutes: 5,
    cooldownZone: 'easy',
  },
};
