import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), { FieldValue: { serverTimestamp: () => 'TS' } }),
}));
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentUpdated: (_o: unknown, fn: unknown) => fn }));

const sendPush = vi.fn(async (_o: unknown) => ({ attempted: 1, delivered: 1 }));
vi.mock('../services/push.service', () => ({ sendPush: (o: unknown) => sendPush(o) }));
const resolvePushCopy = vi.fn(async (pushType: string, _ctx: unknown) => ({
  title: `t:${pushType}`, body: 'b', deepLink: '/community/g1', pushType, rowId: 'r1',
}));
vi.mock('../services/push-copy.service', () => ({
  resolvePushCopy: (t: string, c: unknown) => resolvePushCopy(t, c),
  pushCopyData: (c: { pushType: string; rowId: string }) => ({ pushType: c.pushType, copyRowId: c.rowId }),
  loadPushRecipient: async () => ({ audience: { gender: 'female' }, firstName: 'דנה' }),
}));

import {
  sessionStartMs, reminderRecipients, newlyPromoted, cancellationRecipients, reminderScanDates, sessionPushMarkerId,
} from '../sessionPushes/session-time';
import { handleSessionAttendanceUpdate } from '../onSessionAttendanceUpdate';
import { runSessionReminderPass } from '../sessionReminderScheduler';
import { PUSH_CATALOG_BY_TYPE, PUSH_TITLE_MAX, PUSH_BODY_MAX } from '../shared/push-library.core';

// 2026-10-22 18:00 Israel (UTC+3, DST ends 25.10) = 15:00Z.
const START = Date.UTC(2026, 9, 22, 15, 0);
const MIN = 60_000;

describe('session-time (pure)', () => {
  it('converts Israel local time to ms, DST aware', () => {
    expect(sessionStartMs('2026-10-22', '18:00')).toBe(START);
    expect(sessionStartMs('2026-12-01', '18:00')).toBe(Date.UTC(2026, 11, 1, 16, 0)); // winter UTC+2
    expect(sessionStartMs('bad', '18:00')).toBeNull();
    expect(sessionStartMs('2026-10-22', '25:00')).toBeNull();
  });
  it('reminds only inside the 5-15 minute window, never a cancelled session', () => {
    const att = { date: '2026-10-22', time: '18:00', attendees: ['a', 'b'] };
    expect(reminderRecipients(att, START - 15 * MIN)).toEqual(['a', 'b']);
    expect(reminderRecipients(att, START - 10 * MIN)).toEqual(['a', 'b']);
    expect(reminderRecipients(att, START - 16 * MIN)).toEqual([]);
    expect(reminderRecipients(att, START - 5 * MIN)).toEqual([]);
    expect(reminderRecipients(att, START + MIN)).toEqual([]);
    expect(reminderRecipients({ ...att, cancelled: true }, START - 10 * MIN)).toEqual([]);
    expect(reminderRecipients({ ...att, attendees: undefined }, START - 10 * MIN)).toEqual([]);
  });
  it('scan dates include tomorrow across midnight', () => {
    expect(reminderScanDates(Date.UTC(2026, 9, 22, 12, 0))).toEqual(['2026-10-22']);
    expect(reminderScanDates(Date.UTC(2026, 9, 22, 20, 55))).toEqual(['2026-10-22', '2026-10-23']); // 23:55 IL
  });
  it('detects promotion from the waitlist only', () => {
    const before = { attendees: ['a'], waitlist: ['b', 'c'] };
    expect(newlyPromoted(before, { attendees: ['a', 'b'], waitlist: ['c'] })).toEqual(['b']);
    expect(newlyPromoted(before, { attendees: ['a', 'x'], waitlist: ['b', 'c'] })).toEqual([]); // a direct join is not a promotion
    expect(newlyPromoted(before, { attendees: ['a'], waitlist: ['c'] })).toEqual([]); // left the list
    expect(newlyPromoted(before, { attendees: ['a', 'b'], waitlist: ['c'], cancelled: true })).toEqual([]);
  });
  it('cancellation fires once, on the flip', () => {
    expect(cancellationRecipients({ attendees: ['a'] }, { attendees: ['a'], waitlist: ['b'], cancelled: true })).toEqual(['a', 'b']);
    expect(cancellationRecipients({ cancelled: true, attendees: ['a'] }, { cancelled: true, attendees: ['a'] })).toEqual([]);
    expect(cancellationRecipients({ attendees: ['a'] }, { attendees: ['a'] })).toEqual([]);
  });
  it('marker ids are per kind / session / person', () => {
    expect(sessionPushMarkerId('session_reminder', 'g', 's', 'u')).toBe('session_reminder__g__s__u');
  });
});

