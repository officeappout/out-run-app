/**
 * timed-result — finished (or stopped) block → the shapes the summaries
 * already read. Pure.
 *
 * `exerciseLog` is the persisted SegmentExerciseDetail[] — one row per item,
 * one value per round / minute / interval — so the strength summary's
 * `stationRows` (ExerciseSetsTable, F-3g boxes) renders it unchanged. A run
 * item is a row too, with its time per round in seconds (A-3e / A-3f).
 * `toStrengthSegmentRecord` wraps it as a SessionSegmentRecord for a hybrid
 * session's `segments[]` (hybridStationTables reads it there).
 */
import type { AerobicLegResult } from '../../core/types/protocol.types';
import type { SegmentExerciseDetail, SessionSegmentRecord } from '../../core/services/storage.service';
import type { RepsSource } from '../../adaptation/adaptation.types';
import { legPaceSecPerKm } from '../leg-pace';
import { tabataWorkStartMs } from './tabata-schedule';
import { timedTotalMs } from './timed-machine';
import { amrapScore, type AmrapScore } from './timed.selectors';
import type { AmrapState, EmomMinuteStatus, EmomState, TabataState, TimedItem, TimedState } from './timed.types';

export interface TimedAerobicLeg {
  itemKey: string;
  name: string;
  /** 1-based round / minute the run belonged to. */
  round: number;
  result: AerobicLegResult;
}

export interface TimedBlockResult {
  format: TimedState['spec']['format'];
  /** 'completed' = the clock ran out (cap / last interval); 'stopped' = ended early. */
  outcome: 'completed' | 'stopped';
  startedAtMs: number | null;
  endedAtMs: number | null;
  activeSec: number;
  plannedSec: number;
  exerciseLog: SegmentExerciseDetail[];
  aerobicLegs: TimedAerobicLeg[];
  tabata?: { intervalsDone: number; intervalsTotal: number };
  emom?: {
    minutes: Array<{ index: number; itemKey: string; status: EmomMinuteStatus; workSec: number | null; reps: number | null }>;
    done: number;
    total: number;
  };
  amrap?: { score: AmrapScore; rounds: Array<{ index: number; durationSec: number; complete: boolean }> };
}

const sec = (ms: number) => Math.round(ms / 1000);

interface RowAcc {
  item: TimedItem;
  reps: number[];
  sources: RepsSource[];
  right?: number[];
  left?: number[];
  timed: boolean;
}

function newRow(item: TimedItem): RowAcc {
  return { item, reps: [], sources: [], timed: item.kind === 'aerobic_leg' };
}

function toDetail(acc: RowAcc, timedTarget: number | null): SegmentExerciseDetail {
  const it = acc.item;
  const target = acc.timed ? timedTarget ?? it.targetHoldSec ?? 0 : it.targetReps ?? it.targetHoldSec ?? 0;
  const d: SegmentExerciseDetail = {
    exerciseId: it.exerciseId ?? it.key,
    exerciseName: it.name,
    confirmedReps: acc.reps,
    targetReps: target > 0 ? target : 0,
    repsSource: acc.sources,
  };
  if (acc.right && acc.left) {
    d.confirmedRepsRight = acc.right;
    d.confirmedRepsLeft = acc.left;
  }
  return d;
}

function aerobicLeg(item: TimedItem, round: number, distanceM: number | null, durationMs: number, completed: boolean): TimedAerobicLeg {
  const dist = Math.max(0, Math.round(distanceM ?? 0));
  const dur = sec(durationMs);
  const pace = legPaceSecPerKm(dist, dur, { distanceM: item.distanceM, durationSec: item.durationSec });
  const result: AerobicLegResult = { completed, actualDistanceM: dist, actualDurationSec: dur };
  if (pace != null) result.avgPaceSecPerKm = pace;
  return { itemKey: item.key, name: item.name, round, result };
}

// ── per format ────────────────────────────────────────────────────────────

function tabataRows(state: TabataState, activeMs: number) {
  const cfg = state.spec.config;
  const workMs = cfg.workSec * 1000;
  const rows = state.spec.items.map(newRow);
  let done = 0;
  const pendingRight = new Map<number, number>();
  for (const iv of state.data.intervals) {
    const start = tabataWorkStartMs(cfg, iv.index);
    if (activeMs <= start) break;
    const worked = Math.min(workMs, activeMs - start);
    if (worked >= workMs) done += 1;
    const logged = state.data.reps[iv.index];
    const value = logged ?? sec(worked);
    const row = rows[iv.itemIndex];
    if (!row) continue;
    if (logged == null) row.timed = true;
    if (iv.side === 'right') {
      pendingRight.set(iv.itemIndex, value);
      continue;
    }
    const src: RepsSource = logged != null ? 'edited' : 'timer';
    if (iv.side === 'left') {
      const r = pendingRight.get(iv.itemIndex) ?? value;
      pendingRight.delete(iv.itemIndex);
      (row.right ??= []).push(r);
      (row.left ??= []).push(value);
      row.reps.push(Math.min(r, value));
    } else {
      row.reps.push(value);
    }
    row.sources.push(src);
  }
  // A right side cut by the end, with no left: keep it as its own value.
  pendingRight.forEach((r, idx) => {
    const row = rows[idx];
    (row.right ??= []).push(r);
    (row.left ??= []).push(0);
    row.reps.push(0);
    row.sources.push('timer');
  });
  const log = rows.filter((r) => r.reps.length > 0).map((r) => toDetail(r, cfg.workSec));
  return { log, done, total: state.data.intervals.length };
}

