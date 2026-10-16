import { describe, it, expect, vi, beforeEach } from 'vitest';

// revokeAllAdminAccess must clear EVERY admin role, remove the user from all
// authorities' managerIds, and never delete the user document or touch the
// member's unit fields (tenantId/unitId). Audit 15.10.2026.

const updates: Array<{ ref: string; data: Record<string, unknown> }> = [];
let userCore: Record<string, unknown> = {};
const managedAuthorities = ['auth-1', 'auth-2'];

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/firestore.service', () => ({ getUserFromFirestore: vi.fn(), saveUserToFirestore: vi.fn() }));
vi.mock('../audit.service', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  query: (c: { name: string }) => c,
  where: () => ({}),
  orderBy: () => ({}),
  getDoc: async () => ({ exists: () => true, data: () => ({ core: userCore }) }),
  getDocs: async () => ({
    size: managedAuthorities.length,
    docs: managedAuthorities.map((id) => ({ id, ref: { path: `authorities/${id}` } })),
  }),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => { updates.push({ ref: ref.path, data }); },
  arrayRemove: (v: string) => ({ __arrayRemove: v }),
  deleteField: () => ({ __delete: true }),
}));

import { revokeAllAdminAccess } from '../admin-management.service';

beforeEach(() => {
  updates.length = 0;
  userCore = {
    name: 'דנה',
    isSuperAdmin: true,
    isSystemAdmin: true,
    role: 'system_admin',
    isVerticalAdmin: true,
    managedVertical: 'military',
    isReadinessChiefOfficer: true,
    isTenantOwner: true,
    allowedSections: ['dev', 'marketing'],
    teamRole: 'עורכת תוכן',
    isApproved: true,
    tenantId: 'mil-1',
    unitId: 'u-1',
  };
});

describe('revokeAllAdminAccess', () => {
  it('clears every admin role on the user doc, and only those', async () => {
    await revokeAllAdminAccess('uid-1', { adminId: 'root', adminName: 'Root' });
    const userUpdate = updates.find((u) => u.ref === 'users/uid-1')!.data;
    expect(userUpdate).toMatchObject({
      'core.isSuperAdmin': false,
      'core.isSystemAdmin': false,
      'core.role': { __delete: true },
      'core.isVerticalAdmin': false,
      'core.managedVertical': { __delete: true },
      'core.isReadinessChiefOfficer': false,
      'core.isTenantOwner': false,
      'core.allowedSections': [],
      'core.teamRole': { __delete: true },
      'core.isApproved': false,
    });
    // unit membership is not an admin role — regular members carry it too
    expect(Object.keys(userUpdate)).not.toContain('core.tenantId');
    expect(Object.keys(userUpdate)).not.toContain('core.unitId');
  });

  it('removes the user from every authority they manage', async () => {
    const r = await revokeAllAdminAccess('uid-1');
    expect(r.authoritiesUpdated).toBe(2);
    const authUpdates = updates.filter((u) => u.ref.startsWith('authorities/'));
    expect(authUpdates.map((u) => u.ref)).toEqual(['authorities/auth-1', 'authorities/auth-2']);
    expect(authUpdates[0].data).toEqual({ managerIds: { __arrayRemove: 'uid-1' } });
  });

  it('does not delete a role field that was never system_admin', async () => {
    userCore.role = 'user';
    await revokeAllAdminAccess('uid-1');
    const userUpdate = updates.find((u) => u.ref === 'users/uid-1')!.data;
    expect(Object.keys(userUpdate)).not.toContain('core.role');
  });
});
