/**
 * timed-prompt — when the timed player asks "כמה חזרות הספקת?" (pure).
 *
 *   AMRAP (board A-2d): the cap froze the clock mid-item → reps of THAT item
 *     only (everything before it was logged by "סיימתי").
 *   EMOM (board A-4d): a minute ended without "סיימתי" → how much of it was
 *     done. Asked once per minute, and only after the 1 s grace window (a tap
 *     right after the rollover still credits the minute that ended).
 *
 * The block is handed to the strength player only when no prompt is open.
 */
import { emomIntervalMs } from '@/features/workout-engine/engines/timed/emom.machine';
import type { EmomState, TimedItem, TimedState } from '@/features/workout-engine/engines/timed/timed.types';

export type TimedPrompt =
  | { kind: 'amrap_partial'; itemIndex: number; item: TimedItem; round: number }
  | { kind: 'emom_missed'; minuteIndex: number; item: TimedItem };

export function pendingPrompt(state: TimedState | null, askedMinutes: ReadonlySet<number>, activeMs: number): TimedPrompt | null {
  if (!state) return null;
  if (state.spec.format === 'amrap') {
    if (state.status !== 'awaiting_partial') return null;
    const d = (state as Extract<TimedState, { spec: { format: 'amrap' } }>).data;
    const item = state.spec.items[d.itemIndex];
    return item ? { kind: 'amrap_partial', itemIndex: d.itemIndex, item, round: d.rounds.length } : null;
  }
  if (state.spec.format !== 'emom') return null;
  const s = state as EmomState;
  const intervalMs = emomIntervalMs(s);
  const grace = s.options.emomGraceMs;
  for (let i = s.data.minutes.length - 1; i >= 0; i--) {
    const m = s.data.minutes[i];
    if (m.status !== 'missed' || askedMinutes.has(i)) continue;
    const item = s.spec.items[m.itemIndex];
    if (!item || item.kind !== 'exercise') continue;
    // Still inside the grace window of the rollover → a late "סיימתי" may claim it.
    if (s.status !== 'done' && activeMs < (i + 1) * intervalMs + grace) continue;
    return { kind: 'emom_missed', minuteIndex: i, item };
  }
  return null;
}

/** The finished block may go back to the strength player. */
export function readyToHandBack(state: TimedState | null, prompt: TimedPrompt | null): boolean {
  return !!state && state.status === 'done' && prompt == null;
}

/** Picker start value: the target (AMRAP partial starts lower — it was cut short). */
export function promptInitialValue(prompt: TimedPrompt): number {
  const t = prompt.item.targetReps ?? prompt.item.targetHoldSec ?? 10;
  return prompt.kind === 'amrap_partial' ? Math.max(0, Math.floor(t / 2)) : Math.max(0, t - 1);
}

/** Drawer eyebrow: "הזמן נגמר · שכיבות סמיכה בסבב 5" / "דקה 5 · סקוואט". */
export function promptEyebrow(prompt: TimedPrompt): string {
  return prompt.kind === 'amrap_partial'
    ? `הזמן נגמר · ${prompt.item.name} בסבב ${prompt.round}`
    : `דקה ${prompt.minuteIndex + 1} · ${prompt.item.name}`;
}
