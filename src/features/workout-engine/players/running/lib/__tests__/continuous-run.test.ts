import { describe, it, expect } from 'vitest';
import type { RunBlock } from '../../types/run-block.type';
import {
  EMPTY_ZONE_TIME,
  accumulateZoneTime,
  avgPaceSec,
  blockGoal,
  clampPage,
  continuousMainIndex,
  continuousPages,
  continuousZone,
  createZoneTracker,
  goalView,
  heroKind,
  isContinuousPlan,
  lapRows,
  legPaceSec,
  nextZoneStatus,
  pushPaceSample,
  swipePage,
  zoneStatusText,
  zoneTimePercent,
  type ZoneTarget,
  type ZoneTrackerState,
} from '../continuous-run';

const blk = (over: Partial<RunBlock>): RunBlock => ({ id: Math.random().toString(36), type: 'run', label: '', colorHex: '#000', ...over });

const warm = blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, _isDynamicWrapper: true });
const cool = blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 300, _isDynamicWrapper: true });
const easy = blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 2100, zoneType: 'easy' });

describe('continuousMainIndex / isContinuousPlan', () => {
  it('a single steady run is continuous', () => {
    expect(continuousMainIndex([easy])).toBe(0);
  });
  it('wrappers (warm-up, cool-down, strides + their rests) are ignored', () => {
    const strides = blk({ type: 'run', label: 'סטריידס (1/2)', durationSeconds: 20, blockMode: 'effort', _isDynamicWrapper: true });
    const rest = blk({ type: 'walk', durationSeconds: 45, _isSynthesizedRest: true, _isDynamicWrapper: true });
    expect(continuousMainIndex([warm, strides, rest, strides, easy, cool])).toBe(4);
  });
  it('race-pace tempo (warm-up · one 5 km block · cool-down) is continuous', () => {
    const tempo = blk({ type: 'run', distanceMeters: 5000, zoneType: 'tempo' });
    expect(isContinuousPlan([warm, tempo, cool])).toBe(true);
  });
  it('intervals are not continuous', () => {
    const rep = blk({ type: 'interval', distanceMeters: 400, zoneType: 'interval_short' });
    const rec = blk({ type: 'recovery', durationSeconds: 90 });
    expect(isContinuousPlan([warm, rep, rec, rep, cool])).toBe(false);
  });
  it('a single effort / short block is not continuous; empty plans neither', () => {
    expect(isContinuousPlan([blk({ blockMode: 'effort', durationSeconds: 600 })])).toBe(false);
    expect(isContinuousPlan([blk({ distanceMeters: 300 })])).toBe(false);
    expect(isContinuousPlan([])).toBe(false);
    expect(isContinuousPlan(null)).toBe(false);
  });
  it('two steady blocks (easy + tempo) are not a single block', () => {
    expect(isContinuousPlan([easy, blk({ zoneType: 'tempo', durationSeconds: 900 })])).toBe(false);
  });
});

describe('continuousZone', () => {
  const zones = { easy: { minPace: 380, maxPace: 410 } } as never;
  it('passes the planned zone (sorted) with its label', () => {
    expect(continuousZone(easy, 300, zones, true)).toEqual({ minSec: 380, maxSec: 410, label: 'ריצה קלה', showNumbers: true });
  });
  it('falls back to the percentage rule', () => {
    const b = blk({ durationSeconds: 1200, targetPacePercentage: { min: 110, max: 100 } });
    const z = continuousZone(b, 300, null, false)!;
    expect([z.minSec, z.maxSec]).toEqual([300, 330]);
  });
  it('no zone without a base pace, on effort blocks and on short legs', () => {
    expect(continuousZone(easy, 0, zones, true)).toBeNull();
    expect(continuousZone(blk({ blockMode: 'effort', durationSeconds: 600, zoneType: 'easy' }), 300, zones, true)).toBeNull();
    expect(continuousZone(blk({ distanceMeters: 200, zoneType: 'easy' }), 300, zones, true)).toBeNull();
    expect(continuousZone(null, 300, zones, true)).toBeNull();
  });
});

const Z: ZoneTarget = { minSec: 380, maxSec: 410, label: 'ריצה קלה', showNumbers: true };

