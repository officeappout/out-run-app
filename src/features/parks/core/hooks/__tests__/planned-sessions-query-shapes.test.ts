/**
 * planned_sessions query-shape validity (write-layer-4 audit, 11.10.2026).
 *
 * usePartnerData.ts and useCommunityEnrichment.ts's 3 planned_sessions
 * listeners were each split from one unscoped query into public/own/squad
 * slices (see those files' own comments) so a per-document rule — held
 * separately, not part of this commit — is provable for `list`. This file
 * does NOT render the React hooks (this project's vitest config is
 * node-env only, no jsdom/component tests) — it constructs the EXACT same
 * query() shapes those hooks execute and runs them directly against a
 * real Firestore emulator, security rules disabled, to prove:
 *   1. Every shape is a structurally valid query — specifically, that no
 *      slice combines two `in`-type clauses in one query (Firestore
 *      rejects that client-side before even reaching the server; this is
 *      exactly the mistake the squad slice's design had to route around
 *      by dropping the routeId/parkId/status filter from that one query
 *      and re-applying it after fetch instead).
 *   2. Each slice returns exactly the documents it's supposed to, given a
 *      realistic mixed fixture (public/own/squad/ghost/other-group docs
 *      all seeded together) — proving the split didn't silently narrow or
 *      widen what a legitimate caller sees.
 *
 * Authorization correctness under the NEW rule is NOT this file's job —
 * that lives in the held, separate rules-test file paired with the rule
 * change itself. withSecurityRulesDisabled() is used throughout here on
 * purpose: this file is about query SHAPE, not about who's allowed to run it.
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

const PROJECT_ID = 'appout-1-audit-test';
let env: RulesTestEnvironment;

const FUTURE = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    // Rules content is irrelevant here — every write below goes through
    // withSecurityRulesDisabled(), and every read uses an authenticated
    // context against a deliberately permissive stub so ONLY query shape
    // (not authorization) is under test.
    firestore: {
      rules: `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /planned_sessions/{docId} {
              allow read, write: if request.auth != null;
            }
          }
        }
      `,
      host: '127.0.0.1',
      port: 8089,
    },
  });
}, 20_000);

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const { setDoc, doc } = await import('firebase/firestore');

    const base = { status: 'planned', expiresAt: FUTURE };

    // Public (verified_global), from another user — should appear in the public slice.
    await setDoc(doc(db, 'planned_sessions', 'pubOther'), {
      ...base, userId: 'otherUid', privacyMode: 'verified_global',
      routeId: 'route1', parkId: null, groupId: null,
    });
    // Own, ghost mode — should appear ONLY in the "own" slice, never public/squad.
    await setDoc(doc(db, 'planned_sessions', 'ownGhost'), {
      ...base, userId: 'meUid', privacyMode: 'ghost',
      routeId: 'route1', parkId: null, groupId: null,
    });
    // Squad, for a group the caller IS in — should appear in the squad slice.
    await setDoc(doc(db, 'planned_sessions', 'squadMine'), {
      ...base, userId: 'otherUid', privacyMode: 'squad',
      routeId: 'route1', parkId: null, groupId: 'myGroup',
    });
    // Squad, for a group the caller is NOT in — must never appear in any slice this test runs.
    await setDoc(doc(db, 'planned_sessions', 'squadOther'), {
      ...base, userId: 'otherUid', privacyMode: 'squad',
      routeId: 'route1', parkId: null, groupId: 'notMyGroup',
    });
    // Park-scoped public entry, for the park-listener shapes.
    await setDoc(doc(db, 'planned_sessions', 'pubPark'), {
      ...base, userId: 'otherUid', privacyMode: 'verified_global',
      routeId: null, parkId: 'park1', groupId: null,
    });
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

describe('usePartnerData.ts — Partner Hub slices (no route/park scope)', () => {
  it('[public] privacyMode==verified_global + status in [...] + expiresAt>= — valid shape, returns only the public doc', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'verified_global'),
      where('status', 'in', ['planned', 'active']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id).sort()).toEqual(['pubOther', 'pubPark']);
  });

  it('[own] userId==me + status in [...] + expiresAt>= — valid shape, returns only my own doc regardless of its privacyMode', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('userId', '==', 'meUid'),
      where('status', 'in', ['planned', 'active']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id)).toEqual(['ownGhost']);
  });

  it('[squad] privacyMode==squad + groupId in [...] + expiresAt>= — valid shape (no second `in` clause), returns only the doc for a group I\'m in', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'squad'),
      where('groupId', 'in', ['myGroup']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id)).toEqual(['squadMine']);
  });
});

describe('useCommunityEnrichment.ts — route-scoped slices', () => {
  it('[public] routeId in [...] + privacyMode==verified_global + expiresAt>= — valid shape', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('routeId', 'in', ['route1']),
      where('privacyMode', '==', 'verified_global'),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id)).toEqual(['pubOther']);
  });

  it('[own] routeId in [...] + userId==me + expiresAt>= — valid shape', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('routeId', 'in', ['route1']),
      where('userId', '==', 'meUid'),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id)).toEqual(['ownGhost']);
  });

  it('[squad] same shared shape as the Partner Hub squad slice — the route listener then filters routeId client-side (proven here by re-checking the field directly on the result)', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'squad'),
      where('groupId', 'in', ['myGroup']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, routeId: d.data().routeId as string | null }));
    expect(docs.map((d) => d.id)).toEqual(['squadMine']);
    expect(docs.every((d) => d.routeId === 'route1')).toBe(true);
  });
});

describe('useCommunityEnrichment.ts (useParkEvents) — park-scoped slices', () => {
  it('[public] parkId==X + privacyMode==verified_global + expiresAt>= — valid shape', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('parkId', '==', 'park1'),
      where('privacyMode', '==', 'verified_global'),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id)).toEqual(['pubPark']);
  });

  it('[own] parkId==X + userId==me + expiresAt>= — valid shape (no results here — my only doc is route-scoped, not park-scoped, which is correct)', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('parkId', '==', 'park1'),
      where('userId', '==', 'meUid'),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await getDocs(q);
    expect(snap.docs.map((d) => d.id)).toEqual([]);
  });
});
