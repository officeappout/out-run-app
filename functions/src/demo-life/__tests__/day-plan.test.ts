import { describe, expect, it } from 'vitest';
import { dayFraction, dayState, daySignature, isWeakWeek, planDay, weekMinutes } from '../day-plan';
import { addDays, israelMs, israelParts, weekStartOf } from '../time';
import { at, persona, TUE } from './fixtures';

const stateAt = (p: ReturnType<typeof persona>, ms: number) => {
  const x = israelParts(ms);
  return dayState(p, x.date, x.dow, ms, x.minuteOfDay);
};

describe('Israel time helpers', () => {
  it('round-trips wall-clock times, also across the October DST switch', () => {
    for (const date of ['2026-10-20', '2026-10-25', '2026-10-26', '2026-03-27']) {
      for (const m of [0, 5 * 60, 18 * 60 + 30, 23 * 60 + 59]) {
        const p = israelParts(israelMs(date, m));
        expect(p.date).toBe(date);
        expect(p.minuteOfDay).toBe(m);
      }
    }
    expect(israelParts(at('18:00')).dow).toBe(2);
    expect(weekStartOf(TUE, 2)).toBe('2026-10-18');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('planDay / dayState', () => {
  const p = persona();
  // Pick a Tuesday that is not a weak week, so adherence 1 means "does everything".
  let date = TUE;
  while (isWeakWeek(p.uid, weekStartOf(date, 2))) date = addDays(date, 7);
  const t = (hhmm: string) => at(hhmm, date);

  it('is deterministic: the same day twice is the same plan', () => {
    expect(JSON.stringify(planDay(p, date, 2))).toBe(JSON.stringify(planDay(p, date, 2)));
  });

  it('a session is active while it runs, ended after — never before its start', () => {
    const plan = planDay(p, date, 2);
    const strength = plan[0];
    expect(strength.does).toBe(true);
    expect(strength.done?.workoutId).toBe(`demo_t01_w_${date}_0`);
    expect(stateAt(p, strength.startMs - 60_000).ended).toHaveLength(0);
    expect(stateAt(p, strength.startMs + 60_000).active?.s.i).toBe(0);
    const after = stateAt(p, strength.endMs + 1);
    expect(after.ended.map((x) => x.s.i)).toContain(0);
    expect(after.dayMin.strength).toBe(strength.done!.minutes);
  });

  it('steps only grow through the day and land on 4 slots (few writes)', () => {
    let prev = -1;
    const sigs = new Set<string>();
    for (let m = 5 * 60; m < 24 * 60; m += 30) {
      const st = stateAt(p, israelMs(date, m));
      expect(st.steps).toBeGreaterThanOrEqual(prev);
      prev = st.steps;
      sigs.add(daySignature(st));
    }
    // 4 step slots + the two sessions ending → only a handful of distinct day states.
    expect(sigs.size).toBeLessThanOrEqual(8);
    expect(dayFraction(6 * 60)).toBe(0);
    expect(dayFraction(22 * 60)).toBe(1);
  });

  it('adherence 0 → nothing done, still walks', () => {
    const lazy = persona({ adherence: 0 });
    const st = stateAt(lazy, t('23:00'));
    expect(st.ended).toHaveLength(0);
    expect(st.steps).toBeGreaterThan(1000);
  });

  it('over many weeks: adherence and the weak week show up in the numbers', () => {
    const half = persona({ adherence: 0.6 });
    let planned = 0;
    let done = 0;
    for (let k = 0; k < 40; k++) {
      const d = addDays(TUE, k * 7);
      for (const x of planDay(half, d, 2)) {
        planned++;
        if (x.does) done++;
      }
    }
    expect(done / planned).toBeGreaterThan(0.35);
    expect(done / planned).toBeLessThan(0.8);
  });

  it('week minutes add the earlier days of the week', () => {
    const st = stateAt(p, t('23:30'));
    const w = weekMinutes(p, date, 2, st);
    expect(w.strength).toBeGreaterThanOrEqual(st.dayMin.strength);
    expect(w.cardio).toBeGreaterThanOrEqual(st.dayMin.cardio);
  });
});
