/**
 * Kelly bubble text — pure derivation for the "why this workout" explainer
 * shown on WorkoutBuilderSheet (Feature A).
 *
 * Root-cause fix (04.08.2026, Fix C): kellyText previously fell through to
 * the fully generic fallback far more often than intended. The reason:
 * `autoAppliedProgram` (WorkoutBuilderSheet.tsx) unconditionally returns
 * null whenever `resolvedScheduledProgramIds` is non-empty ("explicit pill
 * wins — never override", by design, for the GENERATOR). But
 * `resolvedScheduledProgramIds` is also non-empty on the most common path —
 * opening "בנה אימון" from home after a trio already resolved a scheduled
 * program (StatsOverview.tsx `handleBuildCustomWrapped` forwards
 * `scheduledProgramIdsRef.current` as `ctx.programIds`, which seeds
 * `selectedProgramIds` via `initProgramId` on mount). On ordinary "build"
 * weeks, `coachCue` is also `undefined` (periodization.service.ts:274-286,
 * `reason: 'build'`). Both sources empty → the bubble always rendered the
 * same static-feeling generic sentence, which read as a duplicate of the
 * info icon's static copy even though the wording differs.
 *
 * Fix: add a THIRD, display-only source — the label of whichever program is
 * actually resolved right now (via `resolveKellyProgramLabel`) — used only
 * when neither `coachCue` nor `autoAppliedProgram` fired. This does not
 * touch `autoAppliedProgram` itself, so the generator's program resolution
 * (`resolvedScheduledProgramIds ?? autoAppliedProgram?.ids`) and the
 * existing "יאומן לפי..." note (WorkoutBuilderSheet.tsx ~1074-1078) are
 * both untouched.
 */

/** Minimal program shape needed to resolve a label — matches `DisplayProgram`
 *  in WorkoutBuilderSheet.tsx without importing it (keeps this module
 *  dependency-free / trivially unit-testable). */
export interface KellyProgramLike {
  id: string;
  label: string;
}

export const KELLY_GENERIC_FALLBACK =
  'האימון מותאם אישית לפי ההתקדמות וההעדפות שלך — אפשר תמיד לשנות משך, תוכנית, אזור-אימון או עוצמה.';

/**
 * Resolve the display label of the program that's actually selected right
 * now, regardless of whether it arrived via an explicit in-sheet pill click
 * or via a context prefill (`defaultProgramIds`) carried over from the trio.
 * Display-only — never feeds the generator.
 */
export function resolveKellyProgramLabel(
  selectedProgramIds: string[],
  displayPrograms: KellyProgramLike[],
): string | null {
  if (selectedProgramIds.length === 0) return null;
  const prog = displayPrograms.find((p) => p.id === selectedProgramIds[0]);
  return prog?.label ?? null;
}

export interface DeriveKellyBubbleTextInput {
  /** periodization.service.ts `coachCue`, threaded via defaultCoachCue prop. */
  coachCue?: string;
  /** WorkoutBuilderSheet.tsx `autoAppliedProgram` memo (chip/CU-derived auto-suggestion). */
  autoAppliedProgram?: { label: string } | null;
  /** `resolveKellyProgramLabel` output — the display-only fallback source. */
  resolvedProgramLabel?: string | null;
}

/**
 * Combine the three reason-sources into Kelly's bubble text, in priority
 * order: coachCue (most specific, current-state-dependent) + autoAppliedProgram
 * (explains *why* muscle chips picked a program) when present; otherwise the
 * resolved program label (still state-dependent, just less detailed); only
 * when NONE apply does the fully generic sentence render.
 */
export function deriveKellyBubbleText(input: DeriveKellyBubbleTextInput): string {
  const parts: string[] = [];
  if (input.coachCue) parts.push(input.coachCue);
  if (input.autoAppliedProgram) {
    parts.push(`יאומן לפי ${input.autoAppliedProgram.label} — הותאם אוטומטית לשרירים שבחרת.`);
  } else if (input.resolvedProgramLabel) {
    parts.push(`האימון היום בנוי לפי תוכנית ${input.resolvedProgramLabel}.`);
  }
  if (parts.length === 0) return KELLY_GENERIC_FALLBACK;
  return parts.join(' ');
}
