import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Every push sender takes its title/body/deep link from the push library
 * (push-copy.service.ts resolvePushCopy), with the right pushType and the
 * values the copy needs, and stamps the library row on the push. Timing and
 * caps stay each sender's own (covered by their own tests); here
 * resolvePushCopy and sendPush are mocks and Firestore is a permissive fake
 * that returns the configured docs for any query.
 */

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  queries: new Map<string, Array<{ id: string; data: Record<string, unknown> }>>(),
  count: 1,
}));

function makeDoc(path: string): any {
  const id = path.split('/').pop() as string;
  return {
    id,
    path,
    get: async () => ({ exists: state.docs.has(path), id, data: () => state.docs.get(path) }),
    set: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    collection: (sub: string) => makeQuery(`${path}/${sub}`),
  };
}

function makeQuery(coll: string): any {
  const q: any = {};
  for (const m of ['where', 'orderBy', 'limit', 'startAfter', 'startAt', 'endAt', 'select']) q[m] = () => q;
  q.get = async () => {
    const docs = (state.queries.get(coll) ?? []).map((d) => ({ id: d.id, data: () => d.data, ref: makeDoc(`${coll}/${d.id}`) }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  };
  q.count = () => ({ get: async () => ({ data: () => ({ count: state.count }) }) });
  q.doc = (id: string) => makeDoc(`${coll}/${id}`);
  return q;
}

vi.mock('firebase-admin', () => {
  const db = {
    collection: (name: string) => makeQuery(name),
    doc: (path: string) => makeDoc(path),
    getAll: async (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
    batch: () => ({ set: vi.fn(), update: vi.fn(), commit: async () => undefined }),
  };
  const firestoreFn: any = () => db;
  firestoreFn.Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }), now: () => ({ toMillis: () => Date.now() }) };
  firestoreFn.FieldValue = { serverTimestamp: () => 'ts', increment: (n: number) => n, arrayRemove: () => [] };
  firestoreFn.FieldPath = { documentId: () => '__name__' };
  return {
    apps: [{}],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
    messaging: () => ({ sendEachForMulticast: vi.fn(async () => ({ responses: [] })) }),
  };
});
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_o: unknown, fn: unknown) => fn,
  onDocumentUpdated: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('geofire-common', () => ({ geohashQueryBounds: () => [['0', '~']], distanceBetween: () => 0 }));
vi.mock('../services/shabbat.service', async (importOriginal) => {
  // Real observer / motzei-Shabbat helpers; the Shabbat window itself is off.
  const orig = await importOriginal<typeof import('../services/shabbat.service')>();
  return { ...orig, isShabbatOrYomTov: () => false };
});
vi.mock('../lib/resolveUserStepGoal', () => ({ resolveUserStepGoal: async () => 8000 }));

const sendPushMock = vi.fn(async (_opts: any) => ({
  attempted: 1, delivered: 1, failed: 0, skippedGlobalKill: 0, skippedPrefs: 0, skippedQuietHours: 0,
  skippedShabbat: 0, skippedRateCap: 0, skippedDailyCap: 0, tokensPruned: 0,
}));
vi.mock('../services/push.service', () => ({
  sendPush: (opts: any) => sendPushMock(opts),
  isQuietHours: () => false,
}));

const resolveMock = vi.fn(async (pushType: string, _ctx: any) => ({
  pushType,
  title: `T:${pushType}`,
  body: `B:${pushType}`,
  deepLink: `/link/${pushType}`,
  deepLinkId: 'home',
  rowId: `row-${pushType}`,
  source: 'library' as const,
}));
vi.mock('../services/push-copy.service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../services/push-copy.service')>();
  return { ...orig, resolvePushCopy: (t: string, c: any) => resolveMock(t, c) };
});

