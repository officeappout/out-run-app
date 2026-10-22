/**
 * Level-up v2 — pure view model: number formatting, which state to show and
 * the ring's step plan. No React; unit-tested.
 *
 * Rounding: values are rounded to 0.1 internally; ≥ 1 shows as an integer,
 * below 1 with one decimal; a chip that rounds to 0 is hidden (never "0%");
 * a not-yet-leveled ring never reads "100%".
 */
import type { GainChip, LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A percentage for display, without the "%" sign. */
export function formatPercent(p: number): string {
  if (p >= 100) return String(Math.round(p));
  const r = round1(Math.max(0, p));
  if (r < 1) return r === 0 ? '0' : r.toFixed(1);
  return String(Math.min(99, Math.round(r)));
}

/** "+6" / "+0.4" — null when it rounds to zero (the chip is hidden). */
export function formatGain(gain: number): string | null {
  const r = round1(gain);
  if (r <= 0) return null;
  return `+${formatPercent(r)}`;
}

/** Chips that are worth showing (non-zero after rounding). */
export function visibleChips(chips: GainChip[]): GainChip[] {
  return chips.filter((c) => formatGain(c.gain) !== null);
}

export type LevelUpVariant =
  | 'gain' // LV-1
  | 'levelup' // LV-2
  | 'first' // LV-3
  | 'recovery' // LV-4
  | 'zero' // calm: the session moved nothing
  | 'unknown'; // calm: no result (engine failure / skipped user)

export function pickVariant(outcome: LevelUpOutcome | null, isRecovery: boolean): LevelUpVariant {
  if (isRecovery) return 'recovery';
  if (!outcome) return 'unknown';
  if (outcome.leveledUp) return 'levelup';
  const moved = visibleChips(outcome.chips).some((c) => c.pushesRing) || round1(outcome.after.percent) !== round1(outcome.before.percent);
  if (!moved) return 'zero';
  return outcome.isFirstWorkout ? 'first' : 'gain';
}

export interface RingStep {
  /** The chip revealed by this step (null = no chip, e.g. the level-up reset). */
  chipId: string | null;
  /** Ring fill after the step, 0..100. */
  toPercent: number;
  /** This step crosses into the new level: celebrate, show the new level, ring restarts at 0. */
  levelUp?: boolean;
}

/**
 * The ring's choreography. Each pushing chip moves the ring by its share; the
 * last step always lands on the stored number (so rounding can never leave
 * the ring on a value that isn't stored). Level-up: fill to 100 → reset →
 * the carried-over percent.
 */
export function buildRingSteps(outcome: LevelUpOutcome): RingStep[] {
  const chips = visibleChips(outcome.chips);
  const pushing = chips.filter((c) => c.pushesRing);
  const rest = chips.filter((c) => !c.pushesRing);
  const start = outcome.before.percent;
  const end = outcome.after.percent;
  const steps: RingStep[] = [];

  const target = outcome.leveledUp ? 100 : Math.max(start, end);
  const span = Math.max(0, target - start);
  const totalGain = pushing.reduce((s, c) => s + c.gain, 0);
  let running = start;
  pushing.forEach((chip, i) => {
    const isLast = i === pushing.length - 1;
    running = isLast ? target : Math.min(target, running + (totalGain > 0 ? (span * chip.gain) / totalGain : 0));
    steps.push({ chipId: chip.id, toPercent: clamp(running) });
  });
  if (outcome.leveledUp) {
    if (pushing.length === 0) steps.push({ chipId: null, toPercent: 100 });
    steps.push({ chipId: null, toPercent: clamp(end), levelUp: true });
  } else if (pushing.length === 0 || round1(running) !== round1(end)) {
    steps.push({ chipId: null, toPercent: clamp(end) });
  }
  rest.forEach((chip) => steps.push({ chipId: chip.id, toPercent: steps.length ? steps[steps.length - 1].toPercent : clamp(end) }));
  return steps;
}

function clamp(p: number): number {
  return Math.min(100, Math.max(0, p));
}

/** The delta pill: "+9" for a leaf, the average's move for a master; null = hide. */
export function deltaText(outcome: LevelUpOutcome): string | null {
  if (outcome.totalGain !== null) return formatGain(outcome.totalGain);
  if (outcome.leveledUp) return null;
  return formatGain(outcome.after.percent - outcome.before.percent);
}
