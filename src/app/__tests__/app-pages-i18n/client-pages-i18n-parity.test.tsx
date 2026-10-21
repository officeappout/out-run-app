// @vitest-environment jsdom
/**
 * i18n wave 2 (app pages: namespaces `onboarding` join.*, `player` sessionInvite.*, `pages`
 * refineLevels.*, `library` workoutHistory.* + `common`): Hebrew markup parity of the route pages
 * whose copy only appears after effects / async loads. Snapshots recorded BEFORE the extraction,
 * from unmodified origin/main.
 *
 * jsdom + react-dom/client (shared harness: src/features/user/onboarding/components/steps/__tests__/
 * i18n-dom-harness.tsx): every service is mocked and driven by hand, framer-motion is replaced by
 * plain elements, heavy children are stubs. `alert()` texts are recorded with a spy. react-dom/client
 * emits no `<!-- -->` separators; they are stripped anyway (same rule as the static-markup tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

// ── Controls ─────────────────────────────────────────────────────────

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const S = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  enableLeagues: true,
  authUser: null as null | { uid: string; displayName?: string | null; photoURL?: string | null },
  /** firebase/auth onAuthStateChanged: deliver the user, or never call back (loading). */
  authFires: true,
  validate: null as null | Promise<unknown>,
  userDoc: {} as Record<string, unknown>,
  setDoc: null as null | Promise<unknown>,
  workoutById: null as unknown,
}));

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }; // stable, like Next's
  return { useRouter: () => router, useParams: () => S.params };
});
vi.mock('framer-motion', () => motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: { currentUser: null } }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    if (S.authFires) cb(S.authUser);
    return () => {};
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({ data: () => S.userDoc }),
  setDoc: () => S.setDoc,
  serverTimestamp: () => 'ts',
}));
vi.mock('@/lib/auth.service', () => ({
  onAuthStateChange: (cb: (u: unknown) => void) => { cb(S.authUser); return () => {}; },
  signInGuest: async () => ({ user: null }),
}));
vi.mock('@/lib/onboardingPrefs', () => ({ setOnboardingPref: () => {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableLeagues: S.enableLeagues } }),
}));
vi.mock('@/features/user', () => ({ useUserStore: () => ({ profile: null }) }));
vi.mock('@/features/arena/services/group-invitation.service', () => ({
  validateSessionInvitation: () => S.validate,
  consumeSessionInvitation: async () => ({}),
}));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({
  useSharedSession: { getState: () => ({ joinViaDeepLink: () => {}, setMembershipReady: () => {} }) },
}));
vi.mock('@/features/user/onboarding/components/visual-assessment/VisualSlider', () => ({
  default: (p: { category: string; onLevelConfirm: (n: number) => void }) =>
    createElement('button', { 'data-slider': p.category, onClick: () => p.onLevelConfirm(7) }, `slider:${p.category}`),
}));
vi.mock('@/features/user/onboarding/services/visual-content-resolver.service', () => ({ clearContentCache: () => {} }));

// workouts/[id]/history — heavy children replaced by stubs (only the page's own copy is under test).
vi.mock('@/features/workout-engine/core/services/storage.service', () => ({ getWorkoutById: async () => S.workoutById }));
vi.mock('@/features/workout-engine/components/strength/StrengthSummaryPage', () => ({ default: () => null }));
vi.mock('@/features/workout-engine/components/strength/strength-history-adapter', () => ({ workoutHistoryEntryToStrengthSummaryProps: () => ({}) }));
vi.mock('@/features/workout-engine/summary/components/aerobic/AerobicSummaryShell', () => ({ default: () => null }));
vi.mock('@/features/workout-engine/summary/pages/AerobicSummary', () => ({ default: () => null }));
vi.mock('@/features/workout-engine/summary/aerobic-history-adapter', () => ({
  aerobicHistoryActivityType: () => 'running',
  workoutHistoryEntryToAerobicWorkout: () => ({}),
}));
vi.mock('@/features/workout-engine/summary/pages/HybridSummary', () => ({ default: () => null }));
vi.mock('@/features/workout-engine/hybrid/hybrid-history-adapter', () => ({ workoutHistoryEntryToHybridFinalizeResult: () => ({}) }));
vi.mock('@/features/user/progression/store/useProgressionStore', () => ({ useProgressionStore: () => 0 }));
vi.mock('@/components/ui/DeleteWorkoutConfirmModal', () => ({ default: () => null }));
vi.mock('@/lib/workoutDeletion', () => ({ deleteWorkoutWithReversal: async () => {} }));
vi.mock('@/features/workout-engine/core/utils/workoutLabels', () => ({
  workoutActivityLabel: () => '',
  workoutDateLabel: () => '',
}));

import JoinInvitePage from '@/app/join/[inviteCode]/page';
import SessionTokenPage from '@/app/session/[token]/page';
import RefineLevelsPage from '@/app/settings/refine-levels/page';
import WorkoutHistoryPage from '@/app/workouts/[id]/history/page';

const snap = (name: string) => `./__snapshots__/client/${name}.html`;
const flush = async (m: Mounted) => {
  for (let i = 0; i < 5; i++) await m.advance(0);
};

let mounted: Mounted | null = null;
let alerts: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  S.params = {};
  S.enableLeagues = true;
  S.authUser = null;
  S.authFires = true;
  S.validate = null;
  S.userDoc = {};
  S.setDoc = null;
  S.workoutById = null;
  alerts = [];
  vi.spyOn(window, 'alert').mockImplementation((msg?: unknown) => { alerts.push(String(msg)); });
  localStorage.clear();
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── /join/[inviteCode] ───────────────────────────────────────────────

