/**
 * Home-v2 (enable_home_v2) aerobic + hybrid summary mapping — pure, no React.
 * Builds the overview's three MetricRings and the hybrid strength tab's
 * station tables from data the summaries already receive. A ring fills
 * against a real plan when one exists; otherwise it is closed (100 = done)
 * — never an invented ratio.
 */
import type { MetricRing } from '@/components/ui/v2/MetricRings';
import type { ExerciseSetsRow } from '@/components/ui/v2/ExerciseSetsTable';
import type { SessionSegmentRecord } from '@/features/workout-engine/core/services/storage.service';
import { stationRows } from '@/features/workout-engine/components/strength/utils/summary-v2.mapping';
import type { RepPaceRow } from '@/components/ui/v2/RepPaceTable';
import type { PlannedBlockRecord } from '@/features/workout-engine/core/services/storage.service';
import {
  fmtBand,
  fmtClock,
  fmtPace,
  paceClassText,
  recordClass,
  repSummary,
} from '@/features/workout-engine/players/running/lib/planned-rep-results';

export const RING_COLORS = {
  distance: '#84cc16',
  pace: '#10b981',
  time: '#00baf7',
  strength: '#00baf7',
  segments: '#0284c7',
} as const;

/** min/km → "m:ss" (no leading zero). */
export function paceLabel(minPerKm: number | null | undefined): string {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--';
  let m = Math.floor(minPerKm);
  let s = Math.round((minPerKm - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** seconds → "m:ss" / "h:mm:ss". */
export function timeLabel(sec: number | null | undefined): string {
  const t = Number.isFinite(sec) && (sec as number) > 0 ? Math.floor(sec as number) : 0;
  if (t === 0) return '--';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function pctOf(actual: number, planned: number | null | undefined): number {
  if (!(actual > 0)) return 0;
  if (!planned || planned <= 0) return 100;
  return Math.min(100, Math.round((actual / planned) * 100));
}

/** Run / walk: distance · average pace · time. No targets are stored, so filled rings = done. */
export function aerobicRings(w: { distance?: number; pace?: number; duration?: number }): MetricRing[] {
  const km = w.distance ?? 0;
  return [
    { key: 'distance', value: km > 0 ? km.toFixed(2) : '--', unit: 'ק״מ', label: 'מרחק', pct: km > 0 ? 100 : 0, color: RING_COLORS.distance },
    {
      key: 'pace',
      value: paceLabel(w.pace),
      unit: 'דק׳/ק״מ',
      label: 'קצב ממוצע',
      pct: (w.pace ?? 0) > 0 ? 100 : 0,
      color: RING_COLORS.pace,
    },
    { key: 'time', value: timeLabel(w.duration), label: 'זמן', pct: (w.duration ?? 0) > 0 ? 100 : 0, color: RING_COLORS.time },
  ];
}

export interface HybridRingsInput {
  segments: SessionSegmentRecord[];
  summary: {
    segmentCount: number;
    completedAerobicSegments: number;
    completedStrengthSegments: number;
    totalActualDistanceKm: number;
    totalStrengthSets: number;
  };
}

/** Run + strength: distance vs plan · sets vs plan · segments done. */
export function hybridRings({ segments, summary }: HybridRingsInput): MetricRing[] {
  const plannedKm = segments
    .filter((s) => s.kind === 'aerobic')
    .reduce((a, s) => a + (s.planned?.distanceKm ?? 0), 0);
  const plannedSets = segments
    .filter((s) => s.kind === 'strength')
    .reduce((a, s) => a + (s.planned?.sets ?? 0), 0);
  const km = summary.totalActualDistanceKm;
  const done = summary.completedAerobicSegments + summary.completedStrengthSegments;
  return [
    {
      key: 'distance',
      value: km > 0 ? km.toFixed(2) : '--',
      unit: 'ק״מ',
      label: 'ריצה',
      sub: plannedKm > 0 ? `מתוך ${plannedKm.toFixed(1)} ק״מ` : null,
      pct: pctOf(km, plannedKm),
      color: RING_COLORS.distance,
    },
    {
      key: 'sets',
      value: plannedSets > 0 ? `${summary.totalStrengthSets}/${plannedSets}` : String(summary.totalStrengthSets),
      unit: 'סטים',
      label: 'כוח',
      pct: pctOf(summary.totalStrengthSets, plannedSets),
      color: RING_COLORS.strength,
    },
    {
      key: 'segments',
      value: `${done}/${summary.segmentCount}`,
      unit: 'מקטעים',
      label: 'הושלמו',
      pct: summary.segmentCount > 0 ? Math.min(100, Math.round((done / summary.segmentCount) * 100)) : 0,
      color: RING_COLORS.segments,
    },
  ];
}

export interface HybridStationTable {
  key: string;
  title: string;
  rows: ExerciseSetsRow[];
}

/**
 * One table per strength station that saved a per-exercise log. Stations
 * without a log (older docs, skipped) are left out — the tab falls back to
 * the segment rail for them.
 */
export function hybridStationTables(segments: SessionSegmentRecord[]): HybridStationTable[] {
  const stations = segments.filter((s) => s.kind === 'strength');
  return stations
    .map((s, i) => {
      const log = s.actual?.exerciseLog ?? [];
      const title = stations.length > 1 ? `תחנת כוח ${i + 1}` : 'תחנת כוח';
      return { key: `station-${s.index ?? i}`, title, rows: stationRows(log) };
    })
    .filter((t) => t.rows.length > 0);
}

// ── Planned runs: per-rep table (F-1g) ───────────────────────────────────

export interface RepTableModel {
  rows: RepPaceRow[];
  /** Common target band (sec/km) when every scored rep shares one. */
  band: { min: number; max: number } | null;
  /** "5 מתוך 6 חזרות בטווח" (segments tab chip). */
  summaryLabel: string | null;
  /** "5/6 בטווח" (overview row chip). */
  shortLabel: string | null;
  reps: number;
}

/**
 * Rows of the per-rep table from the saved `blockResults`. Absent / empty ⇒
 * null (older docs, free runs) — callers then show today's laps UI.
 */
export function repTableModel(records: readonly PlannedBlockRecord[] | null | undefined): RepTableModel | null {
  if (!records || records.length === 0) return null;
  const rows: RepPaceRow[] = records.map((r, i) => {
    const c = recordClass(r);
    const band = fmtBand(r.targetMinPaceSec, r.targetMaxPaceSec);
    return {
      key: `${r.blockIndex}-${i}`,
      n: r.rep > 0 ? r.rep : i + 1,
      title: fmtClock(r.durationSeconds),
      ...(band ? { sub: `יעד ${band}` } : {}),
      ...(c ? { status: paceClassText(c) } : {}),
      tone: c ? (c.band === 'in' ? 'in' : 'off') : 'none',
      value: r.avgPaceSec ? fmtPace(r.avgPaceSec) : fmtClock(r.durationSeconds),
      paceSec: r.avgPaceSec ?? null,
      ...(r.avgPaceSec ? { paceLabel: fmtPace(r.avgPaceSec) } : {}),
    };
  });
  const banded = records.filter((r) => r.targetMinPaceSec && r.targetMaxPaceSec);
  const first = banded[0];
  const common =
    first && banded.every((r) => r.targetMinPaceSec === first.targetMinPaceSec && r.targetMaxPaceSec === first.targetMaxPaceSec)
      ? { min: first.targetMinPaceSec as number, max: first.targetMaxPaceSec as number }
      : null;
  const s = repSummary(records);
  return {
    rows,
    band: common,
    summaryLabel: s.scored > 0 ? `${s.inRange} מתוך ${s.scored} חזרות בטווח` : null,
    shortLabel: s.label,
    reps: records.length,
  };
}
