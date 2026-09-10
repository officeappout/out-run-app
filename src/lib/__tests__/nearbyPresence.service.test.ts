import { describe, it, expect, vi } from 'vitest';

/**
 * SPEC-04 Wave A test #3 — "a query without a distance condition must be
 * rejected or bounded, never returning the whole world."
 *
 * The historical bug (usePresenceStore.ts / usePresenceLayer.ts /
 * useGroupPresence.ts / usePartnerData.ts, pre-SPEC-04): each had its own
 * copy of `where('mode','==','verified_global'), limit(200)` with no
 * geospatial bound at all — a Haifa user's query could return 200 arbitrary
 * docs from anywhere on Earth. subscribeToNearbyPresence() is now the single
 * chokepoint every one of those callers routes through; this file proves it
 * can't be called in a way that reaches Firestore unbounded.
 */

const calls = vi.hoisted(() => ({ constraints: [] as unknown[][] }));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('./firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  query: vi.fn((_col: unknown, ...constraints: unknown[]) => {
    calls.constraints.push(constraints);
    return { __constraints: constraints };
  }),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
  orderBy: vi.fn((field: string) => ({ __type: 'orderBy', field })),
  startAt: vi.fn((value: unknown) => ({ __type: 'startAt', value })),
  endAt: vi.fn((value: unknown) => ({ __type: 'endAt', value })),
  limit: vi.fn((n: number) => ({ __type: 'limit', value: n })),
  onSnapshot: vi.fn(() => () => {}),
}));

import { subscribeToNearbyPresence } from '../nearbyPresence.service';

const VALID_CENTER = { lat: 32.08, lng: 34.78 };

describe('subscribeToNearbyPresence — SPEC-04 Wave A test #3 (no unbounded query)', () => {
  it('throws rather than building a query when radiusKm is missing/zero/negative/NaN', () => {
    for (const badRadius of [undefined, 0, -5, NaN] as unknown as number[]) {
      expect(() =>
        subscribeToNearbyPresence(
          { center: VALID_CENTER, radiusKm: badRadius, ageGroup: 'adult' },
          () => {},
        ),
      ).toThrow(/radius/i);
    }
  });

  it('throws rather than building a query when center is missing or non-finite', () => {
    const badCenters = [undefined, { lat: NaN, lng: 34.78 }, { lat: 32.08, lng: undefined }];
    for (const badCenter of badCenters as any[]) {
      expect(() =>
        subscribeToNearbyPresence(
          { center: badCenter, radiusKm: 15, ageGroup: 'adult' },
          () => {},
        ),
      ).toThrow(/center/i);
    }
  });

  it('throws rather than building a query when ageGroup is missing — never an age-unbounded query either', () => {
    expect(() =>
      subscribeToNearbyPresence(
        { center: VALID_CENTER, radiusKm: 15, ageGroup: undefined as any },
        () => {},
      ),
    ).toThrow(/ageGroup/i);
  });

  it('every constructed query includes a geohash range (orderBy + startAt + endAt) — never a bare mode/ageGroup scan', () => {
    calls.constraints.length = 0;
    subscribeToNearbyPresence({ center: VALID_CENTER, radiusKm: 15, ageGroup: 'adult' }, () => {});

    expect(calls.constraints.length).toBeGreaterThan(0);
    for (const constraintList of calls.constraints) {
      const types = constraintList.map((c: any) => c.__type ?? c.field);
      expect(types).toContain('orderBy');
      expect(types).toContain('startAt');
      expect(types).toContain('endAt');
      expect(types).toContain('limit');
      const whereFields = constraintList.filter((c: any) => c.__type === 'where').map((c: any) => c.field);
      expect(whereFields).toContain('mode');
      expect(whereFields).toContain('ageGroup');
    }
  });

  it('a valid call succeeds and returns an unsubscribe function', () => {
    const unsub = subscribeToNearbyPresence({ center: VALID_CENTER, radiusKm: 15, ageGroup: 'minor' }, () => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
