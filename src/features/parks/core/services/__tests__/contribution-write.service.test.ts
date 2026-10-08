import { describe, it, expect } from 'vitest';
import {
  computeContributionApprove,
  computeContributionReject,
} from '../contribution-write.service';
import type { ParkWriteCaller } from '../park-write.service';

// David's explicit mandate, same as park-write.service.test.ts: these
// tests must prove DENIAL, not just acceptance. Reject goes through the
// SAME scope-authorization core as approve — a write, not the absence of
// one — so it gets the same denial-first treatment, not a lighter check.

interface FakeAuthority {
  id: string;
  type?: string;
  managerIds?: string[];
  boundaryGeoJSON?: string;
}
interface FakePark {
  id: string;
  authorityId?: string | null;
  [key: string]: unknown;
}
interface FakeContribution {
  id: string;
  [key: string]: unknown;
}
interface FakeUser {
  id: string;
  core?: { name?: string };
}

// A simple square around [34.8, 32.0] (lng, lat) — far enough from
// anything else used below that "inside" vs "outside" is unambiguous.
const HAIFA_BOUNDARY = JSON.stringify({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[[34.7, 31.9], [34.9, 31.9], [34.9, 32.1], [34.7, 32.1], [34.7, 31.9]]],
  },
});
const INSIDE_HAIFA = { lat: 32.0, lng: 34.8 };
const OUTSIDE_ANY_BOUNDARY = { lat: 29.5, lng: 34.9 }; // Eilat-ish, no boundary covers it below

function makeFakeDb(seed: {
  authorities?: FakeAuthority[];
  parks?: FakePark[];
  users?: FakeUser[];
  contributions?: FakeContribution[];
}) {
  const authorities = new Map((seed.authorities ?? []).map((a) => [a.id, a]));
  const parks = new Map((seed.parks ?? []).map((p) => [p.id, p]));
  const users = new Map((seed.users ?? []).map((u) => [u.id, u]));
  const contributions = new Map((seed.contributions ?? []).map((c) => [c.id, c]));
  const updates: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  const created: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  let nextId = 1;

  const STORES: Record<string, Map<string, any>> = { authorities, parks, users, user_contributions: contributions };

  function docSnap<T extends { id: string }>(store: Map<string, T>, id: string) {
    const d = store.get(id);
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  }

  function collection(name: string) {
    const store = STORES[name] ?? new Map();
    return {
      doc(id: string) {
        return {
          get: async () => docSnap(store, id),
          update: async (data: Record<string, unknown>) => {
            updates.push({ collection: name, id, data });
            const existing = store.get(id) ?? { id };
            store.set(id, { ...existing, ...data });
          },
        };
      },
      add: async (data: Record<string, unknown>) => {
        const id = `${name}_generated_${nextId++}`;
        created.push({ collection: name, id, data });
        store.set(id, { id, ...data });
        return { id };
      },
      get: async () => ({
        docs: Array.from(store.keys()).map((id) => docSnap(store, id)),
      }),
      where(field: string, op: string, value: unknown) {
        if (field !== 'managerIds' || op !== 'array-contains') throw new Error(`unexpected where: ${field} ${op}`);
        return {
          limit(_n: number) {
            return {
              get: async () => {
                const matches = Array.from(authorities.values()).filter((a) => Array.isArray(a.managerIds) && a.managerIds.includes(value as string));
                return { empty: matches.length === 0, docs: matches.map((a) => docSnap(authorities, a.id)) };
              },
            };
          },
        };
      },
    };
  }

  return { collection, updates, created } as unknown as import('firebase-admin/firestore').Firestore & { updates: typeof updates; created: typeof created };
}

const CTX = { tokenEmail: 'officer@example.com', sourceIp: '203.0.113.1' };
const AM_CALLER: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
const ROOT_CALLER: ParkWriteCaller = { kind: 'root', uid: 'root-uid' };

