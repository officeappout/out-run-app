/**
 * joinEngine — B1 demo sandbox (agent-briefs/ai-testers-design.md §2.5, 20.10.2026).
 * A demo actor (uid demo_* or the demo:true claim, passed as actorIsDemo) never joins a
 * real group through any Admin-SDK join path (/api/join/confirm, /api/join/session-token,
 * /api/social/group-membership, /api/challenge/join); it still joins demo- groups, and a
 * real user is unaffected. Same harness as joinEngine.hostuid-escalation.emulator.test.ts.
 *
 * Run: bash scripts/ci/run-emulator-suites.sh --only 8089 src/lib/__tests__/joinEngine.demo-actor.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const PROJECT_ID = 'appout-1-joinengine-demo-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8089';

let emulatorDb: import('firebase-admin/firestore').Firestore;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => emulatorDb,
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from joinEngine'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { joinEngine, JoinEngineError } from '../joinEngine';

let app: App;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `joinengine-demo-emulator-test-${Date.now()}`);
  emulatorDb = getFirestore(app);
}, 20000);

beforeEach(async () => {
  const res = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status})`);
  await emulatorDb.doc('community_groups/real-grp').set({ name: 'Real', isPublic: true, isActive: true });
  await emulatorDb.doc('community_groups/demo-grp-tlv-run').set({ name: 'Demo', isPublic: true, isActive: true, isDemo: true });
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

async function expectDenied(p: Promise<unknown>) {
  await expect(p).rejects.toBeInstanceOf(JoinEngineError);
  await p.catch((e: JoinEngineError) => expect(e.code).toBe('demo-actor-target'));
}

describe('joinEngine — demo actor sandbox', () => {
  it('a demo_ uid cannot join a real group (nothing written)', async () => {
    await expectDenied(joinEngine({ target: { type: 'direct', groupId: 'real-grp' }, uid: 'demo_qa_walker' }));
    expect((await emulatorDb.doc('community_groups/real-grp/members/demo_qa_walker').get()).exists).toBe(false);
    expect((await emulatorDb.doc('user_memberships/demo_qa_walker').get()).exists).toBe(false);
  });

  it('a claim-only demo actor (actorIsDemo) cannot join a real group', async () => {
    await expectDenied(joinEngine({ target: { type: 'direct', groupId: 'real-grp' }, uid: 'claimed_tester', actorIsDemo: true }));
    expect((await emulatorDb.doc('community_groups/real-grp/members/claimed_tester').get()).exists).toBe(false);
  });

  it('a demo actor joins a demo- group', async () => {
    const r = await joinEngine({ target: { type: 'direct', groupId: 'demo-grp-tlv-run' }, uid: 'demo_qa_walker', actorIsDemo: true });
    expect(r.groupId).toBe('demo-grp-tlv-run');
    expect((await emulatorDb.doc('community_groups/demo-grp-tlv-run/members/demo_qa_walker').get()).exists).toBe(true);
  });

  it('a real user joins a real group (unchanged)', async () => {
    const r = await joinEngine({ target: { type: 'direct', groupId: 'real-grp' }, uid: 'real_a' });
    expect(r.membershipConfirmed).toBe(true);
    expect((await emulatorDb.doc('community_groups/real-grp/members/real_a').get()).exists).toBe(true);
  });
});
