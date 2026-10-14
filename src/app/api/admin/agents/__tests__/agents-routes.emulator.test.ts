/**
 * /api/admin/agents/** — the three root-only agents-panel routes, against a
 * REAL Firestore emulator (Timestamps, count() aggregation, transactions).
 *
 * Asserts David's contract (14.10.2026, src/lib/agentsPanelServer.ts):
 *   - 401 on missing / invalid / revoked token (checkRevoked=true requested);
 *   - non-root → the SAME generic 403 on all three routes, with ZERO
 *     Firestore access (getAdminDb is never even called) and ZERO audit rows;
 *   - agentId/findingId outside ID_PATTERN or the registry → generic 403;
 *   - list = best-effort audit; mark-read = fail-closed audit (one
 *     transaction — a failed audit write leaves readAt untouched);
 *   - per-uid rate limit → 429;
 *   - readAt must be an explicit null to count as unread (axioms.md §33).
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  db: null as unknown,
  dbCalls: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: state.verifyIdToken }),
  getAdminDb: () => {
    state.dbCalls++;
    return state.db;
  },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { GET as overviewGET } from '../route';
import { GET as findingsGET } from '../[agentId]/findings/route';
import { POST as readPOST } from '../[agentId]/findings/[findingId]/read/route';
import {
  GENERIC_FORBIDDEN,
  auditFindingsListBestEffort,
  decideAgentsAccess,
  markFindingRead,
} from '@/lib/agentsPanelServer';

const PROJECT_ID = 'appout-1-agents-panel-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8089';

let app: App;
let db: Firestore;

const ROOT = { uid: 'root_uid', email: 'david@appout.co.il' };
const NON_ROOT = { uid: 'staff_uid', email: 'staff@example.com' };

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it running at ${FIRESTORE_HOST}?`);
}

function req(authorization?: string, url = 'http://localhost/api/admin/agents'): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers, url } as unknown as NextRequest;
}

const at = (min: number) => Timestamp.fromDate(new Date(Date.UTC(2026, 9, 14, 10, min)));
const findingsCol = () => db.collection('agents').doc('oncall').collection('findings');

async function seed(): Promise<void> {
  await db.collection('agents').doc('oncall').set({
    lastRunAt: at(50), lastSuccessAt: at(50), lastError: null, consecutiveFailures: 0, schemaVersion: 1,
  });
  const base = {
    kind: 'new', topic: '/map', severity: 'high', platform: 'web',
    counts: { lastHour: 12, last24h: 40, total: 40 },
    confidence: 'medium', suggestion: 'בדוק את src/features/parks/x.ts', sourceUrl: 'https://sentry.io/issues/1/',
    suspectedPr: { number: 229, title: 'fix(parks)', sha: 'abc1234', url: 'https://github.com/x/pull/229', deployedAt: at(5) },
    firstSeenAt: at(10), lastSeenAt: at(40), schemaVersion: 1,
  };
  await findingsCol().doc('f-unread-old').set({ ...base, title: 'TypeError: a', createdAt: at(20), readAt: null });
  await findingsCol().doc('f-unread-new').set({ ...base, title: 'TypeError: b', createdAt: at(30), readAt: null });
  await findingsCol().doc('f-read').set({ ...base, title: 'TypeError: c', createdAt: at(25), readAt: at(35) });
  // readAt field ABSENT (a writer bug) — must NOT count as unread (§33).
  await findingsCol().doc('f-no-readat').set({ ...base, title: 'TypeError: d', createdAt: at(15) });
}

async function auditCount(): Promise<number> {
  return (await db.collection('audit_logs').count().get()).data().count;
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `agents-panel-emulator-test-${Date.now()}`);
  db = getFirestore(app);
}, 20000);

beforeEach(async () => {
  await clearEmulator();
  await seed();
  state.verifyIdToken.mockReset();
  state.db = db;
  state.dbCalls = 0;
  delete process.env.RL_AGENTS_PANEL_UID_MAX;
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

const findingsParams = (agentId = 'oncall') => ({ params: { agentId } });
const readParams = (findingId = 'f-unread-new', agentId = 'oncall') => ({ params: { agentId, findingId } });

describe('auth gate — all three routes', () => {
  it('no token → 401, token never verified, db never touched', async () => {
    for (const res of [
      await overviewGET(req()),
      await findingsGET(req(), findingsParams()),
      await readPOST(req(), readParams()),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(state.verifyIdToken).not.toHaveBeenCalled();
    expect(state.dbCalls).toBe(0);
  });

  it('revoked/invalid token → 401, checkRevoked=true requested, db never touched', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    expect((await overviewGET(req('Bearer revoked'))).status).toBe(401);
    expect(state.verifyIdToken).toHaveBeenCalledWith('revoked', true);
    expect(state.dbCalls).toBe(0);
  });

  it('non-root (incl. no email) → the SAME generic 403 on all three, zero db access, zero audit, nothing marked read', async () => {
    for (const who of [NON_ROOT, { uid: 'no_email_uid', email: undefined }]) {
      state.verifyIdToken.mockResolvedValue(who);
      const responses = [
        await overviewGET(req('Bearer t')),
        await findingsGET(req('Bearer t'), findingsParams()),
        await readPOST(req('Bearer t'), readParams()),
      ];
      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: GENERIC_FORBIDDEN });
      }
    }
    expect(state.dbCalls).toBe(0);
    expect(await auditCount()).toBe(0);
    expect((await findingsCol().doc('f-unread-new').get()).get('readAt')).toBeNull();
  });

  it('decideAgentsAccess: root emails pass (case-insensitive), others do not', () => {
    expect(decideAgentsAccess({ decoded: { uid: 'u', email: 'office@appout.co.il' } }).ok).toBe(true);
    expect(decideAgentsAccess({ decoded: { uid: 'u', email: 'DAVID@APPOUT.CO.IL' } }).ok).toBe(true);
    expect(decideAgentsAccess({ decoded: { uid: 'u', email: 'david@appout.co.il.evil.com' } }).ok).toBe(false);
  });
});

describe('id validation (root caller)', () => {
  beforeEach(() => state.verifyIdToken.mockResolvedValue(ROOT));

  it('unregistered / malformed / over-long agentId → generic 403, no db access', async () => {
    for (const agentId of ['nope', 'on call', '..', 'a'.repeat(129)]) {
      const res = await findingsGET(req('Bearer t'), findingsParams(agentId));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: GENERIC_FORBIDDEN });
    }
    expect(state.dbCalls).toBe(0);
  });

  it('malformed findingId → generic 403, nothing marked read', async () => {
    const res = await readPOST(req('Bearer t'), readParams('bad id!'));
    expect(res.status).toBe(403);
    expect(state.dbCalls).toBe(0);
  });
});

describe('root flows (real Firestore)', () => {
  beforeEach(() => state.verifyIdToken.mockResolvedValue(ROOT));

  it('overview → 200 + no-store; unread counts only explicit readAt:null (absent field is not unread)', async () => {
    const res = await overviewGET(req('Bearer t'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const { agents } = await res.json();
    expect(agents).toEqual([
      {
        agentId: 'oncall',
        lastRunAt: '2026-10-14T10:50:00.000Z',
        lastSuccessAt: '2026-10-14T10:50:00.000Z',
        lastError: null,
        consecutiveFailures: 0,
        unreadCount: 2,
      },
    ]);
  });

  it('overview for an agent that never ran → nulls + unreadCount 0, not an error', async () => {
    await clearEmulator();
    const { agents } = await (await overviewGET(req('Bearer t'))).json();
    expect(agents[0]).toMatchObject({ agentId: 'oncall', lastRunAt: null, unreadCount: 0 });
  });

  it('findings ?status=unread → the 2 unread, newest first, fully serialized; one best-effort audit row', async () => {
    const res = await findingsGET(req('Bearer t', 'http://localhost/x?status=unread'), findingsParams());
    expect(res.status).toBe(200);
    const { findings } = await res.json();
    expect(findings.map((f: { id: string }) => f.id)).toEqual(['f-unread-new', 'f-unread-old']);
    expect(findings[0]).toMatchObject({
      title: 'TypeError: b', severity: 'high', counts: { lastHour: 12, last24h: 40, total: 40 },
      suspectedPr: { number: 229, sha: 'abc1234', deployedAt: '2026-10-14T10:05:00.000Z' },
      createdAt: '2026-10-14T10:30:00.000Z', readAt: null,
    });
    const audits = await db.collection('audit_logs').get();
    expect(audits.size).toBe(1);
    const row = audits.docs[0].data();
    expect(row).toMatchObject({ adminId: 'root_uid', adminName: 'root', actionType: 'READ', targetId: 'oncall' });
    expect(Object.prototype.hasOwnProperty.call(row, 'sourceIp')).toBe(false);
    expect(JSON.stringify(row)).not.toContain('@');
  });

  it('findings ?status=all → all 4, createdAt desc', async () => {
    const { findings } = await (await findingsGET(req('Bearer t', 'http://localhost/x?status=all'), findingsParams())).json();
    expect(findings.map((f: { id: string }) => f.id)).toEqual(['f-unread-new', 'f-read', 'f-unread-old', 'f-no-readat']);
  });

  it('mark-read → 200, readAt set, one UPDATE audit row, unread count drops; second call is a no-op', async () => {
    const res = await readPOST(req('Bearer t'), readParams('f-unread-new'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyRead: false });
    expect((await findingsCol().doc('f-unread-new').get()).get('readAt')).toBeInstanceOf(Timestamp);
    expect(await auditCount()).toBe(1);
    const { agents } = await (await overviewGET(req('Bearer t'))).json();
    expect(agents[0].unreadCount).toBe(1);

    const again = await readPOST(req('Bearer t'), readParams('f-unread-new'));
    expect(await again.json()).toEqual({ ok: true, alreadyRead: true });
    expect(await auditCount()).toBe(1);
  });

  it('mark-read on a missing finding → 404, no audit row', async () => {
    const res = await readPOST(req('Bearer t'), readParams('does-not-exist'));
    expect(res.status).toBe(404);
    expect(await auditCount()).toBe(0);
  });

  it('per-uid rate limit → 429 with Retry-After once the budget is spent', async () => {
    process.env.RL_AGENTS_PANEL_UID_MAX = '2';
    expect((await overviewGET(req('Bearer t'))).status).toBe(200);
    expect((await overviewGET(req('Bearer t'))).status).toBe(200);
    const blocked = await overviewGET(req('Bearer t'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('60');
  });
});

describe('audit failure modes', () => {
  /** db whose audit_logs collection is unavailable; everything else is the real emulator. */
  function dbWithBrokenAudit(): Firestore {
    return new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'collection') {
          return (name: string) => {
            if (name === 'audit_logs') throw new Error('audit store unavailable');
            return target.collection(name);
          };
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as Firestore;
  }

  it('mark-read is FAIL-CLOSED: audit write fails → throws, readAt stays null', async () => {
    await expect(markFindingRead(dbWithBrokenAudit(), { uid: 'root_uid' }, 'oncall', 'f-unread-new')).rejects.toThrow();
    expect((await findingsCol().doc('f-unread-new').get()).get('readAt')).toBeNull();
    expect(await auditCount()).toBe(0);
  });

  it('mark-read route with a broken audit store → 500, nothing written', async () => {
    state.verifyIdToken.mockResolvedValue(ROOT);
    state.db = dbWithBrokenAudit();
    const res = await readPOST(req('Bearer t'), readParams('f-unread-new'));
    expect(res.status).toBe(500);
    expect((await findingsCol().doc('f-unread-new').get()).get('readAt')).toBeNull();
  });

  it('list audit is BEST-EFFORT: audit write fails → swallowed, and the route still returns 200', async () => {
    await expect(auditFindingsListBestEffort(dbWithBrokenAudit(), { uid: 'root_uid' }, 'oncall', 'unread', 2)).resolves.toBeUndefined();
    state.verifyIdToken.mockResolvedValue(ROOT);
    state.db = dbWithBrokenAudit();
    const res = await findingsGET(req('Bearer t', 'http://localhost/x?status=unread'), findingsParams());
    expect(res.status).toBe(200);
    expect((await res.json()).findings.length).toBe(2);
  });
});
