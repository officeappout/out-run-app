import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => 'TS' },
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  }),
}));
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));

const sendPush = vi.fn(async (_o: unknown) => ({ attempted: 1, delivered: 1 }));
vi.mock('../services/push.service', () => ({ sendPush: (o: unknown) => sendPush(o) }));

// Real copy selection over the code defaults (no library rows), so the catalog copy is exercised too.
const genders: Record<string, 'male' | 'female' | undefined> = {};
vi.mock('../services/push-copy.service', async () => {
  const core = await import('../shared/push-library.core');
  return {
    resolvePushCopy: async (t: string, ctx: Parameters<typeof core.selectPushCopy>[2]) =>
      core.selectPushCopy(t, [], { ...ctx, now: new Date(Date.UTC(2026, 9, 26, 12, 0)) }),
    pushCopyData: (c: { pushType: string; rowId: string }) => ({ pushType: c.pushType, copyRowId: c.rowId }),
    loadPushRecipient: async (uid: string) => ({ audience: { gender: genders[uid] }, firstName: 'דנה' }),
    loadPushSubjectGender: async (uid: string) => genders[uid] ?? null,
  };
});

import {
  ownerReminderDue, isLaterShare, partnerNoticeEligible, mutualPartners, ownerReminderMarkerId, toMs,
} from '../trainingHere/training-here-time';
import { runTrainingHereReminderPass, partnerNoticeRecipients } from '../trainingHere/send-training-here-push';
import { handleTrainingHereShared } from '../onTrainingHereShared';
import { PUSH_CATALOG_BY_TYPE, PUSH_TITLE_MAX, PUSH_BODY_MAX } from '../shared/push-library.core';

const MIN = 60_000;
// 2026-10-26 18:00 Israel (UTC+2 after 25.10) = 16:00Z.
const START = Date.UTC(2026, 9, 26, 16, 0);
const ts = (ms: number) => ({ toMillis: () => ms });

function session(over: Record<string, unknown> = {}) {
  return {
    userId: 'owner', displayName: 'יואב כהן', parkId: 'p1', parkName: 'גן הבנים',
    startTime: ts(START), createdAt: ts(START - 3 * 60 * MIN), status: 'planned',
    privacyMode: 'squad', workoutTitle: 'אימון עליון', activityType: 'workout',
    ...over,
  };
}

// ── tiny in-memory Firestore ──
function fakeDb(opts: { flag: boolean; sessions?: Record<string, Record<string, unknown>>; conn?: Record<string, unknown> }) {
  const markers = new Set<string>();
  const sessions = opts.sessions ?? {};
  const docGet = (path: string) => async () => {
    if (path === 'app_config/feature_flags') return { exists: true, data: () => ({ enableTrainingHereReminders: opts.flag }) };
    if (path.startsWith('connections/')) return opts.conn ? { exists: true, data: () => opts.conn } : { exists: false };
    return { exists: false };
  };
  const db = {
    doc: (path: string) => ({ get: docGet(path) }),
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => (sessions[id] ? { exists: true, data: () => sessions[id] } : { exists: false }),
        create: async () => {
          if (markers.has(`${c}/${id}`)) throw Object.assign(new Error('exists'), { code: 6 });
          markers.add(`${c}/${id}`);
        },
      }),
      where: (_f: string, _o: string, from: { toMillis: () => number }) => ({
        where: (_f2: string, _o2: string, to: { toMillis: () => number }) => ({
          get: async () => {
            const docs = Object.entries(sessions)
              .filter(([, s]) => {
                const ms = toMs(s.startTime);
                return ms != null && ms > from.toMillis() && ms <= to.toMillis();
              })
              .map(([id, s]) => ({ id, data: () => s }));
            return { size: docs.length, docs };
          },
        }),
      }),
    }),
  };
  return { db: db as never, markers, sessions };
}

beforeEach(() => {
  sendPush.mockClear();
  for (const k of Object.keys(genders)) delete genders[k];
});

