/**
 * Home v2 (enable_home_v2) — the optional `runMeta` saved with a run so the
 * summary can differ by workout type (easy / intervals / long). Pure, no
 * React, no Firebase: useRunningPlayer.finishWorkout gathers the inputs and
 * calls this only while the flag is on. Never returns undefined values
 * (Firestore rejects them).
 */
import type RunWorkout from '../types/run-workout.type';
import type { PlannedBlockRecord, RunSummaryMeta } from '../../../core/services/storage.service';
import type { PlannedBlockResult } from '../../../core/services/pace-self-correction.service';
import { buildBlockRecords, isWorkBlock, planSections } from './planned-rep-results';
import { kmSplitsFromTrack, type TrackSample } from './km-splits';
import { paceOverridesOf } from '../utils/run-overview/run-pace-override';

export interface RunSummaryMetaInput {
  /** The planned workout (null for free / route runs). */
  workout: RunWorkout | null;
  /** Per-block actuals of the planned run (all blocks, in order). */
  results: readonly PlannedBlockResult[];
  /** The saved per-rep records (target bands already resolved). */
  blockResults: readonly PlannedBlockRecord[];
  /** Raw GPS trace (time-stamped). */
  trace: readonly TrackSample[];
  /** The run already has auto-km laps ⇒ no trace splits. */
  hasKmLaps: boolean;
  totalKm: number;
  activeSec: number;
  /** Live time-in-zone accumulator, when the player provides one. */
  timeInZone?: unknown;
  /** Program position read from the planned-run launch (week/day). */
  plan?: { week: number; day: number } | null;
}

/** `{ inSec, totalSec }` when the value has that shape and makes sense; else null. */
export function readTimeInZone(raw: unknown): { inSec: number; totalSec: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { inSec?: unknown; totalSec?: unknown };
  const inSec = typeof r.inSec === 'number' ? r.inSec : NaN;
  const totalSec = typeof r.totalSec === 'number' ? r.totalSec : NaN;
  if (!Number.isFinite(inSec) || !Number.isFinite(totalSec) || totalSec <= 0 || inSec < 0) return null;
  return { inSec: Math.round(Math.min(inSec, totalSec)), totalSec: Math.round(totalSec) };
}

function sectionTotals(
  indices: readonly number[],
  records: readonly PlannedBlockRecord[],
): { durationSeconds: number; distanceMeters: number } | null {
  const set = new Set(indices);
  const picked = records.filter((r) => set.has(r.blockIndex));
  if (picked.length === 0) return null;
  const durationSeconds = picked.reduce((a, r) => a + r.durationSeconds, 0);
  const distanceMeters = picked.reduce((a, r) => a + r.distanceMeters, 0);
  if (!(durationSeconds > 0)) return null;
  return { durationSeconds, distanceMeters };
}

export function buildRunSummaryMeta(input: RunSummaryMetaInput): RunSummaryMeta | null {
  const meta: RunSummaryMeta = {};
  const w = input.workout;

  if (w) {
    if (w.category) meta.category = w.category;
    if (w.slotType) meta.slotType = w.slotType;
    if (w.id) meta.workoutId = w.id;
    if (w.title) meta.title = w.title;
    const reps = w.blocks.filter(isWorkBlock).length;
    if (reps > 0) meta.plannedReps = reps;

    // Distinct target bands of the reps, in order.
    const seen = new Set<string>();
    const zones: { minPaceSec: number; maxPaceSec: number }[] = [];
    for (const r of input.blockResults) {
      if (!r.targetMinPaceSec || !r.targetMaxPaceSec) continue;
      const k = `${r.targetMinPaceSec}-${r.targetMaxPaceSec}`;
      if (seen.has(k)) continue;
      seen.add(k);
      zones.push({ minPaceSec: r.targetMinPaceSec, maxPaceSec: r.targetMaxPaceSec });
    }
    if (zones.length > 0) meta.zones = zones;

    // Warm-up / cool-down actuals (all-block records; targets not needed).
    const all = buildBlockRecords(w.blocks, input.results, () => ({ min: 0, max: 0 }), { workOnly: false });
    const sec = planSections(w.blocks);
    const warm = sectionTotals(sec.warmup, all);
    const cool = sectionTotals(sec.cooldown, all);
    if (warm) meta.warmup = warm;
    if (cool) meta.cooldown = cool;

    if (input.plan && input.plan.week > 0 && input.plan.day > 0) meta.plan = { week: input.plan.week, day: input.plan.day };

    // Overview edits (boards M-7a / 7b): edited paces + a swapped main set.
    const overrides = paceOverridesOf(w.blocks);
    if (overrides.length > 0) {
      meta.paceOverridden = true;
      meta.paceOverrides = overrides;
    }
    if (w.mainSwap?.from && w.mainSwap.to) meta.mainSwap = { from: w.mainSwap.from, to: w.mainSwap.to };
  }

  const tiz = readTimeInZone(input.timeInZone);
  if (tiz) meta.timeInZone = tiz;

  if (!input.hasKmLaps) {
    const splits = kmSplitsFromTrack(input.trace, { totalKm: input.totalKm, activeSec: input.activeSec });
    if (splits) meta.kmSplits = splits;
  }

  return Object.keys(meta).length > 0 ? meta : null;
}
