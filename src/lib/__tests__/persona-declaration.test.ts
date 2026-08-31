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
});
