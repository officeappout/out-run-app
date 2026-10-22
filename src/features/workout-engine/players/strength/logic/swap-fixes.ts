/**
 * enable_swap_fixes_v1 — small pure helpers shared by every swap surface
 * (preview drawer, active player, hybrid overview / station, the modal).
 * Each takes the flag value so the OFF path stays byte-for-byte today's.
 */

type IdLike = { id?: string | null } | null | undefined;
interface EntryLike {
  exercise?: IdLike;
  exerciseId?: string | null;
  id?: string | null;
  pyramidSequence?: ReadonlyArray<{ exerciseId?: string | null } | null> | null;
}

/** Every exercise id in a workout / station list, incl. pyramid steps. Deduped, order kept. */
export function collectWorkoutExerciseIds(entries: ReadonlyArray<EntryLike | null | undefined>): string[] {
  const out: string[] = [];
  const add = (id: string | null | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  for (const e of entries) {
    if (!e) continue;
    add(e.exercise?.id ?? e.exerciseId ?? e.id);
    for (const step of e.pyramidSequence ?? []) add(step?.exerciseId);
  }
  return out;
}

/** A copy of `list` with only position `index` replaced (slot-keyed swap). Out of range → unchanged copy. */
export function replaceAtSlot<T>(list: readonly T[], index: number, fn: (item: T) => T): T[] {
  return list.map((item, i) => (i === index ? fn(item) : item));
}

/** The method whose photo a swap option shows: flag on → the chosen one (station / brand), else today's lookup. */
export function swapOptionImageMethod<M>(fixesOn: boolean, chosen: M | null | undefined, fallback: () => M | null | undefined): M | null | undefined {
  return fixesOn && chosen ? chosen : fallback();
}

/**
 * The level the ±3 swap window is centred on in the active player. Flag on → the exercise's own
 * domain level (userDomainLevel → exerciseLevel → programLevel); off → the caller's value (today:
 * the first active program's / master average level).
 */
export function swapWindowLevel(
  fixesOn: boolean,
  ex: { userDomainLevel?: number | null; exerciseLevel?: number | null; programLevel?: number | null } | null | undefined,
  fallback: number,
): number {
  if (!fixesOn || !ex) return fallback;
  const pick = [ex.userDomainLevel, ex.exerciseLevel, ex.programLevel].find(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
  );
  return pick ?? fallback;
}

/** No swap while a tabata WORK interval is running (the clock does not stop for the modal). */
export function isSwapBlockedNow(fixesOn: boolean, s: { isTabata: boolean; isWorkPhase: boolean }): boolean {
  return fixesOn && s.isTabata && s.isWorkPhase;
}
