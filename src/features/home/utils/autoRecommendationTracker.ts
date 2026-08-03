import type { DifficultyLevel } from '@/features/workout-engine/logic/workout-generator.types';

/**
 * "Auto" un-highlight — Feature C (Kelly bubble + Auto un-highlight, approved plan).
 *
 * Scope (explicit decision — do not expand): the "אוטו" pill in
 * WorkoutBuilderSheet.tsx is highlighted only while these EXACT 4 fields still
 * match the recommendation the sheet opened with:
 *   availableTime, difficulty, selectedProgramIds, selectedChips
 *
 * `location` and `equipmentOverride` are deliberately EXCLUDED — location is an
 * environmental constraint, not a preference change, so changing it must NOT
 * un-highlight "Auto".
 */
export interface RecommendationSnapshot {
  availableTime: number;
  difficulty: DifficultyLevel;
  selectedProgramIds: string[];
  selectedChips: string[];
}

/** Order-independent array equality (selection order is not meaningful here). */
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/**
 * True when `current` still matches `original` on all 4 in-scope fields.
 * `original === null` means no snapshot has been captured yet (not settled) —
 * callers should NOT treat this as "changed"; see `shouldCaptureSnapshot` for
 * the settle-gate and WorkoutBuilderSheet.tsx for the pre-init fallback used
 * while `original` is still null.
 */
export function isAutoActive(
  current: RecommendationSnapshot,
  original: RecommendationSnapshot | null,
): boolean {
  if (!original) return false;
  return (
    current.availableTime === original.availableTime &&
    current.difficulty === original.difficulty &&
    sameStringSet(current.selectedProgramIds, original.selectedProgramIds) &&
    sameStringSet(current.selectedChips, original.selectedChips)
  );
}

/**
 * Settle-gate for capturing the "original recommendation" snapshot.
 *
 * ── The timing bug this exists to prevent ──────────────────────────────────
 * WorkoutBuilderSheet.tsx seeds `selectedProgramIds` from `initProgramId.current`
 * (an explicit URL param) at first render. When no explicit default program was
 * passed, `selectedProgramIds` starts EMPTY and is only populated afterwards by
 * a separate effect (lines ~325-329) that falls back to the user's
 * `activeTemplateId` once `profile` is available. That fallback effect commits
 * in the same pass as, but strictly before renders reflect, any snapshot that
 * would be captured synchronously at `useRef` declaration / first render.
 *
 * Capturing the snapshot too early (naive `useRef(initial values)`) freezes
 * `selectedProgramIds: []` as "original" — the instant the fallback effect
 * fires and populates it, `isAutoActive` sees a mismatch on a screen the user
 * never touched, and "Auto" incorrectly un-highlights.
 *
 * The fix: gate the snapshot capture on `programs.length > 0` (the async
 * `getAllPrograms()` fetch settling). `profile` — and therefore
 * `activeTemplateId` — is already hydrated via the Zustand store by the time
 * this sheet can meaningfully open, so the fallback effect (which depends only
 * on `activeTemplateId`) has already committed its `setSelectedProgramIds` by
 * the time the slower, network-bound `programs` fetch resolves. Capturing on
 * that later render observes the POST-fallback value.
 */
export function shouldCaptureSnapshot(opts: {
  initialized: boolean;
  programsLength: number;
}): boolean {
  if (opts.initialized) return false;
  return opts.programsLength > 0;
}
