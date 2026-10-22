/**
 * enable_swap_fixes_v1 — mid-workout swaps survive a resume.
 *
 * The crash checkpoint (useWorkoutPersistence, key outrun_active_workout) stores indices + the
 * set log only, and the runner re-writes it on every tick, so swaps ride next to it under their
 * own key, keyed to the same workoutId and slot (segment, exercise). clearWorkoutCheckpoint()
 * clears both. Only written while the flag is on; applying is a no-op when nothing was saved.
 */
const SWAPS_KEY = 'outrun_active_workout_swaps';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // same window as the checkpoint

interface SwapRecord<E> {
  workoutId: string;
  savedAt: number;
  /** "segIdx:exIdx" → the swapped-in runner exercise. */
  slots: Record<string, E>;
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read<E>(workoutId: string, now = Date.now()): SwapRecord<E> | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SWAPS_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as SwapRecord<E>;
    if (!rec || rec.workoutId !== workoutId || now - (rec.savedAt ?? 0) > MAX_AGE_MS) return null;
    return rec;
  } catch {
    return null;
  }
}

export function saveSwapToCheckpoint<E>(workoutId: string, segIdx: number, exIdx: number, exercise: E, now = Date.now()): void {
  const ls = storage();
  if (!ls || !workoutId) return;
  const rec = read<E>(workoutId, now) ?? { workoutId, savedAt: now, slots: {} };
  rec.slots[`${segIdx}:${exIdx}`] = exercise;
  rec.savedAt = now;
  try {
    ls.setItem(SWAPS_KEY, JSON.stringify(rec));
  } catch {
    // quota / private mode — the swap still applies in memory
  }
}

/** The plan with every saved swap put back into its slot. Same object when nothing applies. */
export function applyCheckpointSwaps<P extends { segments: Array<{ exercises?: E[] }> }, E>(
  workoutId: string,
  plan: P,
  now = Date.now(),
): P {
  const rec = read<E>(workoutId, now);
  if (!rec) return plan;
  let changed = false;
  const segments = plan.segments.map((seg, si) => {
    const list = seg.exercises;
    if (!list) return seg;
    let next: E[] | null = null;
    list.forEach((_, ei) => {
      const swapped = rec.slots[`${si}:${ei}`];
      if (swapped !== undefined) {
        next = next ?? [...list];
        next[ei] = swapped;
      }
    });
    if (!next) return seg;
    changed = true;
    return { ...seg, exercises: next };
  });
  return changed ? { ...plan, segments } : plan;
}

export function clearCheckpointSwaps(): void {
  try {
    storage()?.removeItem(SWAPS_KEY);
  } catch {
    // ignore
  }
}
