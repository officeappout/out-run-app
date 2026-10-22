/**
 * Workout insights — the request / response contract of POST /api/insights/workout. Pure.
 *
 * The client sends a COMPACT summary of the finished workout: no uid (the token is the
 * identity), no name, no location, no bodyweight (the server reads it from users/{uid} for the
 * volume and never sends it to the model).
 */
import { z } from 'zod';

const SAFE_TEXT = /^[^<>{}\\`$]*$/;
const shortText = (max: number) => z.string().trim().min(1).max(max).regex(SAFE_TEXT);

export const InsightExerciseSchema = z.object({
  name: shortText(60),
  unit: z.enum(['reps', 'seconds']),
  sets: z.array(z.number().int().min(0).max(600)).max(15),
  /** Best set today minus best set last time (only when > 0). */
  improvedBy: z.number().int().min(1).max(600).optional(),
});

export const WorkoutInsightRequestSchema = z.object({
  /** Cache key for this finished workout (stable for the session on this device). */
  key: z.string().min(4).max(120).regex(/^[A-Za-z0-9_:.-]+$/),
  kind: z.enum(['strength', 'run']),
  durationSec: z.number().int().min(0).max(6 * 3600),
  exercises: z.array(InsightExerciseSchema).max(24).default([]),
  run: z
    .object({
      distanceKm: z.number().min(0).max(300),
      paceSecPerKm: z.number().int().min(120).max(1800).optional(),
    })
    .optional(),
  level: z
    .object({
      before: z.number().int().min(0).max(100),
      after: z.number().int().min(0).max(100),
      gainPercent: z.number().min(0).max(100),
      leveledUp: z.boolean(),
    })
    .optional(),
  first: z.boolean().optional(),
  recovery: z.boolean().optional(),
});

export type WorkoutInsightRequest = z.infer<typeof WorkoutInsightRequestSchema>;
export type InsightExercise = z.infer<typeof InsightExerciseSchema>;

/** What the screens show: one insight + praise line (summary card), one funny line (lemur). */
export interface WorkoutInsightLines {
  insight: string | null;
  funny: string | null;
}

export const EMPTY_INSIGHT: WorkoutInsightLines = { insight: null, funny: null };
