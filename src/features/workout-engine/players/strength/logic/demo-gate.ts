/**
 * demo-gate — the guided "watch the demo first" gate (PR-B2). Pure decisions only; the
 * player (StrengthRunner) applies them. Plain .ts so the node-only vitest covers it.
 *
 * Mechanism (no new player state): while the gate is up the player is held in its EXISTING
 * pause (isPaused) — every clock already honours it: the elapsed clock + PREPARING countdown
 * and the rest countdown (useWorkoutTimers), the rep CTA's auto-fill (FillingButton) and, since
 * PR-A, the timer card's prep/work clocks (IsometricTimerCard externalPaused). The gate sheet is
 * drawn instead of the pause overlay; the demo clip keeps looping behind it.
 */

/** Session-wide record of exercises whose demo was watched (by exercise id). */
export interface DemoSeenStore {
  has(exerciseId: string): boolean;
  add(exerciseId: string): void;
}

export function createDemoSeenStore(): DemoSeenStore & { clear(): void } {
  const ids = new Set<string>();
  return {
    has: (id) => ids.has(id),
    add: (id) => { ids.add(id); },
    clear: () => ids.clear(),
  };
}

export interface GateInput {
  /** Guided layer on (setting + kill-switch) — the caller passes a seen-store only then. */
  enabled: boolean;
  exerciseId: string | null | undefined;
  exerciseType: 'reps' | 'time' | 'follow-along' | string | undefined;
  workoutState: string;
  seen: Pick<DemoSeenStore, 'has'> | null | undefined;
  /** Current segment is a tabata block. */
  isTabataBlock: boolean;
  /** First interval of the tabata block (cycle 1, member 0, not the left side). */
  isFirstTabataInterval: boolean;
}

/**
 * Show the gate for the exercise now on screen? Only in guided mode, only before an exercise
 * whose demo hasn't been watched this session, only at PREPARING (→ replaces the countdown) or
 * ACTIVE. Follow-along clips ARE the demo → never gated. Inside a tabata block only the block's
 * first interval is gated (a gate between intervals would break the protocol's work/rest rhythm);
 * that one tap marks every member of the block as seen.
 */
export function shouldGateExercise(input: GateInput): boolean {
  if (!input.enabled || !input.seen) return false;
  if (!input.exerciseId) return false;
  if (input.exerciseType === 'follow-along') return false;
  if (input.workoutState !== 'PREPARING' && input.workoutState !== 'ACTIVE') return false;
  if (input.isTabataBlock && !input.isFirstTabataInterval) return false;
  return !input.seen.has(input.exerciseId);
}

/** Tabata's one get-ready before the block's very first interval (unchanged value). */
export const TABATA_LEAD_IN_SECONDS = 5;

/**
 * The timer card's lead-in for the current interval. Unchanged for fast mode and for every
 * non-first interval; when the demo gate fronted the block's first interval the gate IS the
 * get-ready, so the lead-in is 0 (the block still runs exactly work+rest × rounds after it).
 * undefined = not a tabata block (the card keeps its own default prep).
 */
export function timerLeadInSeconds(
  isTabataBlock: boolean,
  isFirstTabataInterval: boolean,
  gatedThisInterval: boolean,
): number | undefined {
  if (!isTabataBlock) return undefined;
  if (!isFirstTabataInterval) return 0;
  return gatedThisInterval ? 0 : TABATA_LEAD_IN_SECONDS;
}

/**
 * The clip's mute state at the gate's "צפיתי, התחל" tap: with sound (the tap is the user
 * gesture iOS/Android require) unless the user muted the player for the session (PR-A).
 */
export function gateClipMuted(sessionMuted: boolean): boolean {
  return sessionMuted;
}
