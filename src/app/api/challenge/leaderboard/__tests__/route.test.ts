import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// SPEC-04 Wave B (10.09.2026) — this route has no auth wall at all (public,
// polled unauthenticated from /booth/display, a physical-event plasma
// screen), so it can't be scoped by "caller's own ageGroup" like every
// other leaderboard this spec touched. challenge_submissions docs carry
// each participant's real ageGroup, which this route used to return
// alongside their real name to the open internet — worse than a login-
// gated leak. Fix: drop `ageGroup` from the response entirely (verified via
// grep that neither consumer ever read it — booth/display's own row type
// declared it but never rendered it), so who appears is unchanged but a
// named minor is no longer explicitly tagged as such to anyone who finds
// the URL.
const state = vi.hoisted(() => ({
  DOCS: [] as Array<{ id: string; data: Record<string, any> }>,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    collection: () => ({
      orderBy: () => ({
        limit: () => ({
          get: async () => ({
            docs: state.DOCS.slice(0, 20).map((d) => ({ id: d.id, data: () => d.data })),
          }),
        }),
      }),
      count: () => ({ get: async () => ({ data: () => ({ count: state.DOCS.length }) }) }),
    }),
  }),
}));

import { GET } from '../route';

function fakeRequest(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe('GET /api/challenge/leaderboard', () => {
  it('never returns an ageGroup field, even though the underlying doc carries a real one (public, unauthenticated endpoint — no caller to scope by, so the field itself must not leak)', async () => {
    state.DOCS = [
      { id: 'minor_uid', data: { name: 'Real Minor Name', ageGroup: 'minor', gender: 'female', bestValue: 42 } },
      { id: 'adult_uid', data: { name: 'Real Adult Name', ageGroup: 'adult', gender: 'male', bestValue: 50 } },
    ];

    const res = await GET(fakeRequest('https://example.com/api/challenge/leaderboard?groupId=g1'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rows.length).toBe(2);
    for (const row of body.rows) {
      expect(row).not.toHaveProperty('ageGroup');
    }
    // WHO appears must stay unchanged — this is a field removal, not a
    // row filter. Both participants still show up.
    expect(body.rows.map((r: any) => r.uid).sort()).toEqual(['adult_uid', 'minor_uid']);
  });
});
