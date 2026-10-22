import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
  identity: null as null | { uid: string; email: string | null; admin: boolean },
  session: null as null | { uid: string; email?: string; admin: boolean },
  users: {} as Record<string, unknown>,
  flags: {} as Record<string, unknown>,
  userReads: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin-session', () => ({
  SESSION_COOKIE_NAME: 'out_admin_session',
  verifyAdminSession: async () => state.session,
}));
vi.mock('@/lib/firebase-admin', () => {
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (name === 'users') state.userReads += 1;
          const data = name === 'users' ? state.users[id] : name === 'system_config' && id === 'feature_flags' ? state.flags : undefined;
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  };
  return {
    getAdminDb: () => db,
    resolveIdentity: async () => {
      if (!state.identity) throw new Error('bad token');
      return state.identity;
    },
  };
});

import { requireAdminAiCaller } from '../gate.server';

function req(headers: Record<string, string> = {}, cookie?: string): NextRequest {
  const h = new Headers(headers);
  if (cookie) h.set('cookie', `out_admin_session=${cookie}`);
  return new NextRequest('http://localhost/api/admin/assistant/chat', { method: 'POST', headers: h });
}

beforeEach(() => {
  state.identity = null;
  state.session = null;
  state.users = {};
  state.flags = { admin_ai_assistant_v1: true };
  state.userReads = 0;
  process.env.AGENT_API_KEY = 'agent-key-placeholder';
});

describe('requireAdminAiCaller', () => {
  it('agent key alone → 401 (person-only gate, no machine path)', async () => {
    const res = await requireAdminAiCaller(req({ 'x-agent-key': 'agent-key-placeholder' }));
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it('an admin who is neither root nor super → 403', async () => {
    state.identity = { uid: 'a1', email: 'manager@city.gov.il', admin: true };
    state.users.a1 = { core: { isSuperAdmin: false } };
    expect(((await requireAdminAiCaller(req({ authorization: 'Bearer t' }))) as NextResponse).status).toBe(403);
  });

  it('root email (office@) passes as role root without reading users', async () => {
    state.identity = { uid: 'r1', email: 'office@appout.co.il', admin: true };
    expect(await requireAdminAiCaller(req({ authorization: 'Bearer t' }))).toEqual({ uid: 'r1', email: 'office@appout.co.il', role: 'root' });
    expect(state.userReads).toBe(0);
  });

  it('super admin via the session cookie passes as role super', async () => {
    state.session = { uid: 's1', email: 'ops@appout.co.il', admin: true };
    state.users.s1 = { core: { isSuperAdmin: true } };
    expect(await requireAdminAiCaller(req({}, 'cookie'))).toEqual({ uid: 's1', email: 'ops@appout.co.il', role: 'super' });
  });

  it('flag admin_ai_assistant_v1 off (or missing) → 403 flag_off, even for root', async () => {
    state.identity = { uid: 'r1', email: 'david@appout.co.il', admin: true };
    state.flags = {};
    const res = (await requireAdminAiCaller(req({ authorization: 'Bearer t' }))) as NextResponse;
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('flag_off');
  });
});
