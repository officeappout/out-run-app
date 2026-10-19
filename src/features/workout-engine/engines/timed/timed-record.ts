/**
 * timed-record — the compact, bounded record of a finished timed block that
 * rides on the saved workout doc (`workouts/{id}.timedBlocks`, optional,
 * written only under enable_home_v2, in the SAME create as the rest of the
 * doc). Enough to redraw the summary's format cards from history; never
 * per-tick data. Pure.
 *
 *   { protocol, segmentId, plannedSec, activeSec,
 *     amrap:  { fullRounds, partialReps, partialTarget, roundTimesSec[] },
 *     emom:   { minutes: [{ status, reps, workSec, target? }] },
 *     tabata: { intervals, intervalsTotal } }
 */
import type { TimedBlockResult } from './timed-result';

export const TIMED_RECORD_MAX_BLOCKS = 8;
export const TIMED_RECORD_MAX_ROUNDS = 60;
export const TIMED_RECORD_MAX_MINUTES = 60;

export type TimedMinuteStatus = 'done' | 'partial' | 'missed';

export interface TimedBlockRecord {
  protocol: 'amrap' | 'emom' | 'tabata';
  segmentId: string;
  plannedSec: number;
  activeSec: number;
  amrap?: { fullRounds: number; partialReps: number; partialTarget: number; roundTimesSec: number[] };
  emom?: { minutes: Array<{ status: TimedMinuteStatus; reps: number | null; workSec: number | null; target?: number }> };
  tabata?: { intervals: number; intervalsTotal: number };
}

const int = (v: unknown, max = 1e6): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : null;

/** Engine result → record (bounded). */
export function toTimedBlockRecord(segmentId: string, r: TimedBlockResult): TimedBlockRecord {
  const base = { protocol: r.format, segmentId: segmentId.slice(0, 80), plannedSec: int(r.plannedSec) ?? 0, activeSec: int(r.activeSec) ?? 0 };
  if (r.amrap) {
    // Round target = the reps of one full round (exercise rows, not runs / holds).
    const partialTarget = r.exerciseLog.reduce((a, e) => a + (e.repsSource?.includes('timer') ? 0 : e.targetReps || 0), 0);
    return {
      ...base,
      amrap: {
        fullRounds: r.amrap.score.fullRounds,
        partialReps: r.amrap.score.extraReps,
        partialTarget,
        roundTimesSec: r.amrap.rounds.filter((x) => x.complete).map((x) => x.durationSec).slice(0, TIMED_RECORD_MAX_ROUNDS),
      },
    };
  }
  if (r.emom) {
    const targetOf = (key: string) => r.exerciseLog.find((e) => e.exerciseId === key)?.targetReps;
    const minutes = Array.from({ length: Math.min(r.emom.total, TIMED_RECORD_MAX_MINUTES) }, (_, i) => {
      const m = r.emom!.minutes.find((x) => x.index === i);
      const status: TimedMinuteStatus = m?.status === 'done' ? 'done' : m?.status === 'partial' ? 'partial' : 'missed';
      const target = status === 'partial' && m ? targetOf(m.itemKey) : undefined;
      return {
        status,
        reps: status === 'missed' ? null : m?.reps ?? null,
        workSec: status === 'done' ? m?.workSec ?? null : null,
        ...(target ? { target } : {}),
      };
    });
    return { ...base, emom: { minutes } };
  }
  return { ...base, tabata: { intervals: r.tabata?.intervalsDone ?? 0, intervalsTotal: r.tabata?.intervalsTotal ?? 0 } };
}

/**
 * Doc field → records. Defensive: anything malformed is dropped, arrays are
 * capped, so a hand-edited or future-shaped doc can never break a summary.
 */
export function parseTimedBlockRecords(raw: unknown): TimedBlockRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: TimedBlockRecord[] = [];
  for (const v of raw.slice(0, TIMED_RECORD_MAX_BLOCKS)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (o.protocol !== 'amrap' && o.protocol !== 'emom' && o.protocol !== 'tabata') continue;
    const base = {
      protocol: o.protocol,
      segmentId: typeof o.segmentId === 'string' ? o.segmentId : '',
      plannedSec: int(o.plannedSec) ?? 0,
      activeSec: int(o.activeSec) ?? 0,
    } as const;
    if (o.protocol === 'amrap') {
      const a = (o.amrap ?? {}) as Record<string, unknown>;
      const times = Array.isArray(a.roundTimesSec) ? a.roundTimesSec : [];
      out.push({
        ...base,
        amrap: {
          fullRounds: int(a.fullRounds, 999) ?? 0,
          partialReps: int(a.partialReps, 9999) ?? 0,
          partialTarget: int(a.partialTarget, 9999) ?? 0,
          roundTimesSec: times.slice(0, TIMED_RECORD_MAX_ROUNDS).map((t) => int(t, 86400) ?? 0),
        },
      });
    } else if (o.protocol === 'emom') {
      const e = (o.emom ?? {}) as Record<string, unknown>;
      const mins = Array.isArray(e.minutes) ? e.minutes : [];
      out.push({
        ...base,
        emom: {
          minutes: mins.slice(0, TIMED_RECORD_MAX_MINUTES).map((m) => {
            const x = (m ?? {}) as Record<string, unknown>;
            const status: TimedMinuteStatus = x.status === 'done' || x.status === 'partial' ? x.status : 'missed';
            const target = int(x.target, 9999);
            return { status, reps: int(x.reps, 9999), workSec: int(x.workSec, 3600), ...(target ? { target } : {}) };
          }),
        },
      });
    } else {
      const t = (o.tabata ?? {}) as Record<string, unknown>;
      out.push({ ...base, tabata: { intervals: int(t.intervals, 999) ?? 0, intervalsTotal: int(t.intervalsTotal, 999) ?? 0 } });
    }
  }
  return out;
}
