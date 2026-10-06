import { describe, it, expect } from 'vitest';
import { resolveSuperAdminAuthorityTarget } from '../resolveSuperAdminAuthorityTarget';

const MUNICIPAL_FIRST = { id: 'ofakim', name: 'אופקים' };
const MUNICIPAL_SECOND = { id: 'tel-aviv', name: 'תל אביב' };
const BRIGADE = { id: 'brigade-1', name: 'חטיבה 1' };
const ALL_AUTHS = [MUNICIPAL_FIRST, MUNICIPAL_SECOND]; // the topLevelOnly-filtered list — a military brigade (no parentAuthorityId field at all) never appears here

describe('resolveSuperAdminAuthorityTarget (06.10.2026, David\'s bug report)', () => {
  it('no saved id at all → allAuths[0] (the pre-existing, unrelated default)', () => {
    expect(resolveSuperAdminAuthorityTarget(ALL_AUTHS, null, null)).toBe(MUNICIPAL_FIRST);
  });

  it('saved id IS in the (filtered) list → that one, never allAuths[0]', () => {
    expect(resolveSuperAdminAuthorityTarget(ALL_AUTHS, 'tel-aviv', null)).toBe(MUNICIPAL_SECOND);
  });

  it('THE BUG: saved id is a brigade — absent from the topLevelOnly-filtered list, but a direct lookup found it → the brigade, never allAuths[0]', () => {
    expect(resolveSuperAdminAuthorityTarget(ALL_AUTHS, 'brigade-1', BRIGADE)).toBe(BRIGADE);
  });

  it('saved id not in the list AND the direct lookup also found nothing (e.g. a deleted authority) → falls back to allAuths[0], not undefined', () => {
    expect(resolveSuperAdminAuthorityTarget(ALL_AUTHS, 'deleted-id', null)).toBe(MUNICIPAL_FIRST);
  });

  it('empty allAuths, no saved id → undefined (no authority exists to default to)', () => {
    expect(resolveSuperAdminAuthorityTarget([], null, null)).toBeUndefined();
  });
});
