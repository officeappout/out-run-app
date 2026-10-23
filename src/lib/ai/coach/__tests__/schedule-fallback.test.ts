/**
 * get_schedule never loses the whole week to the virtual layering (template / training days /
 * running plan) failing on one user's data: the day docs that were read still answer.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'k', KELLY_NAME: 'קלי' }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__ts', increment: (n: number) => ({ __inc: n }) },
  Timestamp: class {
    static fromMillis(ms: number) {
      return { toMillis: () => ms };
    }
  },
}));
vi.mock('../week-plan', () => ({
  plannedWeekEntries: () => {
    throw new TypeError('bad profile field');
  },
}));

import { executeServerTool, type ServerToolContext } from '../server-tools.server';

function db(docs: Record<string, unknown[]>) {
  return {
    collection: (c: string) => ({ doc: (id: string) => ({ path: `${c}/${id}`, id }) }),
    getAll: async (...refs: Array<{ id: string }>) =>
      refs.map((r) => {
        const date = r.id.split('_')[1];
        return docs[date] ? { exists: true, data: () => ({ entries: docs[date] }) } : { exists: false, data: () => undefined };
      }),
  };
}

describe('get_schedule fallback', () => {
  it('returns the day-doc entries when the planned-week layering throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = {
      db: db({ '2026-10-22': [{ type: 'training', programIds: ['push'], startTime: '18:00', scheduledCategories: ['strength'] }, { type: 'rest', override: true }] }),
      uid: 'u1',
      profile: {},
      now: new Date('2026-10-22T08:00:00Z'),
      knownCards: new Map(),
      turn: { handoffDone: false },
    } as unknown as ServerToolContext;
    const r = await executeServerTool(ctx, 'get_schedule', { from: '2026-10-22', to: '2026-10-23' });
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ date: '2026-10-22', startTime: '18:00' });
  });
});
