import { describe, it, expect } from 'vitest';
import { resolveCardHasScheduleAndPersona } from '../running-onboarding-gate';

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
