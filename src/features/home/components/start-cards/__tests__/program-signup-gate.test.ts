import { describe, it, expect, vi } from 'vitest';
import { programSignupNavigate, PROGRAM_CARD_ENTRY } from '../program-signup-gate';
import { runOnboardingEntryTap } from '../entry-tap';
import { getMissingRequirements } from '@/features/user/onboarding/utils/required-setup';
import { onboardingEntryHref } from '@/features/user/onboarding/utils/onboarding-entry';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

// Bug (owner, 20.10.2026, enable_home_v2): tapping the strength start card on home opened
// the personal details + health declaration FIRST and only then the strength stories.
// Cause: the card's tap went through home's JIT workout-start gate (interceptWorkoutStart
// with 'program-signup'), which shows identity + the declaration in front of the flow,
// and the entry href sent a user without a known identity to the identity form first.

/** A new user from the map: no name / birth date, declaration not signed. */
const newUser = { id: 'u1', core: { name: '', gender: 'other' } } as unknown as UserFullProfile;

/** Mirrors useRequiredSetup.interceptWorkoutStart: opens the sheet when anything is missing. */
function jitGate(profile: UserFullProfile) {
  const opened: string[][] = [];
  const gate = vi.fn((onProceed: () => void, activityType?: Parameters<typeof getMissingRequirements>[1]) => {
    const missing = getMissingRequirements(profile, activityType, { requireIdentity: true });
    if (missing.length === 0) { onProceed(); return true; }
    opened.push(missing.map((m) => m.id));
    return false;
  });
  return { gate, opened };
}

function tapCard(v2: boolean, track: 'strength' | 'running') {
  const { gate, opened } = jitGate(newUser);
  const pushed: string[] = [];
  const navigateFor = programSignupNavigate(v2, gate);
  const href = onboardingEntryHref(track === 'running' ? 'RUNNING' : 'STRENGTH', false, v2 ? PROGRAM_CARD_ENTRY : {});
  runOnboardingEntryTap(() => {}, () => pushed.push(href), (go, cancel) => navigateFor(track, go, cancel));
  return { gate, opened, pushed };
}

describe('home program cards → their own flow (enable_home_v2)', () => {
  it('the old wiring reproduces the bug: the gate opens identity + health and nothing is navigated', () => {
    const { gate } = jitGate(newUser);
    const pushed: string[] = [];
    // Pre-fix: interceptWorkoutStart(navigate, 'program-signup', cancel) in front of the flow.
    gate(() => pushed.push('/onboarding-new/program-path'), 'program-signup');
    expect(pushed).toEqual([]);
    expect(getMissingRequirements(newUser, 'program-signup', { requireIdentity: true }).map((m) => m.id))
      .toEqual(['identity', 'health']);
  });

  it('strength card → straight into the strength stories (program path), no gate', () => {
    const { gate, opened, pushed } = tapCard(true, 'strength');
    expect(gate).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
    expect(pushed).toEqual(['/onboarding-new/program-path']);
  });

  it('running card (also the walking entry) → straight into the run questionnaire, no gate', () => {
    const { gate, pushed } = tapCard(true, 'running');
    expect(gate).not.toHaveBeenCalled();
    expect(pushed).toEqual(['/onboarding-new/dynamic']);
  });

  it('flag off: unchanged — the gate runs with the track and the cancel', () => {
    const gate = vi.fn();
    const go = vi.fn();
    const cancel = vi.fn();
    programSignupNavigate(false, gate)('strength', go, cancel);
    expect(gate).toHaveBeenCalledWith(go, 'strength', cancel);
    expect(go).not.toHaveBeenCalled();
  });
});
