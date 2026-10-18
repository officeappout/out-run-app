import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Shabbat guard is opt-in (18.10.2026) — the paths outside sendPush():
 *   - weekStartScheduler: only observers, only on motzei Shabbat, not when a
 *     yom tov continues; pre-filter respects push/toggle/tokens
 *   - sendPushFromQueue (legacy path): observers excluded per recipient
 *     inside the window, the broadcast itself still goes out
 *   - retentionScheduler: observers skipped only inside the window
 * sendPush() itself is covered by services/__tests__/push.service.shabbat.test.ts.
 */

const state = vi.hoisted(() => ({
  users: new Map<string, Record<string, any>>(),
  queries: [] as Array<{ field: string; op: string; value: unknown }>,
}));

const sendPushMock = vi.hoisted(() =>
  vi.fn(async (opts: { toUids: string[] }) => ({
    attempted: opts.toUids.length,
    delivered: opts.toUids.length,
    failed: 0,
    skippedGlobalKill: 0,
    skippedPrefs: 0,
    skippedQuietHours: 0,
    skippedShabbat: 0,
    skippedRateCap: 0,
    skippedDailyCap: 0,
    tokensPruned: 0,
  })),
);

function makeQuery(filters: Array<(d: Record<string, any>) => boolean>, limitN = Infinity, after: string | null = null): any {
  return {
    where: (field: string, op: string, value: unknown) => {
      state.queries.push({ field, op, value });
      const path = field.split('.');
      return makeQuery(
        [...filters, (d) => path.reduce((o: any, k) => o?.[k], d) === value],
        limitN,
        after,
      );
    },
    orderBy: () => makeQuery(filters, limitN, after),
    select: () => makeQuery(filters, limitN, after),
    limit: (n: number) => makeQuery(filters, n, after),
    startAfter: (doc: { id: string }) => makeQuery(filters, limitN, doc.id),
    get: async () => {
      const ids = Array.from(state.users.keys())
        .sort()
        .filter((id) => (after === null || id > after) && filters.every((f) => f(state.users.get(id)!)))
        .slice(0, limitN);
      return { docs: ids.map((id) => ({ id, data: () => state.users.get(id) })) };
    },
  };
}

vi.mock('firebase-admin', () => {
  const db = {
    collection: () => ({
      ...makeQuery([]),
      doc: (id: string) => ({
        id,
        get: async () => ({ id, exists: state.users.has(id), data: () => state.users.get(id) }),
      }),
    }),
    getAll: async (...refs: Array<{ get: () => Promise<any> }>) => Promise.all(refs.map((r) => r.get())),
  };
  const firestoreFn = () => db;
  (firestoreFn as any).FieldPath = { documentId: () => '__name__' };
  (firestoreFn as any).Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  (firestoreFn as any).FieldValue = {};
  return { apps: [{}], initializeApp: vi.fn(), firestore: firestoreFn, messaging: () => ({}) };
});
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));
vi.mock('../services/push.service', () => ({ sendPush: sendPushMock, isQuietHours: () => false }));

import {
  runWeekStart,
  isWeekStartRecipient,
  buildWeekStartMessage,
  WEEK_START_VARIANTS,
} from '../weekStartScheduler';
import { collectTokens } from '../sendPushFromQueue';
import { toRetentionCandidate } from '../retentionScheduler';

// Sat 16.01.2027 21:15 Israel (+2) — motzei Shabbat, plain week.
const MOTZEI = new Date('2027-01-16T19:15:00Z');
// Sat 02.10.2027 21:15 Israel (+3) — Rosh Hashana continues on Sunday.
const MOTZEI_INTO_RH = new Date('2027-10-02T18:15:00Z');
// Sat 16.01.2027 12:00 Israel — inside the window.
const SHABBAT_NOON = new Date('2027-01-16T10:00:00Z');

function observer(extra: Record<string, any> = {}, tokens = ['t']) {
  return { fcmTokens: tokens, settings: { shabbatObserver: true, ...extra } };
}

beforeEach(() => {
  state.users.clear();
  state.queries.length = 0;
  sendPushMock.mockClear();
});

