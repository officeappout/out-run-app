import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  approachBudgetMs, decideActiveApproach, MIN_APPROACH_MS, type ActiveApproachInput,
} from '../walk-approach';

/** Active-run-map fix (17.10.2026): the walk-to-route line after Play. */

const base: ActiveApproachInput = {
  hasCache: true,
  hasLine: true,
  fetchAttempted: false,
  alreadyDone: false,
  elapsedMs: 5_000,
  walkMinutes: 6,
  distToTargetM: 400,
  distToRouteM: 400,
  arrivalRadiusM: 30,
};

describe('approachBudgetMs', () => {
  it('is 2 × the walk time', () => {
    expect(approachBudgetMs(6)).toBe(12 * 60_000);
  });
  it('never drops below the old 60 s floor', () => {
    expect(approachBudgetMs(0.2)).toBe(MIN_APPROACH_MS);
    expect(MIN_APPROACH_MS).toBe(60_000);
  });
  it('unknown / bad walk time → the 60 s floor', () => {
    expect(approachBudgetMs(null)).toBe(MIN_APPROACH_MS);
    expect(approachBudgetMs(undefined)).toBe(MIN_APPROACH_MS);
    expect(approachBudgetMs(NaN)).toBe(MIN_APPROACH_MS);
    expect(approachBudgetMs(-3)).toBe(MIN_APPROACH_MS);
  });
});

describe('decideActiveApproach', () => {
  it('fresh instance after Play (free_run remount): no cache, never tried → fetch', () => {
    expect(decideActiveApproach({ ...base, hasCache: false, hasLine: false })).toBe('fetch');
  });
  it('fetch in flight / failed → nothing drawn, no second fetch', () => {
    expect(decideActiveApproach({ ...base, hasCache: false, hasLine: false, fetchAttempted: true })).toBe('none');
  });
  it('gated result (walk too long) → nothing drawn', () => {
    expect(decideActiveApproach({ ...base, hasLine: false })).toBe('none');
  });
  it('line still useful → keep (well past the old 60 s cut-off)', () => {
    expect(decideActiveApproach({ ...base, elapsedMs: 3 * 60_000 })).toBe('keep');
  });
  it('budget exhausted → timeout', () => {
    expect(decideActiveApproach({ ...base, elapsedMs: 12 * 60_000 + 1 })).toBe('timeout');
  });
  it('within the arrival radius of the target → arrived', () => {
    expect(decideActiveApproach({ ...base, distToTargetM: 20 })).toBe('arrived');
  });
  it('on the route line anywhere (joined elsewhere / started on it) → arrived, even before any fetch', () => {
    expect(decideActiveApproach({ ...base, distToRouteM: 12 })).toBe('arrived');
    expect(decideActiveApproach({ ...base, hasCache: false, hasLine: false, distToRouteM: 12 })).toBe('arrived');
  });
  it('once done it stays done', () => {
    expect(decideActiveApproach({ ...base, alreadyDone: true, distToTargetM: 900, distToRouteM: null })).toBe('arrived');
  });
});

describe('useWalkToRoute.ts wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../../hooks/useWalkToRoute.ts', import.meta.url)), 'utf8');
  it('the active branch goes through decideActiveApproach and can fetch', () => {
    expect(src).toContain('const decision = decideActiveApproach({');
    expect(src).toContain("case 'fetch':");
    expect(src).toContain('void runFetch(userLat, userLng, routeId, path!);');
  });
  it('no longer clears unconditionally when the cache is empty during a workout', () => {
    expect(src).not.toContain('if (!routeId || !cacheRef.current.has(routeId)) {');
    expect(src).not.toContain('MAX_APPROACH_MS');
  });
});
