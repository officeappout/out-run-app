/** Planner v2 (enable_week_builder_v1): the day drawer's model. */
import { describe, expect, it } from 'vitest';
import { buildDayRings } from '../lib/dayRings';
import { buildDayDrawer, doneRowsOf } from '../lib/dayDrawer';

const rings = buildDayRings({ minutes: { strength: 20, run: 30, walk: 0 }, steps: 5000, stepGoal: 8000 });

describe('doneRowsOf', () => {
  it('folds a combined workout\'s parts into one row (its doc id), oldest first', () => {
    const rows = doneRowsOf([
      { id: 'w2', kind: 'strength', minutes: 30, km: 0, date: new Date(2026, 9, 25, 18), title: 'דחיפה' },
      { id: 'h1#run', sessionId: 'h1', kind: 'run', minutes: 20, km: 3.04, date: new Date(2026, 9, 25, 7) },
      { id: 'h1#strength', sessionId: 'h1', kind: 'strength', minutes: 15, km: 0, date: new Date(2026, 9, 25, 7) },
    ]);
    expect(rows).toEqual([
      { workoutId: 'h1', kinds: ['run', 'strength'], title: null, minutes: 35, km: 3 },
      { workoutId: 'w2', kinds: ['strength'], title: 'דחיפה', minutes: 30, km: 0 },
    ]);
  });
});

describe('buildDayDrawer', () => {
  it('lists every track (zeros too), the done workouts and the sessions still planned', () => {
    const m = buildDayDrawer({
      iso: '2026-10-28',
      todayKey: '2026-10-27',
      rings,
      workouts: [],
      sessions: [
        { id: 'strength-2026-10-28', track: 'strength', titleHe: 'משיכה', detailHe: 'ערב', data: { entryIds: ['e1'], programIds: ['PULL'], date: '2026-10-28', startTime: '18:30' } },
        { id: 'run-2026-10-28', track: 'run', titleHe: 'אינטרוולים', detailHe: '40 דק׳ · בוקר', locked: true },
      ],
    });
    expect(m.isToday).toBe(false);
    expect(m.tracks.map((t) => [t.key, t.minutes])).toEqual([
      ['strength', 20],
      ['run', 30],
      ['walk', 0],
    ]);
    expect(m.planned).toEqual([
      { sessionId: 'strength-2026-10-28', track: 'strength', titleHe: 'משיכה', detailHe: 'ערב', time: '18:30', timeEditable: true, movable: true },
      { sessionId: 'run-2026-10-28', track: 'run', titleHe: 'אינטרוולים', detailHe: '40 דק׳ · בוקר', time: null, timeEditable: false, movable: false },
    ]);
  });

  it('a past day: done sessions are not "planned", and no time can be set any more', () => {
    const m = buildDayDrawer({
      iso: '2026-10-25',
      todayKey: '2026-10-27',
      rings,
      workouts: [],
      sessions: [
        { id: 'a', track: 'strength', titleHe: 'א', detailHe: null, status: 'done', data: { entryIds: ['e'], programIds: [], date: '2026-10-25' } },
        { id: 'b', track: 'strength', titleHe: 'ב', detailHe: null, status: 'missed', data: { entryIds: ['f'], programIds: [], date: '2026-10-25' } },
      ],
    });
    expect(m.isPast).toBe(true);
    expect(m.planned.map((p) => [p.sessionId, p.timeEditable])).toEqual([['b', false]]);
  });
});
