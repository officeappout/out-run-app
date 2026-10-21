/**
 * resolveAuthorityManagerScope(…, requestedAuthorityId) — PR 5: a manager of several
 * authorities gets the one on screen; a requested id they don't manage never widens access.
 */
import { describe, expect, it } from 'vitest';
import { makeFakeAdminDb } from './helpers/fake-admin-db';
import { resolveAuthorityManagerScope } from '../authorityManagerScope';

const seed = {
  'authorities/demo-b7': { managerIds: ['viewer'] },
  'authorities/demo-tlv': { managerIds: ['viewer'] },
  'authorities/sderot': { managerIds: ['mayor'] },
};

describe('resolveAuthorityManagerScope — requested authority', () => {
  it('honours the requested authority when the uid manages it', async () => {
    const { db } = makeFakeAdminDb(seed);
    await expect(resolveAuthorityManagerScope(db, 'viewer', 'demo-tlv')).resolves.toEqual({ authorityId: 'demo-tlv' });
  });
  it('ignores a requested authority the uid does not manage (falls back to their own)', async () => {
    const { db } = makeFakeAdminDb(seed);
    await expect(resolveAuthorityManagerScope(db, 'mayor', 'demo-tlv')).resolves.toEqual({ authorityId: 'sderot' });
    await expect(resolveAuthorityManagerScope(db, 'nobody', 'sderot')).resolves.toBeNull();
  });
  it('no / malformed request ⇒ the prior behaviour', async () => {
    const { db } = makeFakeAdminDb(seed);
    await expect(resolveAuthorityManagerScope(db, 'mayor')).resolves.toEqual({ authorityId: 'sderot' });
    await expect(resolveAuthorityManagerScope(db, 'mayor', 'a/b')).resolves.toEqual({ authorityId: 'sderot' });
  });
});