describe('copy in the push library', () => {
  for (const t of ['session_reminder', 'session_cancelled', 'session_waitlist_promoted']) {
    it(`${t}: registered, within limits, gendered pair complete`, () => {
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

// ── tiny in-memory Firestore for the handlers ──
function fakeDb(opts: { flag: boolean; group?: Record<string, unknown> | null; attendance?: Array<{ id: string; groupId: string; data: Record<string, unknown> }> }) {
  const markers = new Set<string>();
  const db = {
    doc: (path: string) => ({
      get: async () => {
        if (path === 'app_config/feature_flags') return { exists: true, data: () => ({ enableSessionPushes: opts.flag }) };
        if (path.startsWith('community_groups/')) {
          return opts.group === null ? { exists: false } : { exists: true, data: () => opts.group ?? { name: 'רצים בפארק' } };
        }
        return { exists: false };
      },
    }),
    collection: (_c: string) => ({
      doc: (id: string) => ({
        create: async () => {
          if (markers.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
          markers.add(id);
        },
      }),
    }),
    collectionGroup: () => ({
      where: () => ({
        get: async () => ({
          size: opts.attendance?.length ?? 0,
          docs: (opts.attendance ?? []).map((a) => ({ id: a.id, ref: { parent: { parent: { id: a.groupId } } }, data: () => a.data })),
        }),
      }),
    }),
  };
  return { db: db as never, markers };
}

beforeEach(() => { sendPush.mockClear(); resolvePushCopy.mockClear(); });

describe('handleSessionAttendanceUpdate', () => {
  const before = { attendees: ['a'], waitlist: ['b'], time: '18:00', date: '2026-10-22' };

  it('flag off: nothing is sent', async () => {
    const { db } = fakeDb({ flag: false });
    await handleSessionAttendanceUpdate(db, 'g1', 's1', before, { ...before, attendees: ['a', 'b'], waitlist: [] });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('promoted: one social push to the promoted person; a retry does not double-send', async () => {
    const { db } = fakeDb({ flag: true });
    const after = { ...before, attendees: ['a', 'b'], waitlist: [] };
    await handleSessionAttendanceUpdate(db, 'g1', 's1', before, after);
    await handleSessionAttendanceUpdate(db, 'g1', 's1', before, after);
    expect(sendPush).toHaveBeenCalledTimes(1);
    const sent = sendPush.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({ toUids: ['b'], channel: 'social', rateCapHours: 0, policyKind: 'requested', skipQuietHours: false });
    expect(resolvePushCopy.mock.calls[0][0]).toBe('session_waitlist_promoted');
    expect((resolvePushCopy.mock.calls[0][1] as { vars: Record<string, string> }).vars).toMatchObject({ '@קבוצה': 'רצים בפארק', '@שעה': '18:00', '@שם': 'דנה' });
  });

  it('cancelled: everyone booked or waiting, skipping demo users', async () => {
    const { db } = fakeDb({ flag: true });
    await handleSessionAttendanceUpdate(db, 'g1', 's1', before, { ...before, attendees: ['a', 'demo_x'], cancelled: true });
    const to = sendPush.mock.calls.map((c) => (c[0] as { toUids: string[] }).toUids[0]).sort();
    expect(to).toEqual(['a', 'b']);
    expect(resolvePushCopy.mock.calls.every((c) => c[0] === 'session_cancelled')).toBe(true);
  });

  it('ephemeral or missing groups get nothing', async () => {
    const eph = fakeDb({ flag: true, group: { name: 'x', type: 'ephemeral' } });
    const gone = fakeDb({ flag: true, group: null });
    await handleSessionAttendanceUpdate(gone.db, 'g1', 's1', before, { ...before, cancelled: true });
    await handleSessionAttendanceUpdate(eph.db, 'g1', 's1', before, { ...before, cancelled: true });
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe('runSessionReminderPass', () => {
  const att = { id: '2026-10-22_18-00', groupId: 'g1', data: { date: '2026-10-22', time: '18:00', attendees: ['a', 'b'] } };

  it('flag off: no scan, no push', async () => {
    const { db } = fakeDb({ flag: false, attendance: [att] });
    expect(await runSessionReminderPass(db, START - 12 * MIN)).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('reminds booked attendees once on the training_reminder channel as a requested reminder', async () => {
    const { db } = fakeDb({ flag: true, attendance: [att] });
    expect(await runSessionReminderPass(db, START - 12 * MIN)).toBe(2);
    expect(await runSessionReminderPass(db, START - 7 * MIN)).toBe(0); // next tick: markers hold
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendPush.mock.calls[0][0]).toMatchObject({ channel: 'training_reminder', policyKind: 'requested', rateCapHours: 0 });
  });

  it('too early or already started: nothing', async () => {
    const { db } = fakeDb({ flag: true, attendance: [att] });
    expect(await runSessionReminderPass(db, START - 40 * MIN)).toBe(0);
    expect(await runSessionReminderPass(db, START + 2 * MIN)).toBe(0);
  });
});
