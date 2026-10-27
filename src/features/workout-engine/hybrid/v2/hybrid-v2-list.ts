/**
 * hybrid-v2-list — the session list behind the v2 hybrid player (F-2e,
 * F-3d), pure. One section per planned leg; a station is its exercise cards
 * with one box per set (ExerciseSetsTable), a run leg sits in the same
 * boxes (one row, one box with the distance). No pace under 400 m.
 */
import { withUnit } from '@/lib/i18n/units';
import type { ExerciseSetsRow } from '@/components/ui/v2/ExerciseSetsTable';
import { toneFor, type SetTile } from '@/components/ui/v2/summary';
import type { SegmentExerciseDetail } from '../../core/services/storage.service';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import type { LegResult, LegStatus } from '../../engines/hybrid/sequencer.selectors';
import { fmtClock, fmtPace } from '../../players/running/lib/planned-rep-results';
import { legLabel, legTargetText, repsText, stationExercises, type ContentExercise, type ExerciseNameOf } from './hybrid-v2-view';
import { defaultPlayerT, type PlayerT } from '../hybrid-t';

export interface HybridListSection {
  key: string;
  kind: 'run' | 'station';
  title: string;
  meta: string;
  status: LegStatus;
  rows: ExerciseSetsRow[];
}

/** "הושלם" / "דילגת" / "עכשיו"; a leg not reached yet has no status text. */
function statusText(status: LegStatus, t: PlayerT): string | undefined {
  return status === 'done' || status === 'skipped' || status === 'active' ? t(`hybrid.v2.list.status.${status}`) : undefined;
}

function exerciseId(x: unknown): string | null {
  const id = (x as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

function runRow(leg: Extract<LegResult, { kind: 'run' | 'cooldown' }>, seg: HybridPlannedSegment, title: string, t: PlayerT): ExerciseSetsRow {
  const km = leg.distanceM / 1000;
  const covered = leg.distanceM > 0 || leg.durationSec > 0;
  const subtitle = !covered
    ? leg.status === 'skipped' ? t('hybrid.v2.list.status.skipped') : t('hybrid.v2.list.notStarted')
    : [fmtClock(leg.durationSec), leg.paceSecPerKm ? t('hybrid.v2.list.pacePerKm', { pace: fmtPace(leg.paceSecPerKm) }) : ''].filter(Boolean).join(' · ');
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
  t: PlayerT = defaultPlayerT(),
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
      subtitle: skipped ? t('hybrid.v2.list.status.skipped') : repsText(e, t) || t('hybrid.v2.meta.sets', { n: String(e.sets ?? 1) }),
      tiles: setTiles(row?.confirmedReps ?? [], e.sets ?? 0, target),
      muted: skipped,
    };
  });
  const extra = log
    .filter((r) => !used.has(r.exerciseId))
    .map((r, k): ExerciseSetsRow => ({
      key: `log-${r.exerciseId}-${k}`,
      name: r.exerciseName,
      subtitle: r.targetReps > 0 ? t('hybrid.v2.list.repsCount', { n: String(r.targetReps) }) : t('hybrid.v2.meta.sets', { n: String(r.confirmedReps.length) }),
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
  t: PlayerT = defaultPlayerT(),
): HybridListSection[] {
  return legs.map((leg): HybridListSection => {
    const seg = plan[leg.index];
    const title = legLabel(plan, leg.index, names, t);
    const status = statusText(leg.status, t);
    if (leg.kind === 'station') {
      const rows = stationListRows(seg, leg.exerciseLog, nameOf, imageOf, leg.status === 'skipped', t);
      const s = doneSets(rows);
      return {
        key: `st-${leg.index}`,
        kind: 'station',
        title,
        meta: [t('hybrid.v2.meta.exercises', { n: String(rows.length) }), t('hybrid.v2.list.setsDone', { done: String(s.done), planned: String(s.planned) }), status].filter(Boolean).join(' · '),
        status: leg.status,
        rows,
      };
    }
    return {
      key: `leg-${leg.index}`,
      kind: 'run',
      title,
      meta: [legTargetText(seg), status].filter(Boolean).join(' · '),
      status: leg.status,
      rows: [runRow(leg, seg, title, t)],
    };
  });
}

/** "עד עכשיו" totals: "28:12 · 4.40 ק״מ · 4/9 סטים". */
export function listTotals(sections: readonly HybridListSection[], totalSec: number, totalKm: number, t: PlayerT = defaultPlayerT()): string {
  const sets = sections.filter((s) => s.kind === 'station').reduce(
    (a, s) => {
      const d = doneSets(s.rows);
      return { done: a.done + d.done, planned: a.planned + d.planned };
    },
    { done: 0, planned: 0 },
  );
  return [fmtClock(totalSec), withUnit('km', totalKm.toFixed(2)), sets.planned > 0 ? t('hybrid.v2.list.setsDone', { done: String(sets.done), planned: String(sets.planned) }) : ''].filter(Boolean).join(' · ');
}
