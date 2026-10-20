import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Demo world guards (20.10.2026, agent-briefs/demo-users-design.md PR 1) —
 * every trigger that fans a user's activity OUT stays inside the demo world,
 * and real users get exactly today's behaviour. One case per guard, plus a
 * "real user unchanged" control next to each.
 *
 * In-memory Firestore (helpers/fake-firestore.ts); v2 trigger wrappers are
 * unwrapped to their plain handlers; push delivery is mocked (sendPush's own
 * demo filter is covered by services/__tests__/push.service.demo.test.ts).
 */

vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_o: unknown, h: unknown) => h,
  onDocumentCreated: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, h: unknown) => h }));

const sendPushMock = vi.fn(async (_o: unknown) => ({ delivered: 1 }));
vi.mock('../services/push.service', () => ({ sendPush: (o: unknown) => sendPushMock(o) }));
vi.mock('../services/push-copy.service', () => ({
  loadPushRecipient: async () => ({ firstName: 'x', audience: {} }),
  loadPushSubjectGender: async () => null,
  resolvePushCopy: async () => ({ title: 't', body: 'b', deepLink: '/home', rowId: 'r1', pushType: 'kudos' }),
  pushCopyData: () => ({}),
}));

import { store, writtenEvent } from './helpers/fake-firestore';
import { onMilitaryDeclarationWritten } from '../militaryReserveLeague';
import { onWorkoutCreateExerciseStats, onExerciseSwapCreated } from '../exerciseStats';
import { onUnitWrite } from '../onUnitWrite';
import { onAuthorityWrite } from '../onAuthorityWrite';
import { unitLeagueRollup } from '../unitLeagueRollup';
import { onKudosCreated } from '../onKudosCreated';
import { userPublicSync } from '../userPublicSync';
import { chatMessageNotification } from '../chatMessageNotification';
import { onGroupMemberJoin } from '../onGroupMemberJoin';

const run = (fn: unknown, ev: unknown) => (fn as (e: unknown) => Promise<void>)(ev);
const RESERVE = 'community_groups/military_reserve_general/members';

beforeEach(() => {
  store.clear();
  sendPushMock.mockClear();
});

describe('militaryReserveLeague — demo soldiers never join the real national reserve league', () => {
  it('demo uid declaring reserve → no membership written', async () => {
    await run(onMilitaryDeclarationWritten, writtenEvent({ uid: 'demo_s1' }, null, { status: 'reserve', orgId: 'demo-unit' }));
    expect(store.has(`${RESERVE}/demo_s1`)).toBe(false);
    expect(store.has('user_memberships/demo_s1')).toBe(false);
  });
  it('a declaration under a demo org → no membership written (even for a non-prefixed uid)', async () => {
    await run(onMilitaryDeclarationWritten, writtenEvent({ uid: 'u-odd' }, null, { status: 'reserve', orgId: 'demo-unit' }));
    expect(store.has(`${RESERVE}/u-odd`)).toBe(false);
  });
  it('real reservist → joins as today', async () => {
    await run(onMilitaryDeclarationWritten, writtenEvent({ uid: 'real1' }, null, { status: 'reserve', orgId: 'brigade-1' }));
    expect(store.has(`${RESERVE}/real1`)).toBe(true);
    expect(store.get('user_memberships/real1')?.groupIds).toEqual(['military_reserve_general']);
  });
});

describe('exerciseStats — demo workouts / swaps never feed the global counters', () => {
  const workout = (userId: string) => ({
    userId,
    segments: [{ kind: 'strength', actual: { exerciseLog: [{ exerciseId: 'ex1', confirmedReps: [10, 10] }] } }],
  });
  it('demo workout → no exercise_stats, no processed marker', async () => {
    await run(onWorkoutCreateExerciseStats, { params: { docId: 'w1' }, data: { data: () => workout('demo_c1') } });
    expect(Array.from(store.keys()).some((k) => k.startsWith('exercise_stats'))).toBe(false);
  });
  it('real workout → counted as today', async () => {
    await run(onWorkoutCreateExerciseStats, { params: { docId: 'w2' }, data: { data: () => workout('real1') } });
    expect(store.get('exercise_stats/ex1')?.prescribedCompleted).toBe(1);
  });
  it('demo swap → no exercise_stats', async () => {
    await run(onExerciseSwapCreated, {
      params: { swapId: 's1' },
      data: { data: () => ({ userId: 'demo_c1', fromExerciseId: 'a', toExerciseId: 'b', direction: 'easier' }) },
    });
    expect(Array.from(store.keys()).some((k) => k.startsWith('exercise_stats'))).toBe(false);
  });
  it('real swap → counted as today', async () => {
    await run(onExerciseSwapCreated, {
      params: { swapId: 's2' },
      data: { data: () => ({ userId: 'real1', fromExerciseId: 'a', toExerciseId: 'b', direction: 'easier' }) },
    });
    expect(store.has('exercise_stats_processed/swap_s2')).toBe(true);
  });
});

