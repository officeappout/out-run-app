/**
 * The bodyweight / street station intro (enable_park_live_v2, boards PlayerStationIntro "park" /
 * "street" and PlayerParkWelcome "bodyweight"). PURE. A station with no machine tabata gets the
 * same v2 intro the machine station has (ParkStationIntro): where, the muscles, the exercises with
 * sets × target, and "to the first video". Replaces the guided StationWelcomeScreen there.
 */
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';

export interface BodyweightIntroRow {
  id: string;
  name: string;
  imageUrl: string | null;
  /** "3×10", "3×30 שנ׳", or the bare target when the plan has no set count. */
  target: string;
}

export interface BodyweightIntroView {
  /** 'street' = no park on the way (the station has no park). */
  kind: 'park' | 'street';
  rows: BodyweightIntroRow[];
  muscles: string[];
  /** The same set count on every exercise, else null. */
  setsEach: number | null;
}

export function bodyweightIntroView(plan: WorkoutPlan | null | undefined, parkId: string | null): BodyweightIntroView | null {
  const rows: BodyweightIntroRow[] = [];
  const muscles: string[] = [];
  const sets = new Set<number>();
  for (const seg of plan?.segments ?? []) {
    for (const ex of seg.exercises ?? []) {
      if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
      const target = (ex.reps || ex.duration || '').trim();
      const n = typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : null;
      if (n != null) sets.add(n);
      rows.push({ id: ex.id, name: ex.name, imageUrl: ex.imageUrl || null, target: n != null && target ? `${n}×${target}` : target });
      for (const m of ex.muscleGroups ?? []) if (typeof m === 'string' && m && !muscles.includes(m)) muscles.push(m);
    }
  }
  if (rows.length === 0) return null;
  return { kind: parkId ? 'park' : 'street', rows, muscles, setsEach: sets.size === 1 ? [...sets][0] : null };
}
