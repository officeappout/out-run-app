import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Owner directive (20.10.2026): the health declaration must never be filled
// twice. Signing in one gate (JIT workout-start sheet, or the signup page
// /onboarding-new/health) must satisfy every later gate in the same session —
// without waiting for the debounced Firestore sync or a profile refresh.
//
// These drive the REAL stores (useUserStore + useOnboardingStore) through the
// same calls HealthDeclarationStep's submit makes, and assert both gate
// decisions: the JIT gate (getMissingRequirements — useRequiredSetup) and the
// signup page's skip (isHealthDeclarationSatisfied — health/page.tsx).

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firestore.service', () => ({ getUserFromFirestore: vi.fn(async () => null) }));
vi.mock('@/features/user/identity/services/access-control.service', () => ({
  getUserAccessLevel: vi.fn(() => 'free'),
  isUserVerified: vi.fn(() => false),
}));
const syncMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({
  syncOnboardingToFirestore: syncMock,
}));

import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { markHealthDeclarationAcceptedLocally } from '@/features/user/onboarding/services/health-declaration-local';
import { getMissingRequirements, type WorkoutActivityType } from '@/features/user/onboarding/utils/required-setup';
import { isHealthDeclarationSatisfied } from '@/lib/health-declaration';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

const ACTIVITIES: WorkoutActivityType[] = ['running', 'strength', 'unknown'];

function makeProfile(extra: Record<string, unknown> = {}): UserFullProfile {
  return {
    id: 'u1',
    core: { name: 'Test' },
    equipment: { home: ['bar'], outdoor: [], office: [] },
    ...extra,
  } as unknown as UserFullProfile;
}

/** What HealthDeclarationStep's submit callback does, in order. */
function signDeclaration() {
  markHealthDeclarationAcceptedLocally();
  useOnboardingStore.getState().updateData({ healthDeclarationAccepted: true });
}

const jitAsksHealth = (activity: WorkoutActivityType = 'unknown') =>
  getMissingRequirements(useUserStore.getState().profile, activity).some((r) => r.id === 'health');

const healthPageShowsForm = () =>
  !isHealthDeclarationSatisfied(useUserStore.getState().profile, useOnboardingStore.getState().data);

describe('health declaration — never asked twice in one session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncMock.mockClear();
    useOnboardingStore.getState().reset();
    useUserStore.setState({ profile: makeProfile(), _hasHydrated: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('JIT on home ("תוכנית ריצה" start card) → running signup health page: asked once', () => {
    expect(jitAsksHealth('running')).toBe(true); // first ask — legit
    signDeclaration();
    // No refreshProfile, no Firestore round-trip yet (debounce still pending).
    expect(syncMock).not.toHaveBeenCalled();
    expect(healthPageShowsForm()).toBe(false);
  });

  it('JIT on home → a map run (separate hook instance, fresh hasShownJIT): asked once', () => {
    expect(jitAsksHealth('strength')).toBe(true);
    signDeclaration();
    for (const a of ACTIVITIES) expect(jitAsksHealth(a)).toBe(false);
  });

  it('signup health page → JIT workout start: asked once', () => {
    expect(healthPageShowsForm()).toBe(true); // first ask — legit
    signDeclaration();
    for (const a of ACTIVITIES) expect(jitAsksHealth(a)).toBe(false);
    expect(healthPageShowsForm()).toBe(false);
  });

  it('already accepted on load (top-level flag): no gate asks', () => {
    useUserStore.setState({ profile: makeProfile({ healthDeclarationAccepted: true }) });
    for (const a of ACTIVITIES) expect(jitAsksHealth(a)).toBe(false);
    expect(healthPageShowsForm()).toBe(false);
  });

  it('already accepted on load (legacy nested health.healthDeclarationAccepted): no gate asks', () => {
    useUserStore.setState({
      profile: makeProfile({ health: { injuries: [], connectedWatch: 'none', healthDeclarationAccepted: true } }),
    });
    for (const a of ACTIVITIES) expect(jitAsksHealth(a)).toBe(false);
    expect(healthPageShowsForm()).toBe(false);
  });

  it('belt: the signup page skips on the onboarding-store flag even if the profile is stale', () => {
    useOnboardingStore.getState().updateData({ healthDeclarationAccepted: true });
    expect(useUserStore.getState().profile?.healthDeclarationAccepted).toBeUndefined();
    expect(healthPageShowsForm()).toBe(false);
  });

  it('a user who never signed is still asked (first show is not blocked)', () => {
    for (const a of ACTIVITIES) expect(jitAsksHealth(a)).toBe(true);
    expect(healthPageShowsForm()).toBe(true);
  });

  it('the in-memory mark does not clobber the rest of the profile', () => {
    signDeclaration();
    const p = useUserStore.getState().profile!;
    expect(p.healthDeclarationAccepted).toBe(true);
    expect(p.id).toBe('u1');
    expect(p.equipment?.home).toEqual(['bar']);
  });

  it('marking with no profile loaded is a safe no-op', () => {
    useUserStore.setState({ profile: null });
    expect(() => markHealthDeclarationAcceptedLocally()).not.toThrow();
    expect(useUserStore.getState().profile).toBeNull();
  });

  it('equipment soft prompt is unchanged (still skipped for running only)', () => {
    useUserStore.setState({
      profile: makeProfile({ healthDeclarationAccepted: true, equipment: { home: [], outdoor: [], office: [] } }),
    });
    const ids = (a: WorkoutActivityType) => getMissingRequirements(useUserStore.getState().profile, a).map((r) => r.id);
    expect(ids('running')).toEqual([]);
    expect(ids('strength')).toEqual(['equipment']);
  });
});