import { trainingReminderScheduler } from '../trainingReminderScheduler';
import { reminderSweepScheduler } from '../reminderSweepScheduler';
import { retentionScheduler } from '../retentionScheduler';
import { onboardingDropoffDispatcher } from '../onboardingDropoffDispatcher';
import { onLevelUp } from '../onLevelUp';
import { onKudosCreated } from '../onKudosCreated';
import { onGroupMemberJoin } from '../onGroupMemberJoin';
import { onContributionApproved } from '../onContributionApproved';
import { stepGoalNudgeScheduler } from '../stepGoalNudgeScheduler';
import { onPlannedActivityCreated } from '../onPlannedActivityCreated';
import { runWeekStart, weekStartCopyKey } from '../weekStartScheduler';

const run = (fn: unknown, ...args: unknown[]) => (fn as (...a: unknown[]) => Promise<unknown>)(...args);

// Tuesday 20.10.2026 12:02 Israel (09:02Z) — not Shabbat, not quiet hours.
const NOW = new Date('2026-10-20T09:02:00Z');
const USER = {
  core: { name: 'דנה כהן', mainGoal: 'weight_loss' },
  personas: [{ id: 'parent' }],
  onboardingStatus: 'COMPLETED',
  fcmTokens: ['tok'],
};

/** The single sendPush call for a pushType (asserts it used the resolved copy). */
function sentWith(pushType: string) {
  const call = sendPushMock.mock.calls.map((c) => c[0]).find((o) => o.title === `T:${pushType}`);
  expect(call, `no sendPush with the ${pushType} copy`).toBeTruthy();
  expect(call.body).toBe(`B:${pushType}`);
  expect(call.deepLink).toBe(`/link/${pushType}`);
  expect(call.data).toMatchObject({ pushType, copyRowId: `row-${pushType}` });
  return call;
}

