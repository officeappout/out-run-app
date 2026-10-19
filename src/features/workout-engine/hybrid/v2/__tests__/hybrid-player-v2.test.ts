import { describe, it, expect } from 'vitest';
import type { HybridPlannedSegment } from '../../compose-hybrid-session.service';
import { initSequencer, reduceSequencerAll } from '../../../engines/hybrid/hybrid-sequencer';
import { legResults, sequencerView } from '../../../engines/hybrid/sequencer.selectors';
import type { SequencerEvent } from '../../../engines/hybrid/sequencer.types';
import type { SequencerEventInput } from '../../../engines/hooks/useHybridSequencer';
import { needsLegacyArrive, needsSequencerStart, stationCloseEvents } from '../hybrid-v2-sync';
import { headerView, legLabel, legZone, miniView, nextBlockView, transitionView } from '../hybrid-v2-view';
import { hybridListSections, listTotals, stationListRows } from '../hybrid-v2-list';

const content = {
  exercises: [
    { exercise: { id: 'pull', name: 'מתח' }, sets: 3, reps: 6, repsRange: { min: 6, max: 8 } },
    { exercise: { id: 'dip', name: 'מקבילים' }, sets: 2, reps: 8 },
  ],
  totalPlannedSets: 5,
  estimatedDurationSec: 600,
} as unknown as HybridPlannedSegment['content'];

const PLAN: HybridPlannedSegment[] = [
  { index: 0, kind: 'aerobic', aerobicType: 'running', zone: 'easy', targetPaceSecPerKm: { min: 330, max: 350 }, distanceKm: 2, durationSec: 700, fromKm: 0, toKm: 2, estCalories: 0 },
  { index: 1, kind: 'strength', parkId: 'p1', content, estCalories: 0 },
  { index: 2, kind: 'aerobic', aerobicType: 'running', zone: 'recovery', distanceKm: 0.3, durationSec: 120, fromKm: 2, toKm: 2.3, estCalories: 0 },
];
const NAMES = { p1: 'פארק הירקון' };
const nameOf = (x: unknown) => (x as { name: string }).name;
const imageOf = () => undefined;

const T0 = 1_000_000;
function run(events: Array<SequencerEventInput & { t: number }>) {
  return reduceSequencerAll(
    initSequencer(PLAN),
    events.map(({ t, ...e }) => ({ ...e, atMs: T0 + t * 1000 }) as SequencerEvent),
  );
}

describe('hybrid v2 sync', () => {
  it('starts the sequencer once the legacy session runs', () => {
    expect(needsSequencerStart('idle', 'aerobic', true)).toBe(true);
    expect(needsSequencerStart('idle', 'idle', true)).toBe(false);
    expect(needsSequencerStart('run', 'aerobic', true)).toBe(false);
    expect(needsSequencerStart(null, 'aerobic', true)).toBe(false);
  });

  it('opens the legacy station when the sequencer arrived (transition or station)', () => {
    expect(needsLegacyArrive('transition', 'aerobic')).toBe(true);
    expect(needsLegacyArrive('station', 'aerobic')).toBe(true);
    expect(needsLegacyArrive('transition', 'station')).toBe(false);
    expect(needsLegacyArrive('run', 'aerobic')).toBe(false);
  });

  it('mirrors a finished station with its log and real set count', () => {
    const log = [{ exerciseId: 'pull', exerciseName: 'מתח', confirmedReps: [7, 0, 6], targetReps: 6 }];
    const ev = stationCloseEvents('station', 'station', 'aerobic', { completed: true, durationSec: 300, exerciseLog: log });
    expect(ev).toEqual([{ type: 'STATION_DONE', exerciseLog: log, completedSets: 2 }]);
  });

  it('mirrors a skip; nothing when the sequencer already moved on or the legacy stays', () => {
    expect(stationCloseEvents('transition', 'station', 'aerobic', { completed: false, skipped: true, durationSec: 0 })).toEqual([{ type: 'SKIP_STATION' }]);
    expect(stationCloseEvents('run', 'station', 'aerobic', { completed: false, skipped: true, durationSec: 0 })).toEqual([]);
    expect(stationCloseEvents('station', 'station', 'station', { completed: true, durationSec: 1 })).toEqual([]);
    expect(stationCloseEvents('station', 'aerobic', 'aerobic', { completed: true, durationSec: 1 })).toEqual([]);
  });

  it('a station closed during the countdown starts it first', () => {
    const ev = stationCloseEvents('transition', 'station', 'done', { completed: true, durationSec: 0, exerciseLog: [] });
    expect(ev.map((e) => e.type)).toEqual(['START_STATION', 'STATION_DONE']);
  });

  it('skip from the run leg: arrive + skip lands on the next leg with the station skipped', () => {
    const s = run([
      { type: 'START', t: 0 },
      { type: 'RUN_TICK', t: 300, cumulativeKm: 1, elapsedSec: 300 },
      { type: 'ARRIVE_MANUAL', t: 301 },
      { type: 'SKIP_STATION', t: 301 },
    ]);
    expect(s.phase).toBe('cooldown');
    expect(legResults(s)[1].status).toBe('skipped');
  });
});

