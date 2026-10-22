import { describe, it, expect, vi, beforeEach } from 'vitest';

const joinGroup = vi.fn();
const consumeSessionInvitation = vi.fn();
const joinViaDeepLink = vi.fn();
const setMembershipReady = vi.fn();

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: async () => 'tok' } } }));
vi.mock('@/features/arena/services/group.service', () => ({ joinGroup: (...a: unknown[]) => joinGroup(...a) }));
vi.mock('@/features/arena/services/group-invitation.service', () => ({
  consumeSessionInvitation: (...a: unknown[]) => consumeSessionInvitation(...a),
}));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({
  useSharedSession: { getState: () => ({ joinViaDeepLink, setMembershipReady }) },
}));

import { consumePendingInvites, hasPendingInvite, __resetPendingInvitesForTest } from '../consume-pending-invites';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetPendingInvitesForTest();
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe('consumePendingInvites (P1-8)', () => {
  it('nothing pending → null', async () => {
    expect(hasPendingInvite()).toBe(false);
    expect(await consumePendingInvites({ uid: 'u' })).toBeNull();
  });

  it('invite code → /api/join/confirm → group page; two callers share ONE request', async () => {
    localStorage.setItem('pending_invite_code', 'ABCD12');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, groupId: 'g1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([consumePendingInvites({ uid: 'u' }), consumePendingInvites({ uid: 'u' })]);
    expect(a).toBe('/home?openGroupDrawer=g1&joined=true');
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem('pending_invite_code')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('session token → joins, group page by id (no celebration); key removed only after success', async () => {
    localStorage.setItem('pending_session_token', 'si_X');
    consumeSessionInvitation.mockImplementation(async () => {
      expect(localStorage.getItem('pending_session_token')).toBe('si_X');
      return { groupId: 'g2', attendanceId: 'a1' };
    });
    expect(await consumePendingInvites({ uid: 'u', displayName: 'דנה' })).toBe('/home?openGroupDrawer=g2');
    expect(joinViaDeepLink).toHaveBeenCalledWith('g2', 'a1', [], {}, '');
    expect(localStorage.getItem('pending_session_token')).toBeNull();
  });

  it('run invite → map', async () => {
    localStorage.setItem('pending_session_token', 'si_Y');
    consumeSessionInvitation.mockResolvedValue({ groupId: 'g3', attendanceId: 'a', source: 'run-invite', activityType: 'walking' });
    expect(await consumePendingInvites({ uid: 'u' })).toBe('/map?openRun=walking');
  });

  it('failed session token → back to the session page (shows the reason)', async () => {
    localStorage.setItem('pending_session_token', 'si_Z');
    consumeSessionInvitation.mockRejectedValue(new Error('invitation-expired'));
    expect(await consumePendingInvites({ uid: 'u' })).toBe('/session/si_Z');
  });

  it('group id → joinGroup → group page', async () => {
    localStorage.setItem('pending_group_id', 'g4');
    joinGroup.mockResolvedValue(undefined);
    expect(await consumePendingInvites({ uid: 'u', displayName: 'אבי' })).toBe('/home?openGroupDrawer=g4&joined=true');
    expect(joinGroup).toHaveBeenCalledWith('g4', 'u', 'אבי');
  });
});