describe('computeContributionApprove', () => {
  it('denied caller → 403, nothing read or written', async () => {
    const db = makeFakeDb({ contributions: [{ id: 'c1', type: 'report', status: 'pending' }] });
    const result = await computeContributionApprove(db, { kind: 'denied' }, 'c1', {}, CTX);
    expect(result.status).toBe(403);
    expect(db.updates.length).toBe(0);
  });

  it('contribution not found → 404', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }] });
    const result = await computeContributionApprove(db, AM_CALLER, 'no-such-contribution', {}, CTX);
    expect(result.status).toBe(404);
  });

  describe('suggest_edit — scope via linkedParkId → park.authorityId', () => {
    it('authority_manager, linked park belongs to a DIFFERENT authority → 403, nothing written', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        parks: [{ id: 'park-1', authorityId: 'city-tel-aviv', name: 'TLV Park' }],
        contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1', editDiff: { name: 'Hijacked' } }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(403);
      expect(db.updates.length).toBe(0);
    });

    it('authority_manager, linkedParkId does not resolve to a real park → 403 (undetermined, not assumed)', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'no-such-park', editDiff: { name: 'X' } }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(403);
      expect(db.updates.length).toBe(0);
    });

    it('authority_manager, linked park matches own authority → 200, park updated via the REAL chokepoint (allowlist applies), contribution marked approved', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
        contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', userId: 'citizen-1', linkedParkId: 'park-1', editDiff: { name: 'Citizen-Suggested Name' } }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      const parkUpdate = db.updates.find((u) => u.collection === 'parks' && u.id === 'park-1');
      expect(parkUpdate?.data.name).toBe('Citizen-Suggested Name');
      const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
      expect(contribUpdate?.data.status).toBe('approved');
    });

    // The exact finding (00-MASTER-PLAN.md §13.58, finding 4) this chokepoint
    // closes: editDiff used to be applied RAW via the old updatePark, no
    // allowlist at all. Now it goes through computeParkUpdate — same gate
    // as an admin typing in LocationEditor.tsx.
    it('editDiff contains a field NOT in the allowlist (e.g. rating) → 400, NOTHING written, not even the allowed fields in the same diff', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
        contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1', editDiff: { name: 'New Name', rating: 5 } }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(400);
      expect(db.updates.length).toBe(0);
    });

    it('editDiff contains authorityId (a citizen trying to reassign the park via their edit suggestion) → silently dropped, never written', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
        contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1', editDiff: { name: 'New Name', authorityId: 'city-tel-aviv' } }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      const parkUpdate = db.updates.find((u) => u.collection === 'parks' && u.id === 'park-1');
      expect(parkUpdate?.data.name).toBe('New Name');
      expect(Object.prototype.hasOwnProperty.call(parkUpdate?.data ?? {}, 'authorityId')).toBe(false);
    });
  });

  describe('review — same linkedParkId scope rule as suggest_edit, but no park write', () => {
    it('authority_manager, linked park matches own authority → 200, contribution approved, NO park write of any kind', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Park' }],
        contributions: [{ id: 'c1', type: 'review', status: 'pending', linkedParkId: 'park-1', rating: 4 }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      expect(db.updates.find((u) => u.collection === 'parks')).toBeUndefined();
      const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
      expect(contribUpdate?.data.status).toBe('approved');
    });

    it('authority_manager, linked park belongs to a different authority → 403', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
        parks: [{ id: 'park-1', authorityId: 'city-tel-aviv', name: 'Park' }],
        contributions: [{ id: 'c1', type: 'review', status: 'pending', linkedParkId: 'park-1', rating: 4 }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(403);
    });
  });

  describe('new_location / report — scope via geo-resolution, deny when undetermined', () => {
    it('authority_manager, point resolves to a DIFFERENT authority than their own → 403', async () => {
      const db = makeFakeDb({
        authorities: [
          { id: 'city-haifa', managerIds: ['am-uid'] },
          { id: 'city-other', type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY }, // the OTHER city owns the boundary the point falls in
        ],
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: INSIDE_HAIFA, parkName: 'New Spot' }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(403);
      expect(db.created.find((c) => c.collection === 'parks')).toBeUndefined();
    });

    it('authority_manager, point resolves to NO authority at all (no boundary covers it) → 403, undetermined is a denial not a guess', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'], type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY }],
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: OUTSIDE_ANY_BOUNDARY, parkName: 'New Spot' }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(403);
      expect(db.created.find((c) => c.collection === 'parks')).toBeUndefined();
    });

    it('authority_manager, point resolves to their OWN authority → 200, park created through computeParkCreate, contribution approved with approvedParkId', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'], type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY }],
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: INSIDE_HAIFA, parkName: 'New Spot', facilityType: 'calisthenics' }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      expect(result.body.approvedParkId).toBeDefined();
      const createdPark = db.created.find((c) => c.collection === 'parks' && c.id === result.body.approvedParkId);
      expect(createdPark?.data.authorityId).toBe('city-haifa');
      expect(createdPark?.data.name).toBe('New Spot');
      const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
      expect(contribUpdate?.data.approvedParkId).toBe(result.body.approvedParkId);
      expect(contribUpdate?.data.status).toBe('approved');
    });

    it('report type, authority_manager\'s own authority resolves → 200, contribution approved, NO park created (report never creates an entity)', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', managerIds: ['am-uid'], type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY }],
        contributions: [{ id: 'c1', type: 'report', status: 'pending', userId: 'citizen-1', location: INSIDE_HAIFA, issueType: 'broken_equipment' }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      expect(db.created.find((c) => c.collection === 'parks')).toBeUndefined();
      const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
      expect(contribUpdate?.data.status).toBe('approved');
    });

    it('root, new_location, point does not resolve and no explicit authorityId override → 200, flag-and-create fallback (08.10.2026 fix, restores commit 0979cf2a — never 400 here)', async () => {
      const db = makeFakeDb({
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: OUTSIDE_ANY_BOUNDARY, parkName: 'New Spot' }],
      });
      const result = await computeContributionApprove(db, ROOT_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      expect(result.body.approvedParkId).toBeDefined();
      const createdPark = db.created.find((c) => c.collection === 'parks' && c.id === result.body.approvedParkId);
      expect(createdPark?.data.authorityId).toBeNull();
      expect(createdPark?.data.needsAuthorityTagging).toBe(true);
      const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
      expect(contribUpdate?.data.status).toBe('approved');
      expect(contribUpdate?.data.approvedParkId).toBe(result.body.approvedParkId);
    });

    it('root, new_location, point DOES resolve and no explicit override → 200, the SAME geo-resolution used to authorize the approval is reused as the park\'s authorityId, needsAuthorityTagging false', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa', type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY }],
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: INSIDE_HAIFA, parkName: 'New Spot' }],
      });
      const result = await computeContributionApprove(db, ROOT_CALLER, 'c1', {}, CTX);
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      const createdPark = db.created.find((c) => c.collection === 'parks' && c.id === result.body.approvedParkId);
      expect(createdPark?.data.authorityId).toBe('city-haifa');
      expect(createdPark?.data.needsAuthorityTagging).toBe(false);
    });

    it('root, new_location, explicit authorityId override in the request body → 200, used regardless of geo-resolution', async () => {
      const db = makeFakeDb({
        authorities: [{ id: 'city-haifa' }],
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: OUTSIDE_ANY_BOUNDARY, parkName: 'New Spot' }],
      });
      const result = await computeContributionApprove(db, ROOT_CALLER, 'c1', { authorityId: 'city-haifa' }, CTX);
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      const createdPark = db.created.find((c) => c.collection === 'parks' && c.id === result.body.approvedParkId);
      expect(createdPark?.data.authorityId).toBe('city-haifa');
    });

    it('authority_manager cannot override via the request body — authorityId in the approve body is read ONLY for root, ignored here', async () => {
      const db = makeFakeDb({
        authorities: [
          { id: 'city-haifa', managerIds: ['am-uid'], type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY },
          { id: 'city-other' },
        ],
        contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: INSIDE_HAIFA, parkName: 'New Spot' }],
      });
      const result = await computeContributionApprove(db, AM_CALLER, 'c1', { authorityId: 'city-other' }, CTX);
      expect(result.status).toBe(200);
      if (result.status !== 200) return;
      const createdPark = db.created.find((c) => c.collection === 'parks' && c.id === result.body.approvedParkId);
      expect(createdPark?.data.authorityId).toBe('city-haifa'); // their OWN scope, not 'city-other' from the body
    });
  });

  it('root bypasses scope-matching entirely — approves a suggest_edit whose linked park belongs to an undetermined/unrelated authority', async () => {
    const db = makeFakeDb({
      parks: [{ id: 'park-1', authorityId: 'city-anyone', name: 'Old Name' }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1', editDiff: { name: 'Root Approved' } }],
    });
    const result = await computeContributionApprove(db, ROOT_CALLER, 'c1', {}, CTX);
    expect(result.status).toBe(200);
    const parkUpdate = db.updates.find((u) => u.collection === 'parks' && u.id === 'park-1');
    expect(parkUpdate?.data.name).toBe('Root Approved');
  });

  it('extraneous/forged fields in the approve request body (xpAwarded, approvedParkId) have zero effect — only authorityId (root-only) is ever read from it', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
      contributions: [{ id: 'c1', type: 'review', status: 'pending', linkedParkId: 'park-1' }],
    });
    const result = await computeContributionApprove(db, AM_CALLER, 'c1', { xpAwarded: 999999, approvedParkId: 'fake-park-id', status: 'definitely-not-approved' }, CTX);
    expect(result.status).toBe(200);
    const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
    expect(contribUpdate?.data.status).toBe('approved'); // the real status, not the forged one
    expect(contribUpdate?.data.xpAwarded).toBeUndefined(); // XP is never set by this chokepoint at all
  });

  it('XP is never awarded by this chokepoint (deliberate, David\'s decision) — approve never sets xpAwarded, and never crashes because of it', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'], type: 'city', boundaryGeoJSON: HAIFA_BOUNDARY }],
      contributions: [{ id: 'c1', type: 'new_location', status: 'pending', userId: 'citizen-1', location: INSIDE_HAIFA, parkName: 'New Spot' }],
    });
    const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
    expect(result.status).toBe(200);
    const contribUpdate = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
    expect(contribUpdate?.data.xpAwarded).toBeUndefined();
  });

  it('a successful approve writes an audit_logs row in the SAME call, targetEntity Contribution (in ADDITION to computeParkUpdate\'s own Park-entity row — two real things happened)', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
      users: [{ id: 'am-uid', core: { name: 'Officer Cohen' } }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1', editDiff: { name: 'New Name' } }],
    });
    const result = await computeContributionApprove(db, AM_CALLER, 'c1', {}, CTX);
    expect(result.status).toBe(200);
    const parkAuditRow = db.created.find((c) => c.collection === 'audit_logs' && c.data.targetEntity === 'Park');
    expect(parkAuditRow?.data.actionType).toBe('UPDATE'); // computeParkUpdate's own audit row, unchanged behavior
    const contributionAuditRow = db.created.find((c) => c.collection === 'audit_logs' && c.data.targetEntity === 'Contribution');
    expect(contributionAuditRow).toBeDefined();
    expect(contributionAuditRow?.data.actionType).toBe('APPROVE');
    expect(contributionAuditRow?.data.adminId).toBe('am-uid');
    expect(contributionAuditRow?.data.adminName).toBe('Officer Cohen');
  });
});

