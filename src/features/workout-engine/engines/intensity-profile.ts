/**
 * intensity-profile — the preview's intensity chart (pure). One segment per
 * block with its RELATIVE duration (`share`, sums to 1) and an intensity
 * level + colour key; the chart only lays them out. Works on the PLAN, so it
 * renders before the workout starts.
 *
 *   hybrid: run legs by zone, a transition (rest) before each station, the
 *           station itself (strength);
 *   tabata: work (high) / rest per interval;  EMOM: one block per minute;
 *   AMRAP:  one block for the cap.
 */
import type { RunZoneType } from '../core/types/running.types';
import type { HybridPlannedSegment } from '../hybrid/compose-hybrid-session.service';
import { buildTabataIntervals } from './timed/tabata-schedule';
import type { TimedBlockSpec } from './timed/timed.types';

export type IntensityLevel = 'rest' | 'low' | 'moderate' | 'high';
export type IntensityColorKey = 'cardio' | 'strength' | 'rest';

export interface IntensitySegment {
  key: string;
  kind: 'run' | 'transition' | 'station' | 'work' | 'rest' | 'minute' | 'amrap';
  durationSec: number;
  /** durationSec / total (0–1). */
  share: number;
  level: IntensityLevel;
  colorKey: IntensityColorKey;
}

/** 0–3 height for the chart (rest 0 … high 3). */
export const INTENSITY_RANK: Record<IntensityLevel, number> = { rest: 0, low: 1, moderate: 2, high: 3 };

const ZONE_LEVEL: Record<RunZoneType, IntensityLevel> = {
  walk: 'low',
  recovery: 'low',
  jogging: 'low',
  easy: 'moderate',
  long_run: 'moderate',
  fartlek_medium: 'moderate',
  tempo: 'high',
  fartlek_fast: 'high',
  interval_long: 'high',
  interval_short: 'high',
  sprint: 'high',
};

export function zoneLevel(zone: RunZoneType | undefined, kind: 'walking' | 'running' | undefined): IntensityLevel {
  if (zone && ZONE_LEVEL[zone]) return ZONE_LEVEL[zone];
  return kind === 'walking' ? 'low' : 'moderate';
}

function withShares(raw: Array<Omit<IntensitySegment, 'share'>>): IntensitySegment[] {
  const segs = raw.filter((r) => r.durationSec > 0);
  const total = segs.reduce((a, r) => a + r.durationSec, 0);
  return segs.map((r) => ({ ...r, share: total > 0 ? r.durationSec / total : 0 }));
}

/** Planned seconds of a hybrid segment (aerobic: duration, else distance × mid target pace). */
function plannedSec(seg: HybridPlannedSegment): number {
  if (seg.durationSec && seg.durationSec > 0) return seg.durationSec;
  if (seg.kind === 'strength') return seg.content?.estimatedDurationSec ?? 0;
  const p = seg.targetPaceSecPerKm;
  if (seg.distanceKm && p) return Math.round(seg.distanceKm * ((p.min + p.max) / 2));
  return 0;
}

export function hybridIntensityProfile(plan: readonly HybridPlannedSegment[], opts: { transitionSec?: number } = {}): IntensitySegment[] {
  const transitionSec = opts.transitionSec ?? 20;
  const raw: Array<Omit<IntensitySegment, 'share'>> = [];
  plan.forEach((seg, i) => {
    if (seg.kind === 'aerobic') {
      raw.push({ key: `leg-${i}`, kind: 'run', durationSec: plannedSec(seg), level: zoneLevel(seg.zone, seg.aerobicType), colorKey: 'cardio' });
      return;
    }
    if (transitionSec > 0 && i > 0) raw.push({ key: `tr-${i}`, kind: 'transition', durationSec: transitionSec, level: 'rest', colorKey: 'rest' });
    raw.push({ key: `st-${i}`, kind: 'station', durationSec: plannedSec(seg), level: 'moderate', colorKey: 'strength' });
  });
  return withShares(raw);
}

export function timedIntensityProfile(spec: TimedBlockSpec): IntensitySegment[] {
  const raw: Array<Omit<IntensitySegment, 'share'>> = [];
  if (spec.format === 'tabata') {
    const ivs = buildTabataIntervals(spec.items, spec.config);
    ivs.forEach((iv, k) => {
      const run = spec.items[iv.itemIndex]?.kind === 'aerobic_leg';
      raw.push({ key: `w-${k}`, kind: 'work', durationSec: spec.config.workSec, level: 'high', colorKey: run ? 'cardio' : 'strength' });
      if (k < ivs.length - 1 && spec.config.restSec > 0) raw.push({ key: `r-${k}`, kind: 'rest', durationSec: spec.config.restSec, level: 'rest', colorKey: 'rest' });
    });
  } else if (spec.format === 'emom') {
    const n = Math.max(0, Math.floor(spec.config.totalIntervals));
    const count = Math.max(1, spec.items.length);
    for (let i = 0; i < n; i++) {
      const run = spec.items[i % count]?.kind === 'aerobic_leg';
      raw.push({ key: `m-${i}`, kind: 'minute', durationSec: spec.config.intervalSec, level: 'high', colorKey: run ? 'cardio' : 'strength' });
    }
  } else {
    raw.push({ key: 'amrap', kind: 'amrap', durationSec: spec.config.capSec, level: 'high', colorKey: 'strength' });
  }
  return withShares(raw);
}