describe('weekStartScheduler', () => {
  it('pushes only Shabbat observers, on the week_start channel, deep-linked to /home', async () => {
    state.users.set('obs-1', observer());
    state.users.set('obs-2', observer());
    state.users.set('not-obs', { fcmTokens: ['t'], settings: {} });
    state.users.set('explicit-false', { fcmTokens: ['t'], settings: { shabbatObserver: false } });

    const r = await runWeekStart(MOTZEI);

    expect(r.ran).toBe(true);
    expect(state.queries).toContainEqual({ field: 'settings.shabbatObserver', op: '==', value: true });
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const opts = sendPushMock.mock.calls[0][0] as any;
    expect(opts.toUids.sort()).toEqual(['obs-1', 'obs-2']);
    expect(opts.channel).toBe('week_start');
    expect(opts.deepLink).toBe('/home');
    expect(opts.rateCapHours).toBeGreaterThan(24);
  });

  it('does nothing outside motzei Shabbat', async () => {
    state.users.set('obs-1', observer());
    expect((await runWeekStart(SHABBAT_NOON)).ran).toBe(false);
    expect((await runWeekStart(new Date('2027-01-17T19:15:00Z'))).ran).toBe(false); // Sun 21:15
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('does nothing when a yom tov continues after Shabbat', async () => {
    state.users.set('obs-1', observer());
    const r = await runWeekStart(MOTZEI_INTO_RH);
    expect(r.ran).toBe(false);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('pre-filter: push off, week_start toggle off, or no tokens → skipped', () => {
    expect(isWeekStartRecipient(observer())).toBe(true);
    expect(isWeekStartRecipient(observer({ pushEnabled: false }))).toBe(false);
    expect(isWeekStartRecipient(observer({ notificationPrefs: { week_start: false } }))).toBe(false);
    expect(isWeekStartRecipient(observer({}, []))).toBe(false);
    expect(isWeekStartRecipient({ fcmTokens: ['t'], settings: {} })).toBe(false);
  });

  it('paginates past one page', async () => {
    for (let i = 0; i < 650; i++) state.users.set(`obs-${String(i).padStart(4, '0')}`, observer());
    const r = await runWeekStart(MOTZEI);
    expect(r.candidates).toBe(650);
    const sent = sendPushMock.mock.calls.flatMap((c: any[]) => c[0].toUids);
    expect(new Set(sent).size).toBe(650);
  });

  it('copy: gender-neutral variants, no emoji, same variant for everyone in a run', () => {
    expect(WEEK_START_VARIANTS.length).toBeGreaterThanOrEqual(2);
    for (const v of WEEK_START_VARIANTS) {
      // Emoji are astral-plane characters → surrogate pairs; Hebrew is BMP.
      expect(`${v.title}${v.body}`).not.toMatch(/[\uD800-\uDFFF\u2600-\u27BF]/);
    }
    expect(buildWeekStartMessage(MOTZEI)).toEqual(buildWeekStartMessage(MOTZEI));
  });
});

describe('sendPushFromQueue — legacy collectTokens', () => {
  beforeEach(() => {
    state.users.set('obs', observer({}, ['tok-obs']));
    state.users.set('other', { fcmTokens: ['tok-other'], settings: {} });
  });

  it('inside the window: excludes observers only, keeps everyone else', async () => {
    const r = await collectTokens(new Set(['obs', 'other']), 'encouragement', true);
    expect(r.tokens).toEqual(['tok-other']);
    expect(r.skippedShabbat).toBe(1);
  });

  it('outside the window: observers included', async () => {
    const r = await collectTokens(new Set(['obs', 'other']), 'encouragement', false);
    expect(r.tokens.sort()).toEqual(['tok-obs', 'tok-other']);
    expect(r.skippedShabbat).toBe(0);
  });
});

describe('retentionScheduler — candidate filter on Shabbat', () => {
  const NOW = Date.UTC(2027, 0, 16, 10);
  const inactive = { lastActive: { toMillis: () => NOW - 10 * 86_400_000 }, core: { name: 'a' } };

  it('skips an observer only inside the window', () => {
    const data = { ...inactive, settings: { shabbatObserver: true } };
    expect(toRetentionCandidate('u', data, NOW, true)).toBeNull();
    expect(toRetentionCandidate('u', data, NOW, false)).not.toBeNull();
  });

  it('keeps a non-observer inside the window', () => {
    expect(toRetentionCandidate('u', { ...inactive, settings: {} }, NOW, true)).not.toBeNull();
  });
});