describe('computeContributionReject — the same core compute as approve, not a lighter check', () => {
  it('denied caller → 403', async () => {
    const db = makeFakeDb({ contributions: [{ id: 'c1', type: 'report', status: 'pending' }] });
    const result = await computeContributionReject(db, { kind: 'denied' }, 'c1', {}, CTX);
    expect(result.status).toBe(403);
    expect(db.updates.length).toBe(0);
  });

  it('contribution not found → 404', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }] });
    const result = await computeContributionReject(db, AM_CALLER, 'no-such-contribution', {}, CTX);
    expect(result.status).toBe(404);
  });

  it('authority_manager rejecting a contribution scoped to a DIFFERENT authority → 403, nothing written', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-tel-aviv' }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1' }],
    });
    const result = await computeContributionReject(db, AM_CALLER, 'c1', { reason: 'not mine' }, CTX);
    expect(result.status).toBe(403);
    expect(db.updates.length).toBe(0);
  });

  it('authority_manager, scope undetermined (linked park missing) → 403, denial not a guess', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'no-such-park' }],
    });
    const result = await computeContributionReject(db, AM_CALLER, 'c1', {}, CTX);
    expect(result.status).toBe(403);
  });

  it('authority_manager rejecting within their own scope → 200, a REAL write (status + reason + reviewer), not a no-op', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa' }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1' }],
    });
    const result = await computeContributionReject(db, AM_CALLER, 'c1', { reason: 'לא מתאים' }, CTX);
    expect(result.status).toBe(200);
    const update = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
    expect(update?.data.status).toBe('rejected');
    expect(update?.data.rejectionReason).toBe('לא מתאים');
    expect(update?.data.reviewedBy).toBe('am-uid');
  });

  it('root rejects regardless of determinability', async () => {
    const db = makeFakeDb({
      contributions: [{ id: 'c1', type: 'report', status: 'pending', location: OUTSIDE_ANY_BOUNDARY }],
    });
    const result = await computeContributionReject(db, ROOT_CALLER, 'c1', {}, CTX);
    expect(result.status).toBe(200);
  });

  it('an extraneous body field (e.g. status: approved) cannot flip the outcome — reject always writes status: rejected', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa' }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1' }],
    });
    const result = await computeContributionReject(db, AM_CALLER, 'c1', { status: 'approved', reason: 'x' }, CTX);
    expect(result.status).toBe(200);
    const update = db.updates.find((u) => u.collection === 'user_contributions' && u.id === 'c1');
    expect(update?.data.status).toBe('rejected');
  });

  it('a successful reject writes an audit_logs row in the SAME call, targetEntity Contribution, actionType REJECT', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa' }],
      users: [{ id: 'am-uid', core: { name: 'Officer Cohen' } }],
      contributions: [{ id: 'c1', type: 'suggest_edit', status: 'pending', linkedParkId: 'park-1' }],
    });
    const result = await computeContributionReject(db, AM_CALLER, 'c1', { reason: 'spam' }, CTX);
    expect(result.status).toBe(200);
    const auditRow = db.created.find((c) => c.collection === 'audit_logs');
    expect(auditRow).toBeDefined();
    expect(auditRow?.data.actionType).toBe('REJECT');
    expect(auditRow?.data.targetEntity).toBe('Contribution');
  });
});