describe('onUnitWrite / onAuthorityWrite — demo units never enter the public unit search', () => {
  it('a unit of a demo tenant (isDemo) → no unitDirectory entry, a stale one removed', async () => {
    store.set('tenants/t-flagged', { isDemo: true });
    store.set('tenants/t-flagged/units/u1', { name: 'פלוגת דמו' });
    store.set('unitDirectory/t-flagged__u1', { name: 'stale' });
    await run(onUnitWrite, writtenEvent({ tenantId: 't-flagged', unitId: 'u1' }, null, { name: 'פלוגת דמו' }));
    expect(store.has('unitDirectory/t-flagged__u1')).toBe(false);
    expect(store.get('tenants/t-flagged')?.unitCount).toBe(1); // unit count still maintained
  });
  it('a unit under a demo- tenant id → no unitDirectory entry', async () => {
    await run(onUnitWrite, writtenEvent({ tenantId: 'demo-unit', unitId: 'c1' }, null, { name: 'פלוגה א' }));
    expect(store.has('unitDirectory/demo-unit__c1')).toBe(false);
  });
  it('a real unit → synced as today', async () => {
    store.set('tenants/brigade-1', {});
    await run(onUnitWrite, writtenEvent({ tenantId: 'brigade-1', unitId: 'c1' }, null, { name: 'פלוגה א' }));
    expect(store.get('unitDirectory/brigade-1__c1')?.name).toBe('פלוגה א');
  });
  it('a demo military authority → no brigade entry; a real one → synced', async () => {
    store.set('unitDirectory/demo-unit', { name: 'stale' });
    await run(onAuthorityWrite, writtenEvent({ authorityId: 'demo-unit' }, null, { name: 'יחידת דמו', type: 'military_unit', isDemo: true }));
    expect(store.has('unitDirectory/demo-unit')).toBe(false);

    store.set('authorities/b1', { name: 'חטיבה 1', type: 'military_unit' });
    await run(onAuthorityWrite, writtenEvent({ authorityId: 'b1' }, null, { name: 'חטיבה 1', type: 'military_unit' }));
    expect(store.get('unitDirectory/b1')?.level).toBe('brigade');
  });
});

describe('unitLeagueRollup — demo reservists never count toward a real unit', () => {
  const today = new Date().toISOString().slice(0, 10);
  it('three active real reservists unlock the brigade; demo ones next to them are ignored', async () => {
    store.set('unitDirectory/b1', { level: 'brigade', orgId: 'b1', unitId: null });
    store.set('unitDirectory/demo-unit', { level: 'brigade', orgId: 'demo-unit', unitId: null, isDemo: true });
    for (const uid of ['r1', 'r2', 'r3']) {
      store.set(`military_declarations/${uid}`, { status: 'reserve', orgId: 'b1', unitPathIds: [] });
      store.set(`dailyActivity/${uid}_${today}`, { steps: 7000 });
    }
    for (const uid of ['demo_s1', 'demo_s2']) {
      store.set(`military_declarations/${uid}`, { status: 'reserve', orgId: 'b1', unitPathIds: [] }); // even mis-pointed at a real org
      store.set(`dailyActivity/${uid}_${today}`, { steps: 70000 });
    }
    store.set('military_declarations/x9', { status: 'reserve', orgId: 'demo-unit', unitPathIds: [] });
    store.set(`dailyActivity/x9_${today}`, { steps: 5000 });

    await run(unitLeagueRollup, {});
    const agg = store.get('unit_league_aggregates/b1');
    expect(agg?.activeParticipantCount).toBe(3);
    expect(agg?.avgSteps).toBe(1000); // 7000 / 7-day window — the demo 70,000s are not in it
    expect(store.has('unit_league_aggregates/demo-unit')).toBe(false);
  });
});

