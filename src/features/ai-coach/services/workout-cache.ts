/**
 * Workouts the AI coach built on this device, keyed by workoutId. The chat only stores a
 * compact card on the server; the full GeneratedWorkout stays here so tapping the card
 * opens the exact workout that was described. Memory first, sessionStorage as a fallback
 * across a reload (best effort: storage can be full, blocked or absent).
 */
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { CoachLocation } from '@/lib/ai/coach/tools';

export interface CachedAiWorkout {
  workout: GeneratedWorkout;
  location: CoachLocation;
}

const memory = new Map<string, CachedAiWorkout>();
const KEY = (id: string) => `ai_coach_workout_${id}`;

export function putAiWorkout(id: string, entry: CachedAiWorkout): void {
  memory.set(id, entry);
  try {
    sessionStorage.setItem(KEY(id), JSON.stringify(entry));
  } catch {
    /* memory copy is enough for this session */
  }
}

export function getAiWorkout(id: string): CachedAiWorkout | null {
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAiWorkout;
    memory.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}
