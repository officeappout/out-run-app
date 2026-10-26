/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * /api/training-here/partners — a mutual follow actually receives a partner's 'partners' share; a
 * one-way follower, a stranger, squad / ghost shares without an audience, cancelled and expired
 * shares never do (enable_where_to_train_v1, owner 26.10: שותפי אימון = mutual follow).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';

const st = vi.hoisted(() => ({ db: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t }) }),
  getAdminDb: () => st.db,
}));

import { GET } from '../route';

const later = new Date(Date.now() + 3 * 3_600_000);
const soon = new Date(Date.now() + 3_600_000);
const past = new Date(Date.now() - 3_600_000);

const shares = async (uid: string) =>
  (await (await GET(new NextRequest('http://localhost/api/training-here/partners', { headers: { authorization: `Bearer ${uid}` } }))).json()).shares;

beforeEach(() => {
  st.db = makeFakeAdminDb({
    // noa ⇄ me mutual; fan → noa one-way; me → dan one-way
    'connections/me': { following: ['noa', 'dan'], followers: ['noa'] },
    'connections/noa': { following: ['me'], followers: ['me', 'fan'] },
    'connections/fan': { following: ['noa'], followers: [] },
    'connections/dan': { following: [], followers: ['me'] },
    'users/noa': { core: { gender: 'female' } },
    'planned_sessions/p1': { userId: 'noa', displayName: 'נועה', parkId: 'yarkon', parkName: 'גינת הירקון', activityType: 'workout', audience: 'partners', privacyMode: 'ghost', status: 'planned', startTime: soon, expiresAt: later },
    'planned_sessions/pub': { userId: 'noa', parkId: 'yarkon', parkName: 'גינת הירקון', activityType: 'running', audience: 'public', privacyMode: 'verified_global', status: 'planned', startTime: later, expiresAt: later },
    'planned_sessions/sq': { userId: 'noa', parkId: 'yarkon', activityType: 'workout', privacyMode: 'squad', status: 'planned', startTime: soon, expiresAt: later },
    'planned_sessions/gone': { userId: 'noa', parkId: 'yarkon', activityType: 'workout', audience: 'partners', privacyMode: 'ghost', status: 'cancelled', startTime: soon, expiresAt: later },
    'planned_sessions/old': { userId: 'noa', parkId: 'yarkon', activityType: 'workout', audience: 'partners', privacyMode: 'ghost', status: 'planned', startTime: past, expiresAt: past },
    'planned_sessions/dan1': { userId: 'dan', parkId: 'x', activityType: 'workout', audience: 'public', privacyMode: 'verified_global', status: 'planned', startTime: soon, expiresAt: later },
  }).db;
});

describe('/api/training-here/partners', () => {
  it('a mutual follow sees the partner\'s partners + public shares, soonest first, with gender', async () => {
    const out = await shares('me');
    expect(out.map((s: any) => s.id)).toEqual(['p1', 'pub']);
    expect(out[0]).toMatchObject({ parkName: 'גינת הירקון', gender: 'female', audience: 'partners' });
  });
  it('a one-way follower gets nothing (not a partner)', async () => {
    expect(await shares('fan')).toEqual([]);
  });
  it('only mutual follows are scanned — a one-way follow (dan) never appears', async () => {
    expect((await shares('me')).some((s: any) => s.userId === 'dan')).toBe(false);
  });
  it('401 without a token', async () => {
    const res = await GET(new NextRequest('http://localhost/api/training-here/partners'));
    expect(res.status).toBe(401);
  });
});
