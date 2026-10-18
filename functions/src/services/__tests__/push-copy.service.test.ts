import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * push-copy.service — the Firestore side of the push library: legacy-row
 * adaptation, the 10-minute cache, read-failure fallback, recipient helpers.
 * (Selection rules themselves: src/features/notifications/push-library/__tests__.)
 */

const state = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  reads: 0,
  failNext: false,
}));

vi.mock('firebase-admin', () => {
  const db = {
    collection: (_name: string) => ({
      get: async () => {
        state.reads++;
        if (state.failNext) {
          state.failNext = false;
          throw new Error('unavailable');
        }
        return { size: state.docs.length, docs: state.docs.map((d) => ({ id: d.id, data: () => d.data })) };
      },
      doc: (id: string) => ({
        get: async () => {
          const d = state.docs.find((x) => x.id === id);
          return { exists: !!d, data: () => d?.data };
        },
      }),
    }),
  };
  return { apps: [{}], initializeApp: vi.fn(), firestore: () => db };
});
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  __resetPushCopyCache,
  adaptLibraryDoc,
  audienceFromUserData,
  firstNameFromUserData,
  getPushLibraryRows,
  pushCopyData,
  resolvePushCopy,
  PUSH_COPY_CACHE_TTL_MS,
} from '../push-copy.service';

beforeEach(() => {
  state.docs = [];
  state.reads = 0;
  state.failNext = false;
  __resetPushCopyCache();
});

describe('adaptLibraryDoc', () => {
  it('reads a push-library row', () => {
    const row = adaptLibraryDoc('r1', {
      pushType: 'level_up',
      title: 'עלית לרמה @רמה',
      body: 'ממשיכים.',
      deepLink: 'progression',
      audience: { persona: ['high_tech', 'generic'], ageBand: ['30_44'] },
      conditions: { level: ['5'] },
      timeWindow: { start: '08:00', end: '21:00' },
      active: true,
    });
    expect(row).toMatchObject({
      id: 'r1',
      pushType: 'level_up',
      deepLink: 'progression',
      audience: { persona: ['office_worker'], ageBand: ['30_44'] }, // alias normalized, generic dropped
      conditions: { level: ['5'] },
      timeWindow: { start: '08:00', end: '21:00' },
      active: true,
      archived: false,
    });
  });

  it('ignores an unknown pushType and the dormant Inactivity rows', () => {
    expect(adaptLibraryDoc('x', { pushType: 'nope', title: 'a', body: 'b' })).toBeNull();
    expect(adaptLibraryDoc('d', { triggerType: 'Inactivity', text: '@שם, בוא/י', persona: 'parent' })).toBeNull();
  });

  it('keeps the original Daily_Goal rows working (step_goal, bucket condition, persona audience)', () => {
    const row = adaptLibraryDoc('dg', {
      triggerType: 'Daily_Goal',
      activityType: 'walking',
      dailyGoalBucket: 'mid',
      persona: 'office_worker',
      text: 'עוד {steps_left} צעדים',
    });
    expect(row).toMatchObject({
      pushType: 'step_goal',
      title: 'יעד הצעדים של היום',
      body: 'עוד @צעדים_שנותרו צעדים',
      conditions: { bucket: ['mid'] },
      audience: { persona: ['office_worker'] },
    });
    expect(adaptLibraryDoc('dg2', { triggerType: 'Daily_Goal', activityType: 'strength', dailyGoalBucket: 'mid', text: 'x' })).toBeNull();
  });

  it('keeps the original Future_Partner_Plan rows working (partner_plan, activity condition)', () => {
    const row = adaptLibraryDoc('fp', {
      triggerType: 'Future_Partner_Plan',
      activityType: 'running',
      persona: 'generic',
      text: '{creatorName} רץ ב{placeName}',
      archived: true,
    });
    expect(row).toMatchObject({
      pushType: 'partner_plan',
      body: '@שולח רץ ב@מקום',
      conditions: { activity: ['running'] },
      audience: null,
      archived: true,
    });
  });
});

describe('library cache + resolvePushCopy', () => {
  it('reads the collection once per 10 minutes', async () => {
    state.docs = [{ id: 'a', data: { pushType: 'retention_lapse', title: 'א', body: 'ב', active: true } }];
    const t0 = 1_000_000;
    await getPushLibraryRows(t0);
    await getPushLibraryRows(t0 + PUSH_COPY_CACHE_TTL_MS - 1);
    expect(state.reads).toBe(1);
    await getPushLibraryRows(t0 + PUSH_COPY_CACHE_TTL_MS + 1);
    expect(state.reads).toBe(2);
  });

  it('a failed read falls back to the code defaults and is not cached', async () => {
    state.failNext = true;
    const copy = await resolvePushCopy('retention_lapse', { uid: 'u1', vars: { '@שם': 'דנה' } });
    expect(copy?.source).toBe('default');
    state.docs = [{ id: 'lib1', data: { pushType: 'retention_lapse', title: 'חוזרים?', body: 'קצר וקל.', active: true } }];
    const next = await resolvePushCopy('retention_lapse', { uid: 'u1' });
    expect(next).toMatchObject({ rowId: 'lib1', source: 'library', title: 'חוזרים?' });
  });

  it('archived rows are ignored', async () => {
    state.docs = [{ id: 'old', data: { pushType: 'retention_lapse', title: 'ישן', body: 'ישן', archived: true, active: false } }];
    const copy = await resolvePushCopy('retention_lapse', { uid: 'u1' });
    expect(copy?.source).toBe('default');
  });

  it('a legacy row with a gender slash is skipped in favour of the rewritten default', async () => {
    state.docs = [
      { id: 'legacy', data: { triggerType: 'Daily_Goal', activityType: 'walking', dailyGoalBucket: 'mid', persona: 'generic', text: 'באמצע הדרך! עוד @צעדים_שנותרו צעדים ואת/ה ביעד' } },
    ];
    const copy = await resolvePushCopy('step_goal', {
      uid: 'u1',
      conditions: { bucket: 'mid' },
      vars: { '@צעדים_שנותרו': '2,000', '@דקות': '18' },
    });
    expect(copy?.source).toBe('default');
    expect(copy?.body).not.toContain('/');
  });

  it('unknown pushType → null', async () => {
    expect(await resolvePushCopy('nope', { uid: 'u' })).toBeNull();
  });

  it('pushCopyData tags the FCM payload with the row', () => {
    expect(
      pushCopyData({ pushType: 'level_up', rowId: 'r9', title: 't', body: 'b', deepLink: '/', deepLinkId: 'home', source: 'library' }),
    ).toEqual({ pushType: 'level_up', copyRowId: 'r9' });
  });
});

describe('recipient helpers', () => {
  it('audience from a users doc', () => {
    const a = audienceFromUserData(
      { personas: [{ id: 'senior' }], core: { birthDate: { toMillis: () => Date.UTC(1990, 5, 1) }, mainGoal: 'weight_loss' } },
      new Date('2026-10-18T00:00:00Z'),
    );
    expect(a).toEqual({ persona: 'vatikim', ageBand: '30_44', primaryGoal: 'weight_loss' });
    expect(audienceFromUserData({})).toEqual({ persona: null, ageBand: null, primaryGoal: null });
  });

  it('first name only', () => {
    expect(firstNameFromUserData({ core: { name: '  דנה  כהן ' } })).toBe('דנה');
    expect(firstNameFromUserData({})).toBe('');
  });
});
