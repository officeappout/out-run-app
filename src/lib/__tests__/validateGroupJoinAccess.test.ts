import { describe, it, expect } from 'vitest';
import { validateDirectGroupJoin, type DocReader } from '../validateGroupJoinAccess';

/**
 * SPEC-02 (SEC-13 / SPEC-1 t3): /api/social/group-membership used to call
 * joinEngine's 'direct' target with zero validation — any authenticated
 * caller could join ANY group by id, bypassing the invite code, the
 * isLocked gate, and the reserve-persona gate. These tests prove the
 * extracted validation function actually enforces what the route now
 * relies on it for — a mocked reader instead of a real emulator, since
 * this is pure logic with no Firestore-specific behavior to verify.
 */

function mockReader(docs: Record<string, Record<string, unknown> | undefined>): DocReader {
  return {
    doc(path: string) {
      return {
        async get() {
          const data = docs[path];
          return { exists: data !== undefined, data: () => data };
        },
      };
    },
  };
}

describe('validateDirectGroupJoin', () => {
  it('denies joining a group that does not exist', async () => {
    const db = mockReader({});
    const result = await validateDirectGroupJoin(db, 'ghost_group', 'u1');
    expect(result).toEqual({ ok: false, error: 'group-not-found' });
  });

  it('denies joining an inactive group', async () => {
    const db = mockReader({
      'community_groups/g1': { isActive: false, isPublic: true },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1');
    expect(result).toEqual({ ok: false, error: 'group-inactive' });
  });

  it('allows joining a public group with no code needed', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: true, createdBy: 'owner' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1');
    expect(result).toEqual({ ok: true });
  });

  it('allows the creator to join their own private group with no code', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: false, createdBy: 'u1' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1');
    expect(result).toEqual({ ok: true });
  });

  it('denies joining a private group with no code at all — this is the actual SEC-13/t3 exploit: was previously ALLOWED unconditionally', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: false, createdBy: 'owner' },
      'community_groups/g1/private/invite': { code: 'REALCODE' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'attacker');
    expect(result).toEqual({ ok: false, error: 'invalid-code' });
  });

  it('denies joining a private group with the WRONG code', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: false, createdBy: 'owner' },
      'community_groups/g1/private/invite': { code: 'REALCODE' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1', 'WRONGCODE');
    expect(result).toEqual({ ok: false, error: 'invalid-code' });
  });

  it('allows joining a private group with the CORRECT code (case-insensitive)', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: false, createdBy: 'owner' },
      'community_groups/g1/private/invite': { code: 'REALCODE' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1', 'realcode');
    expect(result).toEqual({ ok: true });
  });

  it('denies joining an isLocked institutional group with no code (same mechanism as a plain private group)', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: false, isLocked: true, createdBy: 'owner' },
      'community_groups/g1/private/invite': { code: 'INSTCODE' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'attacker');
    expect(result).toEqual({ ok: false, error: 'invalid-code' });
  });

  it('denies joining a reserve/persona-gated group without a matching declaration — this is the actual SEC-13/t3 exploit for the persona gate: was previously bypassed unconditionally', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: true, createdBy: 'owner' },
      'community_groups_reserve/g1': { parkId: 'p1' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'attacker');
    expect(result).toEqual({ ok: false, error: 'persona-mismatch' });
  });

  it('denies a "regular" (non-reserve) persona from joining a reserve-gated group', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: true, createdBy: 'owner' },
      'community_groups_reserve/g1': { parkId: 'p1' },
      'military_declarations/u1': { status: 'regular' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1');
    expect(result).toEqual({ ok: false, error: 'persona-mismatch' });
  });

  it('allows a genuinely declared reservist to join a reserve-gated group', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: true, createdBy: 'owner' },
      'community_groups_reserve/g1': { parkId: 'p1' },
      'military_declarations/u1': { status: 'reserve' },
    });
    const result = await validateDirectGroupJoin(db, 'g1', 'u1');
    expect(result).toEqual({ ok: true });
  });

  it('requires BOTH the code and the persona declaration for a private, reserve-gated, locked group', async () => {
    const db = mockReader({
      'community_groups/g1': { isPublic: false, isLocked: true, createdBy: 'owner' },
      'community_groups/g1/private/invite': { code: 'BOTHNEEDED' },
      'community_groups_reserve/g1': { parkId: 'p1' },
      'military_declarations/u1': { status: 'reserve' },
    });
    // Right code, right persona -> ALLOW
    expect(await validateDirectGroupJoin(db, 'g1', 'u1', 'BOTHNEEDED')).toEqual({ ok: true });
    // Right code, wrong persona -> DENY
    const dbWrongPersona = mockReader({
      'community_groups/g1': { isPublic: false, isLocked: true, createdBy: 'owner' },
      'community_groups/g1/private/invite': { code: 'BOTHNEEDED' },
      'community_groups_reserve/g1': { parkId: 'p1' },
      'military_declarations/u2': { status: 'regular' },
    });
    expect(await validateDirectGroupJoin(dbWrongPersona, 'g1', 'u2', 'BOTHNEEDED')).toEqual({ ok: false, error: 'persona-mismatch' });
  });
});