describe('timing window (pure)', () => {
  it('due only 5-15 minutes before the start', () => {
    const s = session();
    expect(ownerReminderDue(s, START - 15 * MIN)).toBe(true);
    expect(ownerReminderDue(s, START - 10 * MIN)).toBe(true);
    expect(ownerReminderDue(s, START - 16 * MIN)).toBe(false);
    expect(ownerReminderDue(s, START - 5 * MIN)).toBe(false);
    expect(ownerReminderDue(s, START + MIN)).toBe(false);
  });
  it('not for a cancelled, started or completed session', () => {
    for (const status of ['cancelled', 'active', 'completed']) {
      expect(ownerReminderDue(session({ status }), START - 10 * MIN)).toBe(false);
    }
  });
  it('only for a "later" share (created 20+ minutes before the start)', () => {
    expect(isLaterShare(session({ createdAt: ts(START - 20 * MIN) }))).toBe(true);
    expect(isLaterShare(session({ createdAt: ts(START - 12 * MIN) }))).toBe(false);
    expect(ownerReminderDue(session({ createdAt: ts(START - 12 * MIN) }), START - 10 * MIN)).toBe(false);
    expect(isLaterShare(session({ createdAt: undefined }))).toBe(false);
  });
  it('marker carries the start time, so an edited time is a new reminder', () => {
    expect(ownerReminderMarkerId('s1', START)).not.toBe(ownerReminderMarkerId('s1', START + 60 * MIN));
  });
});

describe('audience filtering (pure)', () => {
  const now = START - 3 * 60 * MIN;
  it('partners and public reach partners; ghost does not', () => {
    expect(partnerNoticeEligible(session({ privacyMode: 'squad' }), now)).toBe(true);
    expect(partnerNoticeEligible(session({ privacyMode: 'verified_global' }), now)).toBe(true);
    expect(partnerNoticeEligible(session({ privacyMode: 'ghost' }), now)).toBe(false);
    expect(partnerNoticeEligible(session({ privacyMode: undefined }), now)).toBe(false);
  });
  it('"now" shares, past starts and starts beyond 24h get no notice', () => {
    expect(partnerNoticeEligible(session({ createdAt: ts(START - 5 * MIN) }), START - 5 * MIN)).toBe(false);
    expect(partnerNoticeEligible(session(), START + MIN)).toBe(false);
    expect(partnerNoticeEligible(session({ startTime: ts(now + 25 * 60 * MIN) }), now)).toBe(false);
  });
  it('mutual follows only, never the owner, deduped', () => {
    expect(mutualPartners({ followers: ['a', 'b', 'c', 'a', 'owner'], following: ['a', 'c', 'x', 'owner'] }, 'owner')).toEqual(['a', 'c']);
    expect(mutualPartners(undefined, 'owner')).toEqual([]);
  });
});

