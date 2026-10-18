import { describe, it, expect } from 'vitest';
import { resolveCardHasScheduleAndPersona, resolveScheduleCardDecision, isSecondTrackUser } from '../running-onboarding-gate';

const RUNNING_UNLOCKED = { running: { isUnlocked: true } };
const RUNNING_CONFIRMED = { running: { isUnlocked: true, scheduleDaysSource: 'user-chosen' } };
const RUNNING_SYSTEM_DEFAULT = { running: { isUnlocked: true, scheduleDaysSource: 'system-default' } };
// personas[], not lifestyle.personaAnsweredAt -- persona-declaration.ts
// was redefined (01.09.2026, a parallel session's military-persona
// merge, origin/main 31c7f3d4) to read hasAnsweredPersona() from
// `personas: AnyPersonaEntry[]` only; personaAnsweredAt is dead.
const PERSONA_ANSWERED = {
  personas: [{ id: 'runner', answers: {}, updatedAt: '2026-09-01T00:00:00.000Z' }],
};
const STRENGTH_ONLY = { running: { isUnlocked: false } };

describe('resolveCardHasScheduleAndPersona', () => {
  it('gateEnabled=false always returns hasSchedule untouched, regardless of profile shape', () => {
    expect(resolveCardHasScheduleAndPersona(null, true, false)).toBe(true);
    expect(resolveCardHasScheduleAndPersona(null, false, false)).toBe(false);
    expect(resolveCardHasScheduleAndPersona({ ...RUNNING_UNLOCKED, ...PERSONA_ANSWERED }, false, false)).toBe(false);
  });

  describe('gateEnabled=true, running track (hasRunningTrack)', () => {
    it('confirmed days + answered persona -> true (real card)', () => {
      const profile = { ...RUNNING_CONFIRMED, ...PERSONA_ANSWERED };
      expect(resolveCardHasScheduleAndPersona(profile, true, true)).toBe(true);
    });

    it('system-default days (unconfirmed) + answered persona -> false (overlay+CTA)', () => {
      const profile = { ...RUNNING_SYSTEM_DEFAULT, ...PERSONA_ANSWERED };
      expect(resolveCardHasScheduleAndPersona(profile, true, true)).toBe(false);
    });

    it('confirmed days + persona NOT answered -> false (overlay+CTA)', () => {
      const profile = { ...RUNNING_CONFIRMED };
      expect(resolveCardHasScheduleAndPersona(profile, true, true)).toBe(false);
    });

    it('neither confirmed nor answered -> false (overlay+CTA) -- the exact stuck-runner case this gate exists for', () => {
      const profile = { ...RUNNING_UNLOCKED };
      expect(resolveCardHasScheduleAndPersona(profile, true, true)).toBe(false);
    });

    it('the running branch ignores the hasSchedule argument entirely -- confirmed via a deliberately-contradictory true/false pairing', () => {
      const confirmedAndAnswered = { ...RUNNING_CONFIRMED, ...PERSONA_ANSWERED };
      expect(resolveCardHasScheduleAndPersona(confirmedAndAnswered, false, true)).toBe(true);
      expect(resolveCardHasScheduleAndPersona({ ...RUNNING_UNLOCKED }, true, true)).toBe(false);
    });
  });

  describe('gateEnabled=true, non-running (strength or no track)', () => {
    it('hasSchedule + answered persona -> true (real card, no change from today\'s intent)', () => {
      const profile = { ...STRENGTH_ONLY, ...PERSONA_ANSWERED };
      expect(resolveCardHasScheduleAndPersona(profile, true, true)).toBe(true);
    });

    it('no schedule -> false (overlay+CTA), regardless of persona -- matches today\'s behavior exactly', () => {
      expect(resolveCardHasScheduleAndPersona({ ...STRENGTH_ONLY, ...PERSONA_ANSWERED }, false, true)).toBe(false);
      expect(resolveCardHasScheduleAndPersona(STRENGTH_ONLY, false, true)).toBe(false);
    });

    it('hasSchedule but persona NOT answered -> false -- the new addition for strength users, flagged as unverified-in-practice in the review', () => {
      expect(resolveCardHasScheduleAndPersona(STRENGTH_ONLY, true, true)).toBe(false);
    });

    it('null/undefined profile with hasSchedule=true and persona unanswered -> false, not a throw', () => {
      expect(resolveCardHasScheduleAndPersona(null, true, true)).toBe(false);
      expect(resolveCardHasScheduleAndPersona(undefined, true, true)).toBe(false);
    });
  });

  it('dual-track user (running unlocked AND has a strength schedule) takes the running branch, not the strength one', () => {
    // hasRunningTrack=true routes here regardless of hasSchedule -- a dual-track
    // user stuck on system-default running days must see the overlay even
    // though their (strength) hasSchedule is true.
    const dualTrackStuck = { ...RUNNING_SYSTEM_DEFAULT, ...PERSONA_ANSWERED };
    expect(resolveCardHasScheduleAndPersona(dualTrackStuck, true, true)).toBe(false);
  });
});

