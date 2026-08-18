import { describe, it, expect } from 'vitest';
import * as admin from 'firebase-admin';
import { stripUndefined, buildValidatedDoc, RouteDocValidationError } from '../validate';

describe('stripUndefined', () => {
  it('strips undefined keys from a plain object', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('recurses into nested plain objects', () => {
    expect(stripUndefined({ a: { b: 1, c: undefined } })).toEqual({ a: { b: 1 } });
  });

  it('leaves arrays untouched, including undefined elements inside them', () => {
    const arr = [1, undefined, { x: 1, y: undefined }];
    const result = stripUndefined({ arr });
    expect(result.arr).toBe(arr); // same reference — arrays are never recursed into
  });

  // Regression test for the 17.08.2026 bug (route-enrichment-pipeline plan,
  // Stage 3): stripUndefined used to recurse into ANY object that wasn't an
  // Array or Date, which silently flattened Firestore FieldValue sentinels
  // (zero own enumerable keys) into {} — corrupting 27 official_routes +
  // 18 curated_routes docs' createdAt/updatedAt in production before this
  // was caught.
  it('preserves a real FieldValue.serverTimestamp() sentinel untouched', () => {
    const sentinel = admin.firestore.FieldValue.serverTimestamp();
    const result = stripUndefined({ updatedAt: sentinel });
    expect(result.updatedAt).toBe(sentinel); // same reference, not flattened to {}
  });

  it('preserves a real FieldValue.arrayUnion() sentinel untouched', () => {
    const sentinel = admin.firestore.FieldValue.arrayUnion('x');
    const result = stripUndefined({ tags: sentinel });
    expect(result.tags).toBe(sentinel);
  });

  it('preserves a real GeoPoint untouched', () => {
    const point = new admin.firestore.GeoPoint(32.05, 34.77);
    const result = stripUndefined({ location: point });
    expect(result.location).toBe(point);
  });

  it('still strips undefined siblings next to a preserved sentinel', () => {
    const sentinel = admin.firestore.FieldValue.serverTimestamp();
    const result = stripUndefined({ updatedAt: sentinel, deletedField: undefined, name: 'x' });
    expect(result).toEqual({ updatedAt: sentinel, name: 'x' });
  });
});

describe('buildValidatedDoc — sentinel passthrough (integration)', () => {
  const knownAuthorityIds = new Set(['auth-1']);

  it('a serverTimestamp() sentinel inside the payload survives validation on an UPDATE', () => {
    const sentinel = admin.firestore.FieldValue.serverTimestamp();
    const result = buildValidatedDoc(
      'official_routes',
      { routeShape: 'loop', updatedAt: sentinel },
      { mode: 'update', knownAuthorityIds, existing: {} },
    );
    expect(result.updatedAt).toBe(sentinel);
  });

  it('a CREATE payload with a real authorityId + serverTimestamp() sentinel validates and preserves it', () => {
    const sentinel = admin.firestore.FieldValue.serverTimestamp();
    const result = buildValidatedDoc(
      'official_routes',
      {
        name: 'Test Route', distance: 1000, duration: 600, difficulty: 'easy', type: 'running',
        path: [{ lng: 34.77, lat: 32.05 }, { lng: 34.78, lat: 32.06 }],
        authorityId: 'auth-1', city: 'Test City',
        createdAt: sentinel, updatedAt: sentinel,
      },
      { mode: 'create', knownAuthorityIds },
    );
    expect(result.createdAt).toBe(sentinel);
    expect(result.updatedAt).toBe(sentinel);
  });

  it('still rejects an invalid difficulty even with a sentinel present in the same payload', () => {
    const sentinel = admin.firestore.FieldValue.serverTimestamp();
    expect(() =>
      buildValidatedDoc(
        'official_routes',
        {
          name: 'Test', distance: 1, duration: 1, difficulty: 'moderate', type: 'running',
          path: [{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }],
          authorityId: 'auth-1', city: 'Test City', updatedAt: sentinel,
        },
        { mode: 'create', knownAuthorityIds },
      ),
    ).toThrow(RouteDocValidationError);
  });
});
