/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Firestore stand-in */
/** buildProactiveState: a demo user (core.demo or `demo_` uid) → null + onDemo, nothing else read. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) } }));
vi.mock('@/lib/ai/entitlement.server', () => ({
  aiFlagsFrom: () => ({}),
  getAiEntitlement: vi.fn(async () => {
    throw new Error('must not be read for a demo user');
  }),
}));
vi.mock('../../server-tools.server', () => ({
  loadUserContextSheet: vi.fn(async () => {
    throw new Error('must not be read for a demo user');
  }),
}));

import { buildProactiveState } from '../context.server';

const docs: Record<string, Record<string, unknown>> = {
  'users/u9': { core: { ageGroup: 'adult', demo: { tenantId: 'demo-city', personaId: 'p9', v: 1 } } },
  'users/demo_p1': { core: { ageGroup: 'adult' } },
};
const ref = (path: string): any => ({
  get: async () => ({ exists: path in docs, data: () => docs[path] }),
  collection: (n: string) => col(`${path}/${n}`),
});
const col = (path: string): any => ({ doc: (id: string) => ref(`${path}/${id}`) });
const db: any = { collection: col };

describe('buildProactiveState — demo world', () => {
  for (const uid of ['u9', 'demo_p1']) {
    it(`${uid} → null, onDemo called`, async () => {
      const onDemo = vi.fn();
      const s = await buildProactiveState({ db, uid, now: new Date('2026-10-20T05:00:00Z'), flags: {} as any, due: ['morning'], onDemo });
      expect(s).toBeNull();
      expect(onDemo).toHaveBeenCalledTimes(1);
    });
  }
  it('allowDemo (demo_kelly on): a demo user gets a state marked demo', async () => {
    const onDemo = vi.fn();
    const s = await buildProactiveState({ db, uid: 'demo_p1', now: new Date('2026-10-20T05:00:00Z'), flags: { aiCoachFreeForAll: true } as any, due: ['post_workout'], allowDemo: true, onDemo });
    expect(onDemo).not.toHaveBeenCalled();
    expect(s?.demo).toBe(true);
  });
});