describe('resolveScheduleCardDecision — first registration vs second track', () => {
  const STRENGTH = { progression: { domains: { push: { currentLevel: 3 } } } };
  const STRENGTH_TEMPLATE = { lifestyle: { recurringTemplate: { א: ['push'], ג: ['pull'], ה: ['legs'] } } };
  const RUN_ONLY_TEMPLATE = { lifestyle: { recurringTemplate: { ב: ['run_plan_10k'], ד: ['run_plan_10k'] } } };
  const ON = { gateEnabled: true, secondTrackDrawer: true };

  it('either flag off → exactly the legacy gate + the wizard', () => {
    const dual = { ...STRENGTH, ...STRENGTH_TEMPLATE, ...RUNNING_SYSTEM_DEFAULT, ...PERSONA_ANSWERED };
    for (const opts of [
      { gateEnabled: true, secondTrackDrawer: false },
      { gateEnabled: false, secondTrackDrawer: true },
      { gateEnabled: false, secondTrackDrawer: false },
    ]) {
      for (const hasSchedule of [true, false]) {
        expect(resolveScheduleCardDecision(dual, hasSchedule, opts)).toEqual({
          hasScheduleAndPersona: resolveCardHasScheduleAndPersona(dual, hasSchedule, opts.gateEnabled),
          ctaTarget: 'wizard',
        });
      }
    }
  });

  it('first registration, strength only → unchanged (wizard)', () => {
    const p = { ...STRENGTH, ...STRENGTH_ONLY };
    expect(resolveScheduleCardDecision(p, false, ON)).toEqual({ hasScheduleAndPersona: false, ctaTarget: 'wizard' });
    const answered = { ...p, ...PERSONA_ANSWERED };
    expect(resolveScheduleCardDecision(answered, true, ON)).toEqual({ hasScheduleAndPersona: true, ctaTarget: 'wizard' });
  });

  it('first registration, running only → unchanged (wizard)', () => {
    const p = { ...RUNNING_SYSTEM_DEFAULT, ...PERSONA_ANSWERED };
    expect(resolveScheduleCardDecision(p, true, ON)).toEqual({ hasScheduleAndPersona: false, ctaTarget: 'wizard' });
  });

  it('both tracks but persona never answered → the wizard (it is the only place persona is asked)', () => {
    const p = { ...STRENGTH, ...STRENGTH_TEMPLATE, ...RUNNING_SYSTEM_DEFAULT };
    expect(isSecondTrackUser(p)).toBe(false);
    expect(resolveScheduleCardDecision(p, true, ON).ctaTarget).toBe('wizard');
  });

  it('strength user adds running (running days still system default) → blurred card, CTA opens the drawer', () => {
    const p = { ...STRENGTH, ...STRENGTH_TEMPLATE, ...RUNNING_SYSTEM_DEFAULT, ...PERSONA_ANSWERED };
    expect(resolveScheduleCardDecision(p, true, ON)).toEqual({ hasScheduleAndPersona: false, ctaTarget: 'drawer' });
  });

  it('runner adds strength (template has no strength id yet) → blurred card, CTA opens the drawer', () => {
    const p = { ...STRENGTH, ...RUN_ONLY_TEMPLATE, ...RUNNING_CONFIRMED, ...PERSONA_ANSWERED };
    // Today (legacy) this user sees a clear card and never reaches a strength-day choice.
    expect(resolveCardHasScheduleAndPersona(p, true, true)).toBe(true);
    expect(resolveScheduleCardDecision(p, true, ON)).toEqual({ hasScheduleAndPersona: false, ctaTarget: 'drawer' });
  });

  it('second track after the drawer saved (strength in the template + running user-chosen) → clear card', () => {
    const p = { ...STRENGTH, ...STRENGTH_TEMPLATE, ...RUNNING_CONFIRMED, ...PERSONA_ANSWERED };
    expect(resolveScheduleCardDecision(p, true, ON)).toEqual({ hasScheduleAndPersona: true, ctaTarget: 'drawer' });
  });

  it('a raw Firestore program id counts as strength only through the resolver', () => {
    const p = { ...STRENGTH, lifestyle: { recurringTemplate: { א: ['AbCdEfGh1234567890xy'] } }, ...RUNNING_CONFIRMED, ...PERSONA_ANSWERED };
    expect(resolveScheduleCardDecision(p, true, ON).hasScheduleAndPersona).toBe(false);
    expect(resolveScheduleCardDecision(p, true, { ...ON, resolveSlug: () => 'push' }).hasScheduleAndPersona).toBe(true);
  });

  it('null profile → legacy', () => {
    expect(resolveScheduleCardDecision(null, false, ON)).toEqual({ hasScheduleAndPersona: false, ctaTarget: 'wizard' });
  });
});
