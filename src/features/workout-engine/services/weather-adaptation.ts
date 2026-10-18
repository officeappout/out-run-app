/**
 * Weather adaptation — pure mappings from the home weather flag to generator knobs.
 *
 * Only reached when HomeWorkoutOptions.weather is set, which only the inferred home
 * flows do (StatsOverview's daily trio + the full-strength home carousel card), and only
 * while the `weather_enabled` remote flag is on. Every other caller is byte-identical.
 *
 *   rain      → workout-context-resolver sends an INFERRED park workout home
 *               (source 'weather-rain-home'); an explicit location choice is never overridden.
 *   heat / uv → session time −20% (min 15 min), rest ×1.25, difficulty capped at 2
 *               (the intense slot keeps its place but is generated at D2 without the
 *               forced pyramid / intense post-process).
 *   cold      → +2 min warm-up budget (prependWarmupExercises' extraWarmupMinutes).
 */

import type { WorkoutWeather } from '@/features/weather/core/weather.types';
import type { DifficultyLevel } from '../logic/WorkoutGenerator';
import type { WorkoutExercise } from '../logic/workout-generator.types';

export type HomeWorkoutWeather = WorkoutWeather;

export const WEATHER_HEAT_TIME_FACTOR = 0.8;
export const WEATHER_HEAT_MIN_TIME = 15;
export const WEATHER_HEAT_REST_FACTOR = 1.25;
export const WEATHER_HEAT_DIFFICULTY_CAP: DifficultyLevel = 2;
export const WEATHER_COLD_EXTRA_WARMUP_MIN = 2;

export function isHeatLike(weather: HomeWorkoutWeather | null | undefined): boolean {
  return weather?.flag === 'heat' || weather?.flag === 'uv';
}

/** Heat/UV: −20% (rounded), never below 15 min — and never longer than requested. */
export function adjustTimeForWeather(minutes: number, weather: HomeWorkoutWeather | null | undefined): number {
  if (!isHeatLike(weather) || !Number.isFinite(minutes) || minutes <= 0) return minutes;
  const cut = Math.max(WEATHER_HEAT_MIN_TIME, Math.round(minutes * WEATHER_HEAT_TIME_FACTOR));
  return Math.min(minutes, cut);
}

/** Heat/UV: cap difficulty at 2. */
export function capDifficultyForWeather(
  difficulty: DifficultyLevel,
  weather: HomeWorkoutWeather | null | undefined,
): DifficultyLevel {
  if (!isHeatLike(weather)) return difficulty;
  return (difficulty > WEATHER_HEAT_DIFFICULTY_CAP ? WEATHER_HEAT_DIFFICULTY_CAP : difficulty) as DifficultyLevel;
}

/** Rest multiplier for the session (1 = unchanged). */
export function weatherRestFactor(weather: HomeWorkoutWeather | null | undefined): number {
  return isHeatLike(weather) ? WEATHER_HEAT_REST_FACTOR : 1;
}

/**
 * Heat/UV: lengthen the main exercises' rest in place (warm-up/cool-down untouched).
 *
 * Why a post-pass rather than HomeWorkoutOptions.restMultiplier: that option (and
 * levelDefaultRestSeconds) is still threaded into the generator context but marked
 * @deprecated there and read by nothing, so setting it would be a silent no-op.
 * Runs before enforceVolumeCap so the cap sees the real (longer) session; the
 * pipeline's own roundRestSeconds pass later snaps the result to 15 s steps.
 */
export function applyWeatherRest(
  exercises: WorkoutExercise[],
  weather: HomeWorkoutWeather | null | undefined,
): number {
  const factor = weatherRestFactor(weather);
  if (factor === 1) return 0;
  let changed = 0;
  for (const ex of exercises) {
    if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
    if (typeof ex.restSeconds !== 'number' || ex.restSeconds <= 0) continue;
    ex.restSeconds = Math.round((ex.restSeconds * factor) / 5) * 5;
    changed++;
  }
  return changed;
}

/** Cold: extra warm-up minutes (0 otherwise). */
export function extraWarmupMinutesForWeather(weather: HomeWorkoutWeather | null | undefined): number {
  return weather?.flag === 'cold' ? WEATHER_COLD_EXTRA_WARMUP_MIN : 0;
}
