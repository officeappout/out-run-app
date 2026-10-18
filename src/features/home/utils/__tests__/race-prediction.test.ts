import { describe, it, expect } from 'vitest';
import {
  basePaceDaysAgo,
  formatDistanceLabel,
  formatRaceClock,
  formatRaceTime,
  formatTrend,
  predictRaceSeconds,
  selectRacePrediction,
  targetDistanceKm,
} from '../race-prediction';

const NOW = new Date('2026-10-18T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('targetDistanceKm', () => {
  it('maps plan distances, falls back to 5', () => {
    expect(targetDistanceKm('10k')).toBe(10);
    expect(targetDistanceKm('3k')).toBe(3);
    expect(targetDistanceKm('maintenance')).toBe(5);
    expect(targetDistanceKm(undefined)).toBe(5);
    expect(targetDistanceKm(42)).toBe(5);
  });
});

describe('predictRaceSeconds', () => {
  it('main distance = basePace × km (identity)', () => {
    expect(predictRaceSeconds(330, 10, 10)).toBe(3300);
  });
  it('Riegel 1.06 to other distances', () => {
    expect(predictRaceSeconds(300, 5, 10)).toBeCloseTo(1500 * Math.pow(2, 1.06), 6);
  });
  it('0 for invalid input', () => {
    expect(predictRaceSeconds(0, 5, 5)).toBe(0);
    expect(predictRaceSeconds(300, 0, 5)).toBe(0);
  });
});

describe('formatting', () => {
  it('clock under / over an hour', () => {
    expect(formatRaceClock(1475)).toBe('24:35');
    expect(formatRaceClock(3420)).toBe('57:00');
    expect(formatRaceClock(6730)).toBe('1:52:10');
    expect(formatRaceClock(59.6)).toBe('1:00');
    expect(formatRaceClock(0)).toBe('--:--');
  });
  it('unit switches at an hour', () => {
    expect(formatRaceTime(3420)).toEqual({ value: '57:00', unit: 'דק׳' });
    expect(formatRaceTime(3600)).toEqual({ value: '1:00:00', unit: 'שע׳' });
  });
  it('distance labels', () => {
    expect(formatDistanceLabel(5)).toBe('5 ק״מ');
    expect(formatDistanceLabel(21.0975)).toBe('21.1 ק״מ');
  });
  it('trend text', () => {
    expect(formatTrend(-42)).toEqual({ clock: '0:42', label: 'מהר יותר', faster: true });
    expect(formatTrend(75)).toEqual({ clock: '1:15', label: 'איטי יותר', faster: false });
  });
});

describe('basePaceDaysAgo', () => {
  it('null without history or without dated impact in window', () => {
    expect(basePaceDaysAgo(330, [], NOW)).toBeNull();
    expect(basePaceDaysAgo(330, undefined, NOW)).toBeNull();
    expect(basePaceDaysAgo(330, [{ date: daysAgo(5), impactOnBasePaceSeconds: 0 }], NOW)).toBeNull();
    expect(basePaceDaysAgo(330, [{ date: daysAgo(40), impactOnBasePaceSeconds: -5 }], NOW)).toBeNull();
    expect(basePaceDaysAgo(330, [{ impactOnBasePaceSeconds: -5 }], NOW)).toBeNull();
  });
  it('sums impacts inside the window (strings and Dates)', () => {
    const history = [
      { date: daysAgo(40), impactOnBasePaceSeconds: -10 },
      { date: daysAgo(10), impactOnBasePaceSeconds: -5 / 3 },
      { date: new Date(daysAgo(9)), impactOnBasePaceSeconds: -5 / 3 },
      { date: daysAgo(8), impactOnBasePaceSeconds: -5 / 3 },
    ];
    expect(basePaceDaysAgo(325, history, NOW)).toBeCloseTo(330, 6);
  });
});

describe('selectRacePrediction', () => {
  const base = { isRunner: true, runningProgramsEnabled: false, now: NOW };

  it('hidden for non-runners and for runners without basePace when programs are off', () => {
    expect(selectRacePrediction({ ...base, isRunner: false, runningProgramsEnabled: true })).toEqual({ state: 'hidden' });
    expect(selectRacePrediction({ ...base, basePace: 0 })).toEqual({ state: 'hidden' });
  });

  it('empty state for a runner without basePace when programs are on', () => {
    expect(selectRacePrediction({ ...base, runningProgramsEnabled: true })).toEqual({ state: 'empty' });
  });

  it('ready with a real basePace even when programs are off', () => {
    const v = selectRacePrediction({ ...base, basePace: 342, targetDistance: '10k' });
    expect(v.state).toBe('ready');
    if (v.state !== 'ready') return;
    expect(v.main.km).toBe(10);
    expect(Math.round(v.main.seconds)).toBe(3420);
    expect(v.others.map((o) => o.label)).toEqual(['5 ק״מ', '21.1 ק״מ']);
    expect(v.trendSeconds).toBeNull();
  });

  it('defaults main distance to 5 km; 3 km plans keep all three secondary rows', () => {
    const v5 = selectRacePrediction({ ...base, basePace: 300 });
    expect(v5.state === 'ready' && v5.main.km).toBe(5);
    expect(v5.state === 'ready' && v5.others.map((o) => o.km)).toEqual([10, 21.0975]);
    const v3 = selectRacePrediction({ ...base, basePace: 300, targetDistance: '3k' });
    expect(v3.state === 'ready' && v3.others.length).toBe(3);
  });

  it('trend only from dated history', () => {
    const v = selectRacePrediction({
      ...base,
      basePace: 325,
      targetDistance: '5k',
      history: [{ date: daysAgo(3), impactOnBasePaceSeconds: -5 }],
    });
    expect(v.state === 'ready' && v.trendSeconds).toBe(-25);
  });
});