describe('runTrainingHereReminderPass', () => {
  it('flag off: nothing', async () => {
    const { db } = fakeDb({ flag: false, sessions: { s1: session() } });
    expect(await runTrainingHereReminderPass(db, START - 12 * MIN)).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('reminds the owner once, as a requested training reminder that respects quiet hours; opens the park', async () => {
    genders.owner = 'female';
    const { db } = fakeDb({ flag: true, sessions: { s1: session() } });
    expect(await runTrainingHereReminderPass(db, START - 12 * MIN)).toBe(1);
    expect(await runTrainingHereReminderPass(db, START - 7 * MIN)).toBe(0); // next tick: marker holds
    expect(sendPush).toHaveBeenCalledTimes(1);
    const o = sendPush.mock.calls[0][0] as Record<string, unknown>;
    expect(o).toMatchObject({
      toUids: ['owner'], channel: 'training_reminder', policyKind: 'requested', skipQuietHours: false, rateCapHours: 0,
      deepLink: '/map?openPark=p1',
    });
    expect(o.title).toBe('הגינה מחכה · אימון עליון ב-18:00');
    expect(o.body).toBe('עוד רבע שעה בגן הבנים. את בדרך?');
  });

  it('unknown gender and no workout title: neutral copy; a route opens the route', async () => {
    const { db } = fakeDb({
      flag: true,
      sessions: { r1: session({ parkId: undefined, parkName: undefined, routeId: 'rt1', routeName: 'הירקון', workoutTitle: undefined }) },
    });
    await runTrainingHereReminderPass(db, START - 12 * MIN);
    const o = sendPush.mock.calls[0][0] as Record<string, unknown>;
    expect(o.title).toBe('המסלול מחכה · ב-18:00');
    expect(o.body).toBe('עוד רבע שעה בהירקון. נתראה שם?');
    expect(o.deepLink).toBe('/map?openRoute=rt1');
  });

  it('cancelled after planning: no push', async () => {
    const { db } = fakeDb({ flag: true, sessions: { s1: session({ status: 'cancelled' }) } });
    expect(await runTrainingHereReminderPass(db, START - 12 * MIN)).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('edited time: the old slot stays quiet, the new slot is reminded once', async () => {
    const { db, sessions } = fakeDb({ flag: true, sessions: { s1: session() } });
    sessions.s1 = session({ startTime: ts(START + 60 * MIN) }); // moved 18:00 -> 19:00 before the reminder
    expect(await runTrainingHereReminderPass(db, START - 12 * MIN)).toBe(0);
    expect(await runTrainingHereReminderPass(db, START + 48 * MIN)).toBe(1);
    expect((sendPush.mock.calls[0][0] as { title: string }).title).toContain('19:00');
  });

  it('edited after the reminder went out: a new time gets its own reminder', async () => {
    const { db, sessions } = fakeDb({ flag: true, sessions: { s1: session() } });
    expect(await runTrainingHereReminderPass(db, START - 12 * MIN)).toBe(1);
    sessions.s1 = session({ startTime: ts(START + 60 * MIN) });
    expect(await runTrainingHereReminderPass(db, START + 48 * MIN)).toBe(1);
  });

  it('a "now" share and demo owners get nothing', async () => {
    const { db } = fakeDb({
      flag: true,
      sessions: {
        now1: session({ createdAt: ts(START - 14 * MIN) }),
        demo: session({ userId: 'demo_owner' }),
      },
    });
    expect(await runTrainingHereReminderPass(db, START - 12 * MIN)).toBe(0);
  });
});

describe('partner notice (onTrainingHereShared)', () => {
  const now = START - 3 * 60 * MIN;
  const conn = { followers: ['a', 'b', 'c', 'demo_x'], following: ['a', 'c', 'demo_x', 'z'] };

  it('flag off: nothing', async () => {
    const { db } = fakeDb({ flag: false, conn });
    expect(await handleTrainingHereShared(db, 's1', session(), now)).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('mutual partners only, once each, proactive on the community channel (prefs, quiet hours, daily cap)', async () => {
    genders.owner = 'male';
    genders.a = 'female';
    const { db } = fakeDb({ flag: true, conn });
    expect(await handleTrainingHereShared(db, 's1', session(), now)).toBe(2);
    expect(await handleTrainingHereShared(db, 's1', session(), now)).toBe(0); // retry: markers hold
    const to = sendPush.mock.calls.map((c) => (c[0] as { toUids: string[] }).toUids[0]).sort();
    expect(to).toEqual(['a', 'c']);
    const toA = sendPush.mock.calls.find((c) => (c[0] as { toUids: string[] }).toUids[0] === 'a')![0] as Record<string, unknown>;
    expect(toA).toMatchObject({ channel: 'community', policyKind: 'proactive', skipQuietHours: false, deepLink: '/map?openPark=p1' });
    expect(toA.title).toBe('יואב מגיע ב-18:00 לגן הבנים');
    expect(toA.body).toBe('מצטרפת?');
    const toC = sendPush.mock.calls.find((c) => (c[0] as { toUids: string[] }).toUids[0] === 'c')![0] as Record<string, unknown>;
    expect(toC.body).toBe('מצטרפים?'); // unknown recipient gender: neutral
  });

  it('ghost, "now" shares and non-planned docs notify nobody', async () => {
    const { db } = fakeDb({ flag: true, conn });
    expect(await handleTrainingHereShared(db, 's1', session({ privacyMode: 'ghost' }), now)).toBe(0);
    expect(await handleTrainingHereShared(db, 's2', session({ createdAt: ts(START - 5 * MIN) }), START - 5 * MIN)).toBe(0);
    expect(await handleTrainingHereShared(db, 's3', session({ status: 'cancelled' }), now)).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('partnerNoticeRecipients is what onPlannedActivityCreated excludes', async () => {
    const { db } = fakeDb({ flag: true, conn });
    expect(await partnerNoticeRecipients(db, session(), now)).toEqual(['a', 'c']);
    expect(await partnerNoticeRecipients(db, session({ privacyMode: 'ghost' }), now)).toEqual([]);
  });
});

describe('copy in the push library', () => {
  for (const t of ['training_here_reminder', 'training_here_partner']) {
    it(`${t}: registered, within limits, no slashes or emoji`, () => {
      const e = PUSH_CATALOG_BY_TYPE[t];
      expect(e).toBeTruthy();
      for (const d of e.defaults) {
        expect(d.title.length).toBeLessThanOrEqual(PUSH_TITLE_MAX);
        expect(d.body.length).toBeLessThanOrEqual(PUSH_BODY_MAX);
        expect(`${d.title}${d.body}`).not.toMatch(/[\uD83C-\uD83E][\uDC00-\uDFFF]|\//);
      }
      const male = e.defaults.filter((d) => d.gender === 'male').length;
      const female = e.defaults.filter((d) => d.gender === 'female').length;
      expect(male).toBe(female);
    });
  }
});