function feed(paces: number[], zone: ZoneTarget | null = Z, start: ZoneTrackerState = createZoneTracker(), t0 = 0) {
  let s = start;
  const statuses: string[] = [];
  paces.forEach((p, i) => {
    s = pushPaceSample(s, t0 + i + 1, p, zone);
    statuses.push(s.status);
  });
  return { s, statuses };
}

describe('smoothed in-zone flag', () => {
  it('no verdict before 5 samples', () => {
    const { statuses } = feed([395, 395, 395, 395]);
    expect(statuses).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
    expect(feed([395, 395, 395, 395, 395]).s.status).toBe('in');
  });
  it('a single GPS spike does not flip the flag (rolling mean)', () => {
    const { s } = feed([395, 395, 395, 395, 395, 395, 395, 395, 330]);
    expect(s.status).toBe('in');
  });
  it('hysteresis: hovering just past the band edge stays "in"', () => {
    const base = feed(Array(15).fill(400)).s;
    const { statuses } = feed(Array(20).fill(413), Z, base, 15); // 3 s past max, inside the 5 s margin
    expect(statuses.every((x) => x === 'in')).toBe(true);
  });
  it('clearly slow for long enough → "slow", then back inside → "in"', () => {
    const base = feed(Array(15).fill(400)).s;
    const slow = feed(Array(15).fill(430), Z, base, 15);
    expect(slow.s.status).toBe('slow');
    const back = feed(Array(15).fill(400), Z, slow.s, 30);
    expect(back.s.status).toBe('in');
  });
  it('from outside, entering requires the band itself (no margin)', () => {
    expect(nextZoneStatus('slow', 413, Z, 5)).toBe('slow');
    expect(nextZoneStatus('slow', 410, Z, 5)).toBe('in');
    expect(nextZoneStatus('in', 374, Z, 5)).toBe('fast');
    expect(nextZoneStatus('in', 376, Z, 5)).toBe('in');
  });
  it('the window is 15 active seconds', () => {
    const { s } = feed(Array(30).fill(395));
    expect(s.samples).toHaveLength(15);
    expect(s.rollingPaceSec).toBe(395);
  });
  it('invalid paces (standing, GPS junk) are dropped, not averaged', () => {
    const { s } = feed([395, 0, Infinity, 5000, 395, 395, 395, 395]);
    expect(s.samples).toHaveLength(5);
    expect(s.status).toBe('in');
  });
  it('without a zone: rolling pace yes, verdict never', () => {
    const { s } = feed(Array(10).fill(395), null);
    expect(s.status).toBe('unknown');
    expect(s.rollingPaceSec).toBe(395);
  });
  it('chip text', () => {
    expect(zoneStatusText('in', 400, Z)).toBe('בטווח · ריצה קלה');
    expect(zoneStatusText('slow', 416.4, Z)).toBe('איטי ב-6 שנ׳');
    expect(zoneStatusText('fast', 370, Z)).toBe('מהיר ב-10 שנ׳');
    expect(zoneStatusText('unknown', 400, Z)).toBe('');
    expect(zoneStatusText('in', 400, null)).toBe('');
  });
});

describe('time in zone', () => {
  it('counts only seconds with a verdict; clamps big jumps', () => {
    let acc = EMPTY_ZONE_TIME;
    acc = accumulateZoneTime(acc, 'unknown', 1);
    acc = accumulateZoneTime(acc, 'in', 1);
    acc = accumulateZoneTime(acc, 'slow', 1);
    acc = accumulateZoneTime(acc, 'in', 60); // frozen tab → 5
    expect(acc).toEqual({ scoredSec: 7, inSec: 6 });
    expect(accumulateZoneTime(acc, 'in', -3)).toBe(acc);
  });
  it('percent appears after 10 scored seconds', () => {
    expect(zoneTimePercent({ scoredSec: 9, inSec: 9 })).toBeNull();
    expect(zoneTimePercent({ scoredSec: 40, inSec: 30 })).toBe(75);
  });
});