function emomRows(state: EmomState) {
  const rows = state.spec.items.map(newRow);
  const legs: TimedAerobicLeg[] = [];
  const minutes: NonNullable<TimedBlockResult['emom']>['minutes'] = [];
  for (const m of state.data.minutes) {
    if (m.status === 'pending') continue; // never reached
    const item = state.spec.items[m.itemIndex];
    const row = rows[m.itemIndex];
    if (!item || !row) continue;
    minutes.push({ index: m.index, itemKey: item.key, status: m.status, workSec: m.workMs != null ? sec(m.workMs) : null, reps: m.reps });
    if (item.kind === 'aerobic_leg') {
      row.reps.push(m.status === 'missed' || m.workMs == null ? 0 : sec(m.workMs));
      row.sources.push('timer');
      legs.push(aerobicLeg(item, m.index + 1, m.distanceM, m.workMs ?? state.spec.config.intervalSec * 1000, m.status === 'done'));
      continue;
    }
    const holdOnly = !(item.targetReps && item.targetReps > 0) && !!item.targetHoldSec;
    if (holdOnly) row.timed = true;
    row.reps.push(m.status === 'missed' ? 0 : m.reps ?? 0);
    row.sources.push(m.repsEdited ? 'edited' : holdOnly ? 'timer' : 'default');
  }
  const log = rows.filter((r) => r.reps.length > 0).map((r) => toDetail(r, null));
  const done = state.data.minutes.filter((m) => m.status === 'done').length;
  return { log, legs, minutes, done, total: state.data.minutes.length };
}

function amrapRows(state: AmrapState) {
  const n = state.spec.items.length;
  const rows = state.spec.items.map(newRow);
  const legs: TimedAerobicLeg[] = [];
  const score = amrapScore(state);
  const rounds: NonNullable<TimedBlockResult['amrap']>['rounds'] = [];
  for (const r of state.data.rounds) {
    const complete = n > 0 && r.items.length >= n && r.items.every((it) => !it.partial);
    const touched = r.items.some((it) => (it.reps ?? 0) > 0 || (it.distanceM ?? 0) > 0 || !it.partial);
    if (!complete && !touched) continue;
    rounds.push({ index: r.index, durationSec: sec((r.endedActiveMs ?? r.startedActiveMs) - r.startedActiveMs), complete });
    for (let i = 0; i < n; i++) {
      const item = state.spec.items[i];
      const rec = r.items.find((x) => x.itemIndex === i);
      const row = rows[i];
      if (item.kind === 'aerobic_leg') {
        row.reps.push(rec ? sec(rec.durationMs) : 0);
        row.sources.push('timer');
        if (rec) legs.push(aerobicLeg(item, r.index + 1, rec.distanceM, rec.durationMs, !rec.partial));
        continue;
      }
      const holdOnly = !(item.targetReps && item.targetReps > 0) && !!item.targetHoldSec;
      if (holdOnly) row.timed = true;
      row.reps.push(rec?.reps ?? 0);
      row.sources.push(rec?.repsEdited ? 'edited' : holdOnly ? 'timer' : 'default');
    }
  }
  const log = rows.filter((r) => r.reps.length > 0).map((r) => toDetail(r, null));
  return { log, legs, score, rounds };
}

export function buildTimedResult(state: TimedState): TimedBlockResult {
  const activeMs = state.clock.frozenActiveMs ?? 0;
  const plannedMs = timedTotalMs(state);
  const base = {
    format: state.spec.format,
    outcome: activeMs >= plannedMs && plannedMs > 0 ? ('completed' as const) : ('stopped' as const),
    startedAtMs: state.clock.startedAtMs,
    endedAtMs: state.clock.endedAtMs,
    activeSec: sec(activeMs),
    plannedSec: sec(plannedMs),
  };
  switch (state.spec.format) {
    case 'tabata': {
      const s = state as TabataState;
      const t = tabataRows(s, activeMs);
      return { ...base, exerciseLog: t.log, aerobicLegs: [], tabata: { intervalsDone: t.done, intervalsTotal: t.total } };
    }
    case 'emom': {
      const e = emomRows(state as EmomState);
      return { ...base, exerciseLog: e.log, aerobicLegs: e.legs, emom: { minutes: e.minutes, done: e.done, total: e.total } };
    }
    case 'amrap': {
      const a = amrapRows(state as AmrapState);
      return { ...base, exerciseLog: a.log, aerobicLegs: a.legs, amrap: { score: a.score, rounds: a.rounds } };
    }
  }
}

/** The block as one strength record of a session's `segments[]`. */
export function toStrengthSegmentRecord(result: TimedBlockResult, index: number, label?: string): SessionSegmentRecord {
  const sets = result.exerciseLog.reduce((a, e) => a + e.confirmedReps.filter((v) => v > 0).length, 0);
  const rec: SessionSegmentRecord = {
    index,
    kind: 'strength',
    label: label ?? result.format,
    planned: { durationSec: result.plannedSec },
    actual: {
      durationSec: result.activeSec,
      exercises: result.exerciseLog.length,
      sets,
      ...(result.exerciseLog.length > 0 ? { exerciseLog: result.exerciseLog } : {}),
    },
  };
  if (result.startedAtMs != null) rec.startedAtMs = result.startedAtMs;
  if (result.endedAtMs != null) rec.endedAtMs = result.endedAtMs;
  return rec;
}
