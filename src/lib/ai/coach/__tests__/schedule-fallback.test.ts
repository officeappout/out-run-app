/**
 * When the virtual layering (template / training days / running plan) throws on one user's
 * data, get_schedule returns the day docs it read MARKED partial (days without a doc are
 * unknown, never "nothing planned"), and the sheet treats the week as unknown.
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

import { executeServerTool, loadUserContextSheet, type ServerToolContext } from '../server-tools.server';

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

function ctxOf(): ServerToolContext {
  return {
    db: db({ '2026-10-22': [{ type: 'training', programIds: ['push'], startTime: '18:00', scheduledCategories: ['strength'] }, { type: 'rest', override: true }] }),
    uid: 'u1',
    profile: {},
    now: new Date('2026-10-22T08:00:00Z'),
    knownCards: new Map(),
    turn: { handoffDone: false },
  } as unknown as ServerToolContext;
}

describe('get_schedule when the planned-week layering throws', () => {
  it('returns the day docs marked partial, with a note that the other days are unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await executeServerTool(ctxOf(), 'get_schedule', { from: '2026-10-22', to: '2026-10-23' });
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content);
    expect(out.partial).toBe(true);
    expect(out.note).toMatch(/UNKNOWN, not empty/);
    expect(out.note).toMatch(/Never say nothing is planned/);
    expect(out.diagnostic).toBe('TypeError: bad profile field');
    expect(out.note).toMatch(/never mention the diagnostic/);
  });

  it('the sheet treats a partial week as unknown (weekUnavailable), never as the whole week', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = ctxOf();
    (c.db as unknown as { collection: (n: string) => unknown }).collection = ((n: string) =>
      n === 'workouts'
        ? { where: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }), orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) }
        : n === 'programs'
          ? { get: async () => ({ docs: [] }) }
          : { doc: (id: string) => ({ id, get: async () => ({ exists: false, data: () => undefined }) }) }) as never;
    const sheet = await loadUserContextSheet(c);
    expect(sheet.weekUnavailable).toBe(true);
    expect(sheet.thisWeek).toEqual([]);
  });
});