describe('hybrid v2 view', () => {
  it('labels legs by where they lead (park name) and the cool-down', () => {
    expect(legLabel(PLAN, 0, NAMES)).toBe('ריצה אל פארק הירקון');
    expect(legLabel(PLAN, 1, NAMES)).toBe('תחנת כוח · פארק הירקון');
    expect(legLabel(PLAN, 2, NAMES)).toBe('ריצת שחרור');
    expect(legLabel(PLAN, 0, {})).toBe('ריצה אל התחנה');
  });

  it('pace band only on legs of 400 m or more', () => {
    expect(legZone(PLAN[0])).toMatchObject({ minSec: 330, maxSec: 350, label: 'ריצה קלה' });
    expect(legZone({ ...PLAN[2], targetPaceSecPerKm: { min: 400, max: 420 } })).toBeNull();
    expect(legZone(PLAN[1])).toBeNull();
  });

  it('header + next strip on the first leg; no emoji anywhere', () => {
    const s = run([{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 60, cumulativeKm: 0.25, elapsedSec: 60 }]);
    const v = sequencerView(s, T0 + 60_000);
    const h = headerView(v, PLAN, NAMES);
    expect(h.eyebrow).toBe('ריצה + כוח');
    // Route + stops sessions carry their own name (runHybridPlan → useHybridRun.sessionLabel).
    expect(headerView(v, PLAN, NAMES, 'מסלול + עצירות').eyebrow).toBe('מסלול + עצירות');
    expect(headerView(v, PLAN, NAMES, null).eyebrow).toBe('ריצה + כוח');
    expect(h.title).toBe('ריצה אל פארק הירקון · 1.8 ק״מ · 1 מתוך 3');
    expect(nextBlockView(v, NAMES)).toMatchObject({ label: 'בלוק כוח · פארק הירקון', meta: '2 תרגילים · 10′' });
    const all = JSON.stringify([h, nextBlockView(v, NAMES), miniView(v, PLAN, NAMES, 60, 0.25)]);
    expect(/[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/.test(all)).toBe(false);
  });

  it('transition card: countdown, station, first exercise', () => {
    const s = run([
      { type: 'START', t: 0 },
      { type: 'RUN_TICK', t: 600, cumulativeKm: 2, elapsedSec: 600 },
      { type: 'ARRIVE_MANUAL', t: 600 },
    ]);
    const t = transitionView(sequencerView(s, T0 + 605_000), PLAN, NAMES, nameOf, 20);
    expect(t.countdown).toBe('0:15');
    expect(t.fraction).toBeCloseTo(0.75);
    expect(t.stationMeta).toBe('2 תרגילים · 5 סטים · 10 דק׳');
    expect(t.first).toEqual({ name: 'מתח', target: '6–8 חזרות', setsText: 'סט 1 מתוך 3' });
    expect(t.moreText).toBe('עוד 1 תרגילים');
  });
});

describe('hybrid v2 session list', () => {
  it('station cards: one box per planned set, done reps toned by target', () => {
    const rows = stationListRows(PLAN[1], [{ exerciseId: 'pull', exerciseName: 'מתח', confirmedReps: [7, 4], targetReps: 6 }], nameOf, imageOf);
    expect(rows).toHaveLength(2);
    expect(rows[0].tiles).toEqual([
      { value: '7', tone: 'in' },
      { value: '4', tone: 'below' },
      { value: '3', tone: 'missed' },
    ]);
    expect(rows[1].tiles.map((t) => t.tone)).toEqual(['missed', 'missed']);
  });

  it('a swapped exercise from the log is kept as an extra card', () => {
    const rows = stationListRows(PLAN[1], [{ exerciseId: 'row', exerciseName: 'חתירה', confirmedReps: [10], targetReps: 10 }], nameOf, imageOf);
    expect(rows.map((r) => r.name)).toEqual(['מתח', 'מקבילים', 'חתירה']);
  });

  it('sections + totals after a finished station; run legs sit in the same boxes', () => {
    const s = run([
      { type: 'START', t: 0 },
      { type: 'RUN_TICK', t: 700, cumulativeKm: 2.1, elapsedSec: 700 },
      { type: 'ARRIVE_MANUAL', t: 700 },
      { type: 'START_STATION', t: 705 },
      { type: 'STATION_DONE', t: 1300, exerciseLog: [{ exerciseId: 'pull', exerciseName: 'מתח', confirmedReps: [7, 7, 6], targetReps: 6 }] },
      { type: 'RUN_TICK', t: 760, cumulativeKm: 2.2, elapsedSec: 760 },
    ]);
    const secs = hybridListSections(PLAN, legResults(s), NAMES, nameOf, imageOf);
    expect(secs.map((x) => [x.kind, x.status])).toEqual([
      ['run', 'done'],
      ['station', 'done'],
      ['run', 'active'],
    ]);
    expect(secs[0].rows[0].tiles).toEqual([{ value: '2.10', tone: 'in' }]);
    expect(secs[1].meta).toBe('2 תרגילים · 3/5 סטים · הושלם');
    // Cool-down of 300 m: no pace in its row.
    expect(secs[2].rows[0].subtitle).not.toMatch(/לק״מ/);
    expect(listTotals(secs, 1360, 2.2)).toBe('22:40 · 2.20 ק״מ · 3/5 סטים');
  });
});
