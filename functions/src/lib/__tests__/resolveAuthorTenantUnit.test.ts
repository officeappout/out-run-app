import { describe, it, expect } from 'vitest';
import { resolveAuthorTenantUnit } from '../resolveAuthorTenantUnit';

/**
 * SPEC-02 SEC-09: onFeedPostCreate used to trust data.tenantId/data.unitId
 * straight off the feed_posts document — client-writable, unverified by
 * firestore.rules (only `authorUid` is constrained there). This proves
 * the replacement always resolves from the author's own protected
 * profile instead, regardless of what the triggering document claims.
 */

function mockReader(docs: Record<string, Record<string, unknown> | undefined>) {
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

describe('resolveAuthorTenantUnit', () => {
  it('resolves the real tenantId/unitId from the users/{uid}.core profile', async () => {
    const db = mockReader({ 'users/u1': { core: { tenantId: 'real-tenant', unitId: 'real-unit' } } });
    expect(await resolveAuthorTenantUnit(db, 'u1')).toEqual({ tenantId: 'real-tenant', unitId: 'real-unit' });
  });

  it('falls back to _global/_all when the user has no profile at all', async () => {
    const db = mockReader({});
    expect(await resolveAuthorTenantUnit(db, 'ghost')).toEqual({ tenantId: '_global', unitId: '_all' });
  });

  it('falls back to _global/_all when core exists but has no tenantId/unitId', async () => {
    const db = mockReader({ 'users/u1': { core: {} } });
    expect(await resolveAuthorTenantUnit(db, 'u1')).toEqual({ tenantId: '_global', unitId: '_all' });
  });

  it("never reads a forged tenantId/unitId — this is the actual SEC-09 fix: the caller cannot pass a document's own claimed tenantId/unitId through this function at all, only a uid to look up server-side", async () => {
    const db = mockReader({ 'users/attacker': { core: { tenantId: 'attackers-real-tenant', unitId: 'attackers-real-unit' } } });
    // No matter what a forged feed_posts.tenantId/unitId might have
    // claimed, this function only ever returns what's on the attacker's
    // OWN profile — there is no parameter through which a document's
    // self-reported tenantId/unitId could influence the result.
    const result = await resolveAuthorTenantUnit(db, 'attacker');
    expect(result).toEqual({ tenantId: 'attackers-real-tenant', unitId: 'attackers-real-unit' });
  });
});