describe('onKudosCreated — a demo sender reaches only viewer accounts', () => {
  const ev = (recipientUid: string, fromUid: string) => ({
    params: { recipientUid, kudoId: 'k1' },
    data: { data: () => ({ fromUid, fromName: 'דמו', type: 'high_five' }) },
  });
  it('demo → real user: no push', async () => {
    await run(onKudosCreated, ev('real1', 'demo_c1'));
    expect(sendPushMock).not.toHaveBeenCalled();
  });
  it('demo → registered viewer: pushed', async () => {
    store.set('demo_registry/viewers', { uids: ['viewer1'] });
    await run(onKudosCreated, ev('viewer1', 'demo_c1'));
    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });
  it('anyone → demo user: no push', async () => {
    await run(onKudosCreated, ev('demo_c2', 'real1'));
    expect(sendPushMock).not.toHaveBeenCalled();
  });
  it('real → real: pushed as today', async () => {
    await run(onKudosCreated, ev('real2', 'real1'));
    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });
});

describe('userPublicSync — demo users are never in the public user search', () => {
  it('a demo user (by uid or by core.demo) gets no userPublic mirror, whatever discoverable says', async () => {
    store.set('userPublic/demo_c1', { name: 'stale' });
    await run(userPublicSync, writtenEvent({ uid: 'demo_c1' }, null, { core: { name: 'נועה', discoverable: true } }));
    expect(store.has('userPublic/demo_c1')).toBe(false);
    await run(userPublicSync, writtenEvent({ uid: 'odd' }, null, { core: { name: 'x', demo: { v: 1 } } }));
    expect(store.has('userPublic/odd')).toBe(false);
  });
  it('a real discoverable user is mirrored as today', async () => {
    await run(userPublicSync, writtenEvent({ uid: 'real1' }, null, { core: { name: 'דנה' } }));
    expect(store.get('userPublic/real1')?.name).toBe('דנה');
  });
});

describe('chatMessageNotification — a demo sender notifies only the demo world', () => {
  const ev = (senderUid: string) => ({
    params: { chatId: 'c1', messageId: 'm1' },
    data: { data: () => ({ senderUid, senderName: 'דמו', text: 'יוצאים?' }) },
  });
  const pushedTo = () => sendPushMock.mock.calls.flatMap((c: any) => c[0].toUids);
  beforeEach(() => {
    store.set('app_config/feature_flags', { chatNotificationsEnabled: true, pushRouting_chatMessageNotification: true });
    store.set('chats/c1', { participants: ['demo_c1', 'demo_c2', 'viewer1', 'real1'], type: 'group' });
    store.set('demo_registry/viewers', { uids: ['viewer1'] });
  });
  it('demo sender → demo users + viewer only, never the real participant', async () => {
    await run(chatMessageNotification, ev('demo_c1'));
    expect(pushedTo().sort()).toEqual(['demo_c2', 'viewer1']);
  });
  it('real sender → every other participant, as today', async () => {
    await run(chatMessageNotification, ev('real1'));
    expect(pushedTo().sort()).toEqual(['demo_c1', 'demo_c2', 'viewer1']); // sendPush itself then drops the demo uids
  });
});

describe('onGroupMemberJoin — a demo joiner never alerts a real group admin', () => {
  const ev = (uid: string) => ({ params: { groupId: 'g1', uid }, data: { data: () => ({ name: 'דמו', role: 'member' }) } });
  const pushedTo = () => sendPushMock.mock.calls.flatMap((c: any) => c[0].toUids);
  it('demo joiner, real admin → welcome only (to the demo joiner), no admin alert', async () => {
    store.set('community_groups/g1', { name: 'קבוצה', createdBy: 'real-admin' });
    await run(onGroupMemberJoin, ev('demo_c1'));
    expect(pushedTo()).toEqual(['demo_c1']);
  });
  it('real joiner, real admin → welcome + admin alert, as today', async () => {
    store.set('community_groups/g1', { name: 'קבוצה', createdBy: 'real-admin' });
    await run(onGroupMemberJoin, ev('real1'));
    expect(pushedTo()).toEqual(['real1', 'real-admin']);
  });
});
