import { describe, expect, it } from 'vitest';
import { aerobicCells, aerobicMode, normalizeActivity, routeTitle, showLapButton } from '../aerobic-player-view';

const base = { durationSec: 600, distanceKm: 1.2, routeKm: 4.2, etaSec: 240, paceSec: 330 };
const keys = (mode: Parameters<typeof aerobicCells>[0]['mode'], activity: 'walking' | 'running' | 'cycling') =>
  aerobicCells({ ...base, mode, activity }).map((c) => c.key);

describe('aerobicMode / routeTitle (M26)', () => {
  it('commute = to the start, a named route = route, else free', () => {
    expect(aerobicMode('commute', 'Yarkon')).toBe('toStart');
    expect(aerobicMode('free', 'Yarkon')).toBe('route');
    expect(aerobicMode('free', '  ')).toBe('free');
    expect(aerobicMode(undefined, null)).toBe('free');
  });
  it('a route is titled by its name, never "free run"', () => {
    expect(routeTitle('route', ' Yarkon trail ')).toBe('Yarkon trail');
    expect(routeTitle('free', 'Yarkon')).toBe(null);
    expect(routeTitle('toStart', 'Yarkon')).toBe(null);
  });
});

describe('aerobicCells (board PlayerMetrics)', () => {
  it('to the start: time · arrival · steps (speed when riding)', () => {
    expect(keys('toStart', 'walking')).toEqual(['time', 'arrival', 'steps']);
    expect(keys('toStart', 'running')).toEqual(['time', 'arrival', 'steps']);
    expect(keys('toStart', 'cycling')).toEqual(['time', 'arrival', 'speed']);
  });
  it('on a route: time · km left · steps / pace / speed', () => {
    expect(keys('route', 'walking')).toEqual(['time', 'kmLeft', 'steps']);
    expect(keys('route', 'running')).toEqual(['time', 'kmLeft', 'pace']);
    expect(keys('route', 'cycling')).toEqual(['time', 'kmLeft', 'speed']);
  });
  it('free: time · km · steps / pace / speed', () => {
    expect(keys('free', 'walking')).toEqual(['time', 'km', 'steps']);
    expect(keys('free', 'running')).toEqual(['time', 'km', 'pace']);
  });
  it('values: km left never below 0, steps from distance, unknowns are null', () => {
    const route = aerobicCells({ ...base, mode: 'route', activity: 'walking', distanceKm: 5 });
    expect(route[1].value).toBe(0);
    expect(route[2].value).toBe(6500);
    expect(aerobicCells({ ...base, mode: 'route', activity: 'running', routeKm: null })[1].value).toBe(null);
    expect(aerobicCells({ ...base, mode: 'toStart', activity: 'walking', etaSec: null })[1].value).toBe(null);
    expect(aerobicCells({ ...base, mode: 'free', activity: 'running', paceSec: 0 })[2].value).toBe(null);
  });
});

describe('showLapButton / normalizeActivity', () => {
  it('the lap button is for a free run only', () => {
    expect(showLapButton('free', 'running')).toBe(true);
    expect(showLapButton('free', 'walking')).toBe(false);
    expect(showLapButton('route', 'running')).toBe(false);
    expect(showLapButton('toStart', 'running')).toBe(false);
  });
  it('unknown activity counts as running', () => {
    expect(normalizeActivity('walking')).toBe('walking');
    expect(normalizeActivity(null)).toBe('running');
  });
});