const GROUP = {
  id: 'g1',
  name: 'רצים בפארק',
  description: 'קבוצת ריצה שבועית',
  category: 'running',
  currentParticipants: 1234,
  meetingLocation: { address: 'פארק הירקון' },
  rules: 'מגיעים בזמן',
  images: [] as string[],
};

async function mountJoin(group: Record<string, unknown> | null) {
  S.params = { inviteCode: 'abc' };
  vi.stubGlobal('fetch', vi.fn(async () =>
    group ? { ok: true, json: async () => ({ group }) } : { ok: false, status: 404, json: async () => ({}) },
  ));
  mounted = await mount(<JoinInvitePage />);
  await flush(mounted);
  return mounted;
}

describe('/join/[inviteCode]', () => {
  it('not found', async () => {
    const m = await mountJoin(null);
    await expect(m.html()).toMatchFileSnapshot(snap('join-not-found'));
  });

  it('league invite while leagues are off = invalid link', async () => {
    S.enableLeagues = false;
    const m = await mountJoin({ ...GROUP, groupType: 'league' });
    await expect(m.html()).toMatchFileSnapshot(snap('join-league-blocked'));
  });

  it.each(['walking', 'running', 'yoga', 'calisthenics', 'cycling', 'other', 'hiit'])('group, category %s, schedule slots', async (category) => {
    const m = await mountJoin({
      ...GROUP,
      category,
      scheduleSlots: [{ dayOfWeek: 0, time: '07:00' }, { dayOfWeek: 6, time: '18:30' }],
    });
    await expect(m.html()).toMatchFileSnapshot(snap(`join-group-${category}`));
  });

  it('group, single schedule, no rules, small count', async () => {
    const m = await mountJoin({
      ...GROUP,
      currentParticipants: 3,
      rules: undefined,
      schedule: { dayOfWeek: 3, time: '20:00' },
    });
    await expect(m.html()).toMatchFileSnapshot(snap('join-group-single-schedule'));
  });

  it('group without any schedule', async () => {
    const m = await mountJoin({ ...GROUP, meetingLocation: undefined });
    await expect(m.html()).toMatchFileSnapshot(snap('join-group-no-schedule'));
  });
});

// ── /session/[token] ─────────────────────────────────────────────────

async function mountSession(result: unknown, token = 'tok') {
  S.params = token ? { token } : {};
  S.validate = Promise.resolve(result);
  mounted = await mount(<SessionTokenPage />);
  await flush(mounted);
  return mounted;
}

describe('/session/[token]', () => {
  it.each(['not_found', 'expired', 'max_uses_reached'])('invalid: %s', async (reason) => {
    const m = await mountSession({ valid: false, reason });
    await expect(m.html()).toMatchFileSnapshot(snap(`session-invalid-${reason}`));
  });

  it('no token', async () => {
    const m = await mountSession({ valid: false, reason: 'not_found' }, '');
    await expect(m.html()).toMatchFileSnapshot(snap('session-no-token'));
  });

  it.each([
    ['run-running', { source: 'run-invite', activityType: 'running' }],
    ['run-walking', { source: 'run-invite', activityType: 'walking' }],
    ['group-session', { source: 'group', sessionDate: '21.10', sessionTime: '19:00' }],
  ])('valid: %s', async (name, extra) => {
    const m = await mountSession({ valid: true, doc: { groupName: 'הקבוצה שלי', ...extra } });
    await expect(m.html()).toMatchFileSnapshot(snap(`session-valid-${name}`));
  });
});

// ── /settings/refine-levels ──────────────────────────────────────────

describe('/settings/refine-levels', () => {
  beforeEach(() => {
    S.authUser = { uid: 'u1' };
  });

  it('main screen, then saving, then saved', async () => {
    const save = deferred<unknown>();
    S.setDoc = save.promise;
    const m = (mounted = await mount(<RefineLevelsPage />));
    await flush(m);
    await expect(m.html()).toMatchFileSnapshot(snap('refine-main'));
    for (let i = 0; i < 4; i++) {
      await m.click('[data-slider]');
      await flush(m);
    }
    await expect(m.html()).toMatchFileSnapshot(snap('refine-saving'));
    save.resolve(undefined);
    await flush(m);
    await expect(m.html()).toMatchFileSnapshot(snap('refine-saved'));
  });

  it('save failure alert', async () => {
    S.setDoc = Promise.reject(new Error('nope'));
    S.setDoc.catch(() => {});
    const m = (mounted = await mount(<RefineLevelsPage />));
    await flush(m);
    for (let i = 0; i < 4; i++) {
      await m.click('[data-slider]');
      await flush(m);
    }
    await expect(JSON.stringify(alerts) + '\n' + m.html()).toMatchFileSnapshot(snap('refine-save-failed'));
  });
});

// ── /workouts/[id]/history ───────────────────────────────────────────

describe('/workouts/[id]/history', () => {
  it('loading', async () => {
    S.params = { id: 'w1' };
    S.authFires = false;
    const m = (mounted = await mount(<WorkoutHistoryPage />));
    await flush(m);
    await expect(m.html()).toMatchFileSnapshot(snap('history-loading'));
  });

  it('not found', async () => {
    S.params = { id: 'w1' };
    S.authUser = null;
    const m = (mounted = await mount(<WorkoutHistoryPage />));
    await flush(m);
    await expect(m.html()).toMatchFileSnapshot(snap('history-not-found'));
  });
});
