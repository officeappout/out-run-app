/**
 * timed.selectors — what the screen shows at `nowMs` (pure). The view is
 * computed from a state synced to `nowMs`, so the UI never needs its own
 * timer arithmetic: header clock, phase countdown, round / minute labels,
 * the current and next item, and the orange last-seconds flag.
 */
import { activeMsAt } from './timed-clock';
import { syncTimed, timedTotalMs } from './timed-machine';
import { tabataPositionAt } from './tabata-schedule';
import { emomIntervalMs, emomMinuteAt } from './emom.machine';
import type { AmrapState, EmomState, TabataState, TimedItem, TimedPhase, TimedState } from './timed.types';

export interface TimedView {
  status: TimedState['status'];
  format: TimedState['spec']['format'];
  phase: TimedPhase;
  activeMs: number;
  /** Block length (AMRAP: the cap). */
  totalMs: number;
  /** Block time left ("נותרו 05:48"). */
  remainingMs: number;
  /** Time left in the current phase (work interval / rest / minute). */
  phaseRemainingMs: number;
  phaseElapsedMs: number;
  /** 1-based round (AMRAP round, tabata interval, EMOM minute). */
  round: number;
  /** Total rounds when known (AMRAP: null — open-ended). */
  roundsTotal: number | null;
  current: TimedItem | null;
  next: TimedItem | null;
  /** Unilateral tabata member: which side. */
  side: 'right' | 'left' | null;
  /** ≤ lastSecondsWindowSec left in a phase that ends on the clock. */
  isLastSeconds: boolean;
}

function lastSeconds(state: TimedState, remainingMs: number, phase: TimedPhase): boolean {
  if (phase !== 'work' && phase !== 'rest' && phase !== 'aerobic') return false;
  return remainingMs > 0 && remainingMs <= state.options.lastSecondsWindowSec * 1000;
}

function base(state: TimedState, activeMs: number): Omit<TimedView, 'phase' | 'phaseRemainingMs' | 'phaseElapsedMs' | 'round' | 'roundsTotal' | 'current' | 'next' | 'side' | 'isLastSeconds'> {
  const totalMs = timedTotalMs(state);
  return {
    status: state.status,
    format: state.spec.format,
    activeMs,
    totalMs,
    remainingMs: Math.max(0, totalMs - activeMs),
  };
}

function statusPhase(state: TimedState): TimedPhase | null {
  if (state.status === 'idle') return 'idle';
  if (state.status === 'done') return 'done';
  if (state.status === 'awaiting_partial') return 'awaiting_partial';
  return null;
}

function tabataView(state: TabataState, activeMs: number): TimedView {
  const n = state.data.intervals.length;
  const pos = tabataPositionAt(state.spec.config, n, activeMs);
  const iv = state.data.intervals[pos.index];
  const nextIv = state.data.intervals[pos.index + 1];
  const phase = statusPhase(state) ?? (pos.phase === 'done' ? 'done' : pos.phase);
  const item = iv ? state.spec.items[iv.itemIndex] ?? null : null;
  return {
    ...base(state, activeMs),
    phase: state.status === 'paused' ? 'paused' : phase,
    phaseRemainingMs: pos.phaseRemainingMs,
    phaseElapsedMs: pos.phaseElapsedMs,
    round: pos.index + 1,
    roundsTotal: n,
    current: item,
    next: nextIv ? state.spec.items[nextIv.itemIndex] ?? null : null,
    side: iv?.side ?? null,
    isLastSeconds: state.status === 'running' && lastSeconds(state, pos.phaseRemainingMs, phase),
  };
}

function emomView(state: EmomState, activeMs: number): TimedView {
  const intervalMs = emomIntervalMs(state);
  const cur = emomMinuteAt(state, activeMs);
  const m = state.data.minutes[cur];
  const inMinute = Math.max(0, activeMs - cur * intervalMs);
  const item = m ? state.spec.items[m.itemIndex] ?? null : null;
  const nextM = state.data.minutes[cur + 1];
  const working = m?.status === 'pending';
  const livePhase: TimedPhase = working ? (item?.kind === 'aerobic_leg' ? 'aerobic' : 'work') : 'rest';
  const phase = statusPhase(state) ?? livePhase;
  const phaseRemainingMs = Math.max(0, intervalMs - inMinute);
  return {
    ...base(state, activeMs),
    phase: state.status === 'paused' ? 'paused' : phase,
    phaseRemainingMs,
    phaseElapsedMs: inMinute,
    round: cur + 1,
    roundsTotal: state.data.minutes.length,
    current: item,
    next: nextM ? state.spec.items[nextM.itemIndex] ?? null : null,
    side: null,
    // The minute ends on the clock whether working or resting.
    isLastSeconds: state.status === 'running' && lastSeconds(state, phaseRemainingMs, phase),
  };
}

function amrapView(state: AmrapState, activeMs: number): TimedView {
  const d = state.data;
  const n = state.spec.items.length;
  const item = state.spec.items[d.itemIndex] ?? null;
  const next = n > 0 ? state.spec.items[(d.itemIndex + 1) % n] ?? null : null;
  const livePhase: TimedPhase = item?.kind === 'aerobic_leg' ? 'aerobic' : 'work';
  const phase = statusPhase(state) ?? livePhase;
  const b = base(state, activeMs);
  return {
    ...b,
    phase: state.status === 'paused' ? 'paused' : phase,
    // AMRAP has no inner phase clock: the countdown is the cap.
    phaseRemainingMs: b.remainingMs,
    phaseElapsedMs: Math.max(0, activeMs - d.itemStartedActiveMs),
    round: d.rounds.length,
    roundsTotal: null,
    current: item,
    next,
    side: null,
    isLastSeconds: state.status === 'running' && lastSeconds(state, b.remainingMs, phase),
  };
}

export function timedView(state: TimedState, nowMs: number): TimedView {
  const s = syncTimed(state, nowMs);
  const activeMs = activeMsAt(s.clock, nowMs);
  switch (s.spec.format) {
    case 'tabata':
      return tabataView(s as TabataState, activeMs);
    case 'emom':
      return emomView(s as EmomState, activeMs);
    case 'amrap':
      return amrapView(s as AmrapState, activeMs);
  }
}

// ── AMRAP score ("4 סבבים מלאים · ועוד 16 חזרות") ──────────────────────────

export interface AmrapScore {
  fullRounds: number;
  /** Reps logged in the unfinished round (completed items + the partial one). */
  extraReps: number;
  /** Items touched in the unfinished round (incl. a run). */
  extraItems: number;
  /** Item indexes of the unfinished round, in order. */
  extraItemIndexes: number[];
}

export function amrapScore(state: AmrapState): AmrapScore {
  const n = state.spec.items.length;
  let fullRounds = 0;
  let extraReps = 0;
  const extraItemIndexes: number[] = [];
  for (const r of state.data.rounds) {
    const full = n > 0 && r.items.length >= n && r.items.every((it) => !it.partial);
    if (full) {
      fullRounds += 1;
      continue;
    }
    for (const it of r.items) {
      const touched = (it.reps ?? 0) > 0 || (it.distanceM ?? 0) > 0 || !it.partial;
      if (!touched) continue;
      extraReps += it.reps ?? 0;
      extraItemIndexes.push(it.itemIndex);
    }
  }
  return { fullRounds, extraReps, extraItems: extraItemIndexes.length, extraItemIndexes };
}
