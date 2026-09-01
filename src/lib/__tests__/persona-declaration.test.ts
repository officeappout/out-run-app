import { describe, it, expect } from 'vitest';
import { hasAnsweredPersona } from '../persona-declaration';

describe('hasAnsweredPersona', () => {
  it('returns true when lifestyle.personaAnsweredAt is set', () => {
    expect(hasAnsweredPersona({ lifestyle: { personaAnsweredAt: '2026-08-31T00:00:00Z' } })).toBe(true);
  });

  it('returns true when personaId is set but personaAnsweredAt is missing (legacy fallback)', () => {
    expect(hasAnsweredPersona({ personaId: 'the-strategist' })).toBe(true);
  });

  it('returns true when both fields are set', () => {
    expect(
      hasAnsweredPersona({ personaId: 'the-strategist', lifestyle: { personaAnsweredAt: '2026-08-31T00:00:00Z' } }),
    ).toBe(true);
  });

  it('returns false when neither field is set', () => {
    expect(hasAnsweredPersona({ personaId: undefined, lifestyle: {} })).toBe(false);
  });

  it('returns false for an empty-string personaId', () => {
    expect(hasAnsweredPersona({ personaId: '' })).toBe(false);
  });

  it('returns false for null profile', () => {
    expect(hasAnsweredPersona(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(hasAnsweredPersona(undefined)).toBe(false);
  });

  it('returns false for an empty-object profile', () => {
    expect(hasAnsweredPersona({})).toBe(false);
  });

  it('returns false when lifestyle itself is missing entirely', () => {
    expect(hasAnsweredPersona({ personaId: undefined })).toBe(false);
  });

  it('treats a falsy-but-present personaAnsweredAt (0) as not answered', () => {
    expect(hasAnsweredPersona({ lifestyle: { personaAnsweredAt: 0 } })).toBe(false);
  });

  it('returns true when onboardingAnswers.persona is set (OnboardingWizard/Path A, default strength flow)', () => {
    expect(hasAnsweredPersona({ onboardingAnswers: { persona: 'the-strategist' } })).toBe(true);
  });

  it('returns true when all three forms are set', () => {
    expect(
      hasAnsweredPersona({
        personaId: 'the-strategist',
        lifestyle: { personaAnsweredAt: '2026-08-31T00:00:00Z' },
        onboardingAnswers: { persona: 'the-strategist' },
      }),
    ).toBe(true);
  });

  it('returns false for an empty-string onboardingAnswers.persona', () => {
    expect(hasAnsweredPersona({ onboardingAnswers: { persona: '' } })).toBe(false);
  });

  it('returns false when onboardingAnswers itself is missing entirely', () => {
    expect(hasAnsweredPersona({ personaId: undefined, onboardingAnswers: undefined })).toBe(false);
  });

  it('returns false when onboardingAnswers exists with unrelated keys but no persona/personas -- guards against checking parent-object presence instead of the specific key (this is exactly the shape a runner\'s profile has: onboardingAnswers populated by the dynamic-questionnaire engine, but never .persona)', () => {
    expect(
      hasAnsweredPersona({
        onboardingAnswers: { trainingHistory: '3+', sportsPreferences: ['running'], outdoorGymExperience: true } as any,
      }),
    ).toBe(false);
  });
});