describe('swipe pages', () => {
  it('no pace page on legs under 400 m', () => {
    expect(continuousPages(true)).toEqual(['main', 'pace', 'distance']);
    expect(continuousPages(false)).toEqual(['main', 'distance']);
  });
  it('rightward drag = next page (RTL), clamped both ends', () => {
    expect(swipePage(0, 3, 80, 0)).toBe(1);
    expect(swipePage(2, 3, 80, 0)).toBe(2);
    expect(swipePage(1, 3, -80, 0)).toBe(0);
    expect(swipePage(0, 3, -80, 0)).toBe(0);
    expect(swipePage(1, 3, 10, 600)).toBe(2);
    expect(swipePage(1, 3, 20, 0)).toBe(1);
  });
  it('clampPage keeps the page valid when the list shrinks', () => {
    expect(clampPage(2, 2)).toBe(1);
    expect(clampPage(-1, 3)).toBe(0);
  });
});

describe('hero + goal', () => {
  it('hero follows the goal; no goal ⇒ distance', () => {
    expect(heroKind({ type: 'time', target: 2100, current: 0 })).toBe('time');
    expect(heroKind({ type: 'distance', target: 5, current: 0 })).toBe('distance');
    expect(heroKind(null)).toBe('distance');
  });
  it('block goal from a time or distance block', () => {
    expect(blockGoal(easy, 1226, 3420)).toEqual({ type: 'time', target: 2100, current: 1226 });
    expect(blockGoal(blk({ distanceMeters: 5000 }), 10, 1600)).toEqual({ type: 'distance', target: 5, current: 1.6 });
    expect(blockGoal(blk({}), 10, 10)).toBeNull();
  });
  it('goal view (board R2-prop-easy: 35 min, 20:26 done)', () => {
    const v = goalView({ type: 'time', target: 2100, current: 1226 });
    expect(v.targetText).toBe('יעד 35 דק׳');
    expect(v.remainingText).toBe('נותרו 14:34 דק׳');
    expect(v.percent).toBe(58);
    expect(v.done).toBe(false);
  });
  it('distance goal texts + done', () => {
    expect(goalView({ type: 'distance', target: 5, current: 3.42 }).remainingText).toBe('נותרו 1.58 ק״מ');
    expect(goalView({ type: 'distance', target: 5, current: 4.6 }).remainingText).toBe('נותרו 400 מ׳');
    expect(goalView({ type: 'distance', target: 7.5, current: 0 }).targetText).toBe('יעד 7.5 ק״מ');
    const done = goalView({ type: 'time', target: 600, current: 650 });
    expect(done).toMatchObject({ done: true, percent: 100, remainingText: 'הגעת ליעד' });
  });
});

describe('lap rows — no pace under 400 m', () => {
  it('pace only from 400 m', () => {
    expect(legPaceSec(399, 120)).toBeNull();
    expect(legPaceSec(1000, 300)).toBe(300);
    const rows = lapRows([
      { id: '1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 358, isActive: false },
      { id: '2', lapNumber: 2, distanceMeters: 250, durationSeconds: 80, isActive: true },
    ]);
    expect(rows[0]).toMatchObject({ n: 1, distanceText: '1.00', timeText: '5:58', paceText: '5:58', active: false });
    expect(rows[1]).toMatchObject({ n: 2, distanceText: '0.25', paceText: null, active: true });
  });
  it('tolerates junk', () => {
    expect(lapRows(null)).toEqual([]);
    const [r] = lapRows([{ id: 'x', lapNumber: 1, distanceMeters: NaN, durationSeconds: -4, isActive: false }]);
    expect(r).toMatchObject({ distanceText: '0.00', timeText: '0:00', paceText: null });
  });
  it('session average pace', () => {
    expect(avgPaceSec(600, 0.04)).toBe(0);
    expect(avgPaceSec(1200, 4)).toBe(300);
  });
});

describe('v2BlockTextColor', () => {
  it('dark steps for text', async () => {
    const { v2BlockTextColor } = await import('../continuous-run');
    expect(v2BlockTextColor(easy)).toBe('#4d7c0f');
    expect(v2BlockTextColor(blk({ zoneType: 'tempo', durationSeconds: 900 }))).toBe('#c2410c');
    expect(v2BlockTextColor(blk({ type: 'recovery', durationSeconds: 60 }))).toBe('#4b5a66');
  });
});
