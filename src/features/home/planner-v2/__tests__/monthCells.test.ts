/**
 * Planner v2 (enable_week_builder_v1): the month strip's cells. October 2026 starts on a
 * Thursday; today = Tue 27.10.
 */
import { describe, expect, it } from 'vitest';
import { buildDayCell, buildMonthSections, rowCapsules, stripMonths, type PlannedLike } from '../lib/monthCells';

const TODAY = '2026-10-27';

describe('buildDayCell', () => {
  it('a past day with a workout is done, with its track tones', () => {
    const c = buildDayCell('2026-10-25', TODAY, [], [{ kind: 'run', minutes: 30 }, { kind: 'strength', minutes: 35 }], { activeMinutes: 70, steps: 9000 }, 8000);
    expect(c).toMatchObject({ kind: 'done', tones: ['strength', 'cardio'], isPast: true });
    expect(c.rings.minutes).toEqual({ strength: 35, run: 30, walk: 5 });
    expect(c.rings.stepsPct).toBe(1);
  });

  it('a past planned day without a workout is missed (shown as rest), never done', () => {
    const p: PlannedLike[] = [{ date: '2026-10-26', kind: 'strength', status: 'missed' }];
    expect(buildDayCell('2026-10-26', TODAY, p, [], undefined, 8000)).toMatchObject({ kind: 'missed', planned: [{ track: 'strength', runCategory: null }] });
  });

  it('today / later with a session is planned; the run keeps its run type', () => {
    const p: PlannedLike[] = [{ date: '2026-10-28', kind: 'run', status: 'upcoming', runCategory: 'short_intervals' }];
    expect(buildDayCell('2026-10-28', TODAY, p, [], undefined, 8000)).toMatchObject({ kind: 'planned', isPast: false, planned: [{ track: 'run', runCategory: 'short_intervals' }] });
    expect(buildDayCell(TODAY, TODAY, [{ date: TODAY, kind: 'strength', status: 'today' }], [], undefined, 8000)).toMatchObject({ kind: 'planned', isToday: true });
  });

  it('a planned session marked done at the source earns its flame', () => {
    expect(buildDayCell('2026-10-20', TODAY, [{ date: '2026-10-20', kind: 'walk', status: 'done' }], [], undefined, 8000)).toMatchObject({ kind: 'done', tones: ['steps'] });
  });

  it('nothing planned → rest', () => {
    expect(buildDayCell('2026-10-29', TODAY, [], [], undefined, 8000).kind).toBe('rest');
  });
});

describe('buildMonthSections', () => {
  it('lays a month out in Sunday-first rows with blanks outside it', () => {
    const [oct] = buildMonthSections({ months: [{ year: 2026, month: 9 }], todayKey: TODAY, planned: [], workoutsByDate: {}, daysByDate: {}, stepGoal: 8000 });
    expect(oct.key).toBe('2026-10');
    expect(oct.rows).toHaveLength(5);
    expect(oct.rows[0].sunday).toBe('2026-09-27');
    expect(oct.rows[0].cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(oct.rows[0].cells[4]?.iso).toBe('2026-10-01');
    expect(oct.rows[4].cells[6]?.iso).toBe('2026-10-31');
  });

  it('wraps 2+ done days in a capsule; one rest day between them stays inside', () => {
    const workoutsByDate = {
      '2026-10-18': [{ kind: 'strength' as const, minutes: 30 }],
      '2026-10-20': [{ kind: 'run' as const, minutes: 30 }],
    };
    const [oct] = buildMonthSections({ months: [{ year: 2026, month: 9 }], todayKey: TODAY, planned: [], workoutsByDate, daysByDate: {}, stepGoal: 8000 });
    const row = oct.rows.find((r) => r.sunday === '2026-10-18')!;
    expect(row.capsules).toHaveLength(1);
    expect(row.capsules[0]).toMatchObject({ from: 0, to: 2 });
    expect(row.capsules[0].background).toContain('rgba(0,186,247');
  });

  it('a missed day breaks the streak', () => {
    const cells = [
      buildDayCell('2026-10-18', TODAY, [], [{ kind: 'strength', minutes: 30 }], undefined, 8000),
      buildDayCell('2026-10-19', TODAY, [{ date: '2026-10-19', kind: 'strength', status: 'missed' }], [], undefined, 8000),
      buildDayCell('2026-10-20', TODAY, [], [{ kind: 'run', minutes: 30 }], undefined, 8000),
    ];
    expect(rowCapsules(cells)).toEqual([]);
  });
});

describe('stripMonths', () => {
  it('the previous, current and next month, across a year end', () => {
    expect(stripMonths(new Date(2026, 11, 5))).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
    ]);
  });
});
