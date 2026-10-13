import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// SEC-04 — calendar feed token routes. Synthetic data only, no emulator.
// The Firestore stand-in counts every call so "zero reads" is asserted, not
// assumed: a forged token / the legacy route must not touch the db at all.
const state = vi.hoisted(() => ({
  dbTouches: 0,
  docGets: 0,
  blocked: false,
  rateKeys: [] as string[],
  schedule: {} as Record<string, { entries: unknown[] }>,
  verifyIdToken: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => {
    state.dbTouches++;
    return {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => {
            state.docGets++;
            const data = state.schedule[id];
            return { exists: !!data, data: () => data };
          },
        }),
      }),
    };
  },
  getAdminAuth: () => ({ verifyIdToken: state.verifyIdToken }),
}));

vi.mock('@/lib/rateLimitConfig', async (orig) => {
  const actual = await orig<typeof import('@/lib/rateLimitConfig')>();
  return {
    ...actual,
    isBlockedByAny: async (_db: unknown, checks: Array<{ key: string }>) => {
      state.rateKeys.push(...checks.map((c) => c.key));
      return state.blocked
        ? { blocked: true, window: { windowMs: 60_000, maxRequests: 30 } }
        : { blocked: false };
    },
  };
});

vi.mock('@/lib/requestIp', () => ({ getRequestIp: () => '203.0.113.7' }));
vi.mock('@/lib/rateLimitLog', () => ({ logRateLimitBlock: vi.fn() }));

import { mintFeedToken } from '@/lib/calendar-feed-token';
import { GET as feedGET } from '../t/[token]/route';
import { GET as legacyGET } from '../[userId]/route';
import { POST as mintPOST } from '../token/route';

const SECRET = 'c'.repeat(48);
const UID = 'synthUserAAAAAAAAAAAAAAAAAAAA';
const OTHER_UID = 'synthUserBBBBBBBBBBBBBBBBBBBB';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function mintReq(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers } as unknown as NextRequest;
}

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.CALENDAR_FEED_SECRET;
  process.env.CALENDAR_FEED_SECRET = SECRET;
  state.dbTouches = 0;
  state.docGets = 0;
  state.blocked = false;
  state.rateKeys = [];
  state.schedule = {
    [`${UID}_${today()}`]: {
      entries: [{ entryId: 'e1', date: today(), type: 'training', scheduledCategories: ['push'], startTime: '06:30' }],
    },
    [`${OTHER_UID}_${today()}`]: {
      entries: [{ entryId: 'x9', date: today(), type: 'training', scheduledCategories: ['legs'] }],
    },
  };
  state.verifyIdToken.mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.CALENDAR_FEED_SECRET;
  else process.env.CALENDAR_FEED_SECRET = saved;
});

describe('GET /api/calendar/t/[token]', () => {
  it('valid token → ICS with only that uid\'s events, rate-limited on calendar:token:{uid}', async () => {
    const token = mintFeedToken(UID)!;
    const res = await feedGET({ headers: new Headers() } as unknown as NextRequest, { params: { token } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('אימון דחיפה');
    expect(body).not.toContain('אימון רגליים'); // other user's entry
    expect(body).toContain(`UID:outrun-${UID.slice(0, 8)}-${today()}-e1@outrun.app`);
    expect(state.rateKeys).toEqual([`calendar:token:${UID}`]);
    expect(state.docGets).toBe(90);
  });

  it('forged MAC → 404 and ZERO db access (no rate-limit, no reads)', async () => {
    const token = mintFeedToken(UID)!;
    const forged = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    const res = await feedGET({ headers: new Headers() } as unknown as NextRequest, { params: { token: forged } });
    expect(res.status).toBe(404);
    expect(state.dbTouches).toBe(0);
    expect(state.rateKeys).toEqual([]);
  });

  it('bare uid (the old credential) → 404 and zero db access', async () => {
    const res = await feedGET({ headers: new Headers() } as unknown as NextRequest, { params: { token: UID } });
    expect(res.status).toBe(404);
    expect(state.dbTouches).toBe(0);
  });

  it('uid swapped onto another user\'s MAC → 404 and zero db access', async () => {
    const mac = mintFeedToken(UID)!.split('.')[1];
    const res = await feedGET(
      { headers: new Headers() } as unknown as NextRequest,
      { params: { token: `${OTHER_UID}.${mac}` } },
    );
    expect(res.status).toBe(404);
    expect(state.dbTouches).toBe(0);
  });

  it('rate-limited → 429 with Retry-After, and no schedule reads', async () => {
    const token = mintFeedToken(UID)!;
    state.blocked = true;
    const res = await feedGET({ headers: new Headers() } as unknown as NextRequest, { params: { token } });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.docGets).toBe(0);
  });

  it('secret missing → 404 and zero db access, even for a previously-valid token', async () => {
    const token = mintFeedToken(UID)!;
    delete process.env.CALENDAR_FEED_SECRET;
    const res = await feedGET({ headers: new Headers() } as unknown as NextRequest, { params: { token } });
    expect(res.status).toBe(404);
    expect(state.dbTouches).toBe(0);
  });
});

describe('GET /api/calendar/[userId] (legacy, phase 1)', () => {
  it('returns the notice ICS and performs zero db access, even for a uid that has schedule docs', async () => {
    const res = await legacyGET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    const body = await res.text();
    expect(body).toContain('הקישור התעדכן — הירשם מחדש מהאפליקציה');
    expect(body).not.toContain('אימון דחיפה');
    expect(body).not.toContain(UID.slice(0, 8));
    expect(state.dbTouches).toBe(0);
    expect(state.docGets).toBe(0);
    expect(state.rateKeys).toEqual([]);
  });
});

describe('POST /api/calendar/token', () => {
  it('no Authorization header → 401', async () => {
    const res = await mintPOST(mintReq());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
  });

  it('non-Bearer header → 401', async () => {
    const res = await mintPOST(mintReq('Basic abc'));
    expect(res.status).toBe(401);
  });

  it('bad / revoked ID token → 401', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    const res = await mintPOST(mintReq('Bearer bad'));
    expect(res.status).toBe(401);
  });

  it('anonymous account → 403, no token issued', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: UID, firebase: { sign_in_provider: 'anonymous' } });
    const res = await mintPOST(mintReq('Bearer anon'));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain(UID);
  });

  it('valid non-anonymous → token for THAT uid only, path (no host), verifies with checkRevoked', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: UID, firebase: { sign_in_provider: 'google.com' } });
    const res = await mintPOST(mintReq('Bearer good'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.token).toBe(mintFeedToken(UID));
    expect(body.path).toBe(`/api/calendar/t/${body.token}`);
    expect(body.path.startsWith('/')).toBe(true);
    expect(state.verifyIdToken).toHaveBeenCalledWith('good', true);
    expect(body.token.startsWith(`${UID}.`)).toBe(true);
    expect(body.token).not.toContain(OTHER_UID);
  });

  it('secret missing → 503 before any auth work', async () => {
    delete process.env.CALENDAR_FEED_SECRET;
    const res = await mintPOST(mintReq('Bearer good'));
    expect(res.status).toBe(503);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
  });

  it('secret too short → 503', async () => {
    process.env.CALENDAR_FEED_SECRET = 'short';
    const res = await mintPOST(mintReq('Bearer good'));
    expect(res.status).toBe(503);
  });
});
