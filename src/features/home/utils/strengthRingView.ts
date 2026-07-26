/**
 * strengthRingView — pure presentation math for the Daily Strength Ring.
 *
 * The ring is sets-driven; minutes are a derived label. This function turns raw
 * (completedSets, targetSets, avgMinutesPerSet, mode) into everything the
 * component needs to render, including the edge states: 0%, 100%, >100%
 * (overflow), and rest mode. Kept pure so it is unit-testable in node/vitest;
 * `StrengthRing.tsx` is a thin SVG wrapper over it.
 */

export interface StrengthRingView {
  /** Fill fraction 0..1 (clamped; overflow does not exceed 1). */
  fillPct: number;
  /** Completed minutes label (completedSets × avgMinutesPerSet, rounded). */
  completedMinutes: number;
  /** Target minutes label (targetSets × avgMinutesPerSet, rounded). */
  targetMinutes: number;
  /** True when this is a rest/off day (target 0 or mode='rest') → recovery UI. */
  isRest: boolean;
  /** True when completedSets exceeds targetSets (goal beaten). */
  overflow: boolean;
  /** Extra sets beyond the target (0 when not overflowing). */
  overflowSets: number;
}

export interface StrengthRingInput {
  completedSets: number;
  targetSets: number;
  avgMinutesPerSet: number;
  mode?: 'active' | 'rest';
}

export function getStrengthRingView(input: StrengthRingInput): StrengthRingView {
  const completed = Math.max(0, input.completedSets || 0);
  const target = Math.max(0, input.targetSets || 0);
  const perSet = Math.max(0, input.avgMinutesPerSet || 0);

  const isRest = input.mode === 'rest' || target <= 0;

  const fillPct = isRest || target <= 0 ? 0 : Math.min(1, completed / target);
  const overflow = !isRest && completed > target;

  return {
    fillPct,
    completedMinutes: Math.round(completed * perSet),
    targetMinutes: Math.round(target * perSet),
    isRest,
    overflow,
    overflowSets: overflow ? completed - target : 0,
  };
}
