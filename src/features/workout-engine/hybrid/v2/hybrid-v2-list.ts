/**
 * hybrid-v2-list — the session list behind the v2 hybrid player (F-2e,
 * F-3d), pure. One section per planned leg; a station is its exercise cards
 * with one box per set (ExerciseSetsTable), a run leg sits in the same
 * boxes (one row, one box with the distance). No pace under 400 m.
 */
import type { ExerciseSetsRow } from '@/components/ui/v2/ExerciseSetsTable';
import { toneFor, type SetTile } from '@/components/ui/v2/summary';
import type { SegmentExerciseDetail } from '../../core/services/storage.service';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import type { LegResult, LegStatus } from '../../engines/hybrid/sequencer.selectors';
import { fmtClock, fmtPace } from '../../players/running/lib/planned-rep-results';
import { legLabel, legTargetText, repsText, stationExercises, type ContentExercise, type ExerciseNameOf } from './hybrid-v2-view';

export interface HybridListSection {
  key: string;
  kind: 'run' | 'station';
  title: string;
  meta: string;
  status: LegStatus;
  rows: ExerciseSetsRow[];
}

const STATUS_TEXT: Partial<Record<LegStatus, string>> = { done: 'הושלם', skipped: 'דילגת', active: 'עכשיו' };

function exerciseId(x: unknown): string | null {
  const id = (x as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

function runRow(leg: Extract<LegResult, { kind: 'run' | 'cooldown' }>, seg: HybridPlannedSegment, title: string): ExerciseSetsRow {
  const km = leg.distanceM / 1000;
  const covered = leg.distanceM > 0 || leg.durationSec > 0;
  const subtitle = !covered
    ? leg.status === 'skipped' ? 'דילגת' : 'עוד לא התחיל'
    : [fmtClock(leg.durationSec), leg.paceSecPerKm ? `${fmtPace(leg.paceSecPerKm)} לק״מ` : ''].filter(Boolean).join(' · ');
  const tile: SetTile =
    leg.status === 'done' ? { value: km.toFixed(2), tone: 'in' } : covered ? { value: km.toFixed(2), tone: 'missed' } : { value: '–', tone: 'missed' };
  return { key: `leg-${leg.index}`, name: legTargetText(seg) || title, subtitle, tiles: [tile], active: leg.status === 'active', muted: leg.status === 'skipped' };
}

function setTiles(reps: readonly number[], planned: number, target: number | null): SetTile[] {
  const n = Math.max(1, planned, reps.length);
  return Array.from({ length: n }, (_, j) =>
    j < reps.length ? { value: reps[j] > 0 ? String(reps[j]) : '–', tone: toneFor(reps[j], target) } : { value: String(j + 1), tone: 'missed' as const },
  );
}

/** Exercise cards of a station: the planned exercises filled from the log, then any logged extra (a swap). */
export function stationListRows(
  seg: HybridPlannedSegment,
  log: readonly SegmentExerciseDetail[],
  nameOf: ExerciseNameOf,
  imageOf: (entry: ContentExercise) => string | undefined,
  skipped = false,
): ExerciseSetsRow[] {
  const used = new Set<string>();
  const planned = stationExercises(seg).map((e, k): ExerciseSetsRow => {
    const id = exerciseId(e.exercise);
    const row = id ? log.find((r) => r.exerciseId === id) : undefined;
    if (row) used.add(row.exerciseId);
    const target = e.repsRange?.min && e.repsRange.min > 0 ? e.repsRange.min : e.reps && e.reps > 0 ? e.reps : null;
    const image = imageOf(e);
    return {
      key: `${id ?? 'ex'}-${k}`,
      name: nameOf(e.exercise),
      ...(image ? { imageUrl: image } : {}),
      subtitle: skipped ? STATUS_TEXT.skipped ?? '' : repsText(e) || `${e.sets ?? 1} סטים`,
      tiles: setTiles(row?.confirmedReps ?? [], e.sets ?? 0, target),
      muted: skipped,
    };
  });
  const extra = log
    .filter((r) => !used.has(r.exerciseId))
    .map((r, k): ExerciseSetsRow => ({
      key: `log-${r.exerciseId}-${k}`,
      name: r.exerciseName,
      subtitle: r.targetReps > 0 ? `${r.targetReps} חזרות` : `${r.confirmedReps.length} סטים`,
      tiles: setTiles(r.confirmedReps, 0, r.targetReps > 0 ? r.targetReps : null),
    }));
  return [...planned, ...extra];
}

function doneSets(rows: readonly ExerciseSetsRow[]): { done: number; planned: number } {
  const tiles = rows.flatMap((r) => r.tiles);
  return { done: tiles.filter((t) => t.tone !== 'missed').length, planned: tiles.length };
}

/** All sections of the list, in plan order. */
export function hybridListSections(
  plan: readonly HybridPlannedSegment[],
  legs: readonly LegResult[],
  names: Record<string, string>,
  nameOf: ExerciseNameOf,
  imageOf: (entry: ContentExercise) => string | undefined,
): HybridListSection[] {
  return legs.map((leg): HybridListSection => {
    const seg = plan[leg.index];
    const title = legLabel(plan, leg.index, names);
    const statusText = STATUS_TEXT[leg.status];
    if (leg.kind === 'station') {
      const rows = stationListRows(seg, leg.exerciseLog, nameOf, imageOf, leg.status === 'skipped');
      const s = doneSets(rows);
      return {
        key: `st-${leg.index}`,
        kind: 'station',
        title,
        meta: [`${rows.length} תרגילים`, `${s.done}/${s.planned} סטים`, statusText].filter(Boolean).join(' · '),
        status: leg.status,
        rows,
      };
    }
    return {
      key: `leg-${leg.index}`,
      kind: 'run',
      title,
      meta: [legTargetText(seg), statusText].filter(Boolean).join(' · '),
      status: leg.status,
      rows: [runRow(leg, seg, title)],
    };
  });
}

/** "עד עכשיו" totals: "28:12 · 4.40 ק״מ · 4/9 סטים". */
export function listTotals(sections: readonly HybridListSection[], totalSec: number, totalKm: number): string {
  const sets = sections.filter((s) => s.kind === 'station').reduce(
    (a, s) => {
      const d = doneSets(s.rows);
      return { done: a.done + d.done, planned: a.planned + d.planned };
    },
    { done: 0, planned: 0 },
  );
  return [fmtClock(totalSec), `${totalKm.toFixed(2)} ק״מ`, sets.planned > 0 ? `${sets.done}/${sets.planned} סטים` : ''].filter(Boolean).join(' · ');
}