function ctxFor(pushType: string) {
  const call = resolveMock.mock.calls.find((c) => c[0] === pushType);
  expect(call, `resolvePushCopy not called for ${pushType}`).toBeTruthy();
  return call![1];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.docs.clear();
  state.queries.clear();
  state.count = 1;
  sendPushMock.mockClear();
  resolveMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('every sender takes its copy from the push library', () => {
  it('trainingReminderScheduler → workout_reminder_day', async () => {
    state.queries.set('userSchedule', [
      { id: 'u1_2026-10-20', data: { userId: 'u1', date: '2026-10-20', entries: [{ type: 'training', scheduledCategories: ['strength'] }] } },
    ]);
    state.docs.set('users/u1', { ...USER, lifestyle: { reminders: { runningTime: '12:00' } } });
    await run(trainingReminderScheduler);
    const ctx = ctxFor('workout_reminder_day');
    expect(ctx.vars).toMatchObject({ '@שם': 'דנה', '@אימון': 'אימון כוח' });
    expect(ctx.audience).toMatchObject({ persona: 'parent', primaryGoal: 'weight_loss' });
    const sent = sentWith('workout_reminder_day');
    expect(sent.toUids).toEqual(['u1']);
    expect(sent.measurement).toMatchObject({ variantId: 'row-workout_reminder_day', copyRowId: 'row-workout_reminder_day', category: 'ScheduledWorkout' });
  });

  it('reminderSweepScheduler pass 1 → workout_reminder_slot, pass 2 → workout_reminder_before', async () => {
    state.docs.set('app_config/feature_flags', {
      enableReminderSweepPush: true,
      reminderSweepWorkoutEntriesEnabled: true,
      reminderSweepLeadMinutes: 10,
    });
    state.queries.set('users', [{ id: 'u1', data: USER }]);
    state.docs.set('users/u2', USER);
    state.queries.set('userSchedule', [
      { id: 'u2_x', data: { userId: 'u2', entries: [{ entryId: 'e1', type: 'training', startTime: '12:10', scheduledCategories: ['cardio'] }] } },
    ]);
    await run(reminderSweepScheduler);
    expect(ctxFor('workout_reminder_slot').vars).toMatchObject({ '@שם': 'דנה', '@שעה': '12:00' });
    expect(sentWith('workout_reminder_slot').measurement.category).toBe('ReminderSweep');
    expect(ctxFor('workout_reminder_before').vars).toMatchObject({ '@אימון': 'ריצה', '@שעה': '12:10' });
    expect(sentWith('workout_reminder_before').measurement.category).toBe('ReminderSweepWorkout');
  });

  it('retentionScheduler → retention_lapse', async () => {
    state.queries.set('users', [{ id: 'u1', data: { ...USER, lastActive: { toMillis: () => NOW.getTime() - 9 * 86_400_000 } } }]);
    await run(retentionScheduler);
    expect(ctxFor('retention_lapse').vars).toMatchObject({ '@שם': 'דנה', '@ימים': '9' });
    expect(sentWith('retention_lapse').toUids).toEqual(['u1']);
  });

  it('onboardingDropoffDispatcher → onboarding_dropoff (routed path)', async () => {
    state.docs.set('app_config/feature_flags', { pushRouting_onboardingDropoff: true });
    state.queries.set('users', [{ id: 'u1', data: { ...USER, onboardingStatus: 'IN_PROGRESS' } }]);
    await run(onboardingDropoffDispatcher);
    expect(ctxFor('onboarding_dropoff').vars).toMatchObject({ '@שם': 'דנה' });
    sentWith('onboarding_dropoff');
  });

  it('onLevelUp → level_up, with the level condition and the program for the deep link', async () => {
    const after = { ...USER, progression: { globalLevel: 5, activePrograms: [{ id: 'enr1', templateId: 'program123', name: 'כוח לכל הגוף' }] } };
    await run(onLevelUp, {
      params: { uid: 'u1' },
      data: { before: { data: () => ({ progression: { globalLevel: 4 } }) }, after: { data: () => after } },
    });
    const ctx = ctxFor('level_up');
    expect(ctx.conditions).toEqual({ level: '5' });
    expect(ctx.params).toEqual({ programId: 'program123' });
    expect(ctx.vars).toMatchObject({ '@רמה': '5', '@תוכנית': 'כוח לכל הגוף' });
    sentWith('level_up');
  });

  it('onKudosCreated → kudos_single, then kudos_bundle', async () => {
    state.docs.set('users/r1', USER);
    const event = { params: { recipientUid: 'r1', kudoId: 'k1' }, data: { data: () => ({ fromUid: 's1', fromName: 'נועה', type: 'high_five' }) } };
    await run(onKudosCreated, event);
    expect(ctxFor('kudos_single').vars).toMatchObject({ '@שולח': 'נועה' });
    sentWith('kudos_single');

    state.count = 2;
    await run(onKudosCreated, event);
    const ctx = ctxFor('kudos_bundle');
    expect(ctx.vars).toMatchObject({ '@כמות': '2', '@עוד': '1' });
    expect(ctx.conditions).toEqual({ others: 'one' });
    sentWith('kudos_bundle');
  });

  it('onGroupMemberJoin → group_join_welcome (joiner) + group_join_admin (leader)', async () => {
    state.docs.set('community_groups/g1', { name: 'רצים בפארק', leaderUserId: 'lead1' });
    state.docs.set('users/j1', USER);
    state.docs.set('users/lead1', { core: { name: 'אבי' } });
    await run(onGroupMemberJoin, { params: { groupId: 'g1', uid: 'j1' }, data: { data: () => ({ name: 'יואב לוי', role: 'member' }) } });
    expect(ctxFor('group_join_welcome')).toMatchObject({ uid: 'j1', vars: { '@קבוצה': 'רצים בפארק' }, params: { groupId: 'g1' } });
    expect(sentWith('group_join_welcome').toUids).toEqual(['j1']);
    expect(ctxFor('group_join_admin')).toMatchObject({ uid: 'lead1', vars: { '@מצטרף': 'יואב', '@קבוצה': 'רצים בפארק' } });
    expect(sentWith('group_join_admin').toUids).toEqual(['lead1']);
  });

  it('onContributionApproved → contribution_approved', async () => {
    await run(onContributionApproved, {
      params: { id: 'c1' },
      data: {
        before: { data: () => ({ status: 'pending' }) },
        after: { data: () => ({ status: 'approved', type: 'new_location', userId: 'u1', approvedParkId: 'p1', parkName: 'גן הבנים' }) },
      },
    });
    expect(ctxFor('contribution_approved')).toMatchObject({ vars: { '@מקום': 'גן הבנים' }, params: { parkId: 'p1' } });
    sentWith('contribution_approved');
  });

  it('stepGoalNudgeScheduler → step_goal with the bucket condition', async () => {
    state.docs.set('app_config/feature_flags', { stepGoalNudgeEnabled: true, stepGoalTestUids: ['u1'] });
    state.docs.set('users/u1', { ...USER, progression: { currentStreak: 1 } });
    state.docs.set('dailyActivity/u1_2026-10-20', { steps: 4000 });
    await run(stepGoalNudgeScheduler);
    const ctx = ctxFor('step_goal');
    expect(ctx.conditions).toEqual({ bucket: 'mid' });
    expect(ctx.params).toEqual({ targetSteps: 4000 });
    expect(ctx.vars['@רצף']).toBeUndefined(); // streak 1 → no streak copy
    const sent = sentWith('step_goal');
    expect(sent.measurement).toMatchObject({ variantId: 'row-step_goal', category: 'Daily_Goal' });
  });

  it('onPlannedActivityCreated → partner_plan with the activity condition and the session time', async () => {
    state.docs.set('app_config/feature_flags', { socialActivityNearbyPushEnabled: true });
    state.docs.set('connections/creator1', { followers: ['f1'] });
    state.docs.set('users/f1', USER);
    await run(onPlannedActivityCreated, {
      params: { sessionId: 's1' },
      data: {
        data: () => ({
          userId: 'creator1',
          displayName: 'נועה ברק',
          parkId: 'p1',
          parkName: 'גן הבנים',
          activityType: 'running',
          privacyMode: 'squad',
          startTime: { toDate: () => new Date('2026-10-20T15:30:00Z') },
        }),
      },
    });
    const ctx = ctxFor('partner_plan');
    expect(ctx.conditions).toEqual({ activity: 'running' });
    expect(ctx.vars).toMatchObject({ '@שולח': 'נועה', '@מקום': 'גן הבנים', '@שעה': '18:30' });
    expect(ctx.params).toMatchObject({ parkId: 'p1' });
    sentWith('partner_plan');
  });

  it('weekStartScheduler → week_start, one broadcast key per week, observers only', async () => {
    // Sat 16.01.2027 21:15 Israel — motzei Shabbat, plain week.
    const motzei = new Date('2027-01-16T19:15:00Z');
    state.queries.set('users', [{ id: 'obs1', data: { ...USER, settings: { shabbatObserver: true } } }]);
    await runWeekStart(motzei);
    const ctx = ctxFor('week_start');
    expect(ctx.uid).toBe(weekStartCopyKey(motzei));
    expect(ctx.uid).toMatch(/^week-\d+$/);
    expect(weekStartCopyKey(new Date(motzei.getTime() + 7 * 86_400_000))).not.toBe(ctx.uid);
    const sent = sentWith('week_start');
    expect(sent.toUids).toEqual(['obs1']);
    expect(sent.channel).toBe('week_start');
    expect(sent.rateCapHours).toBe(72);
  });

  it('no copy that fits → nothing is sent', async () => {
    resolveMock.mockResolvedValueOnce(null as any);
    await run(onContributionApproved, {
      params: { id: 'c1' },
      data: {
        before: { data: () => ({ status: 'pending' }) },
        after: { data: () => ({ status: 'approved', type: 'new_location', userId: 'u1', approvedParkId: 'p1' }) },
      },
    });
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
