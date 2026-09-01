import { describe, it, expect } from 'vitest';
import { hasAnsweredPersona } from '../persona-declaration';

describe('hasAnsweredPersona', () => {
  it('returns true when personas has at least one entry', () => {
    expect(hasAnsweredPersona({ personas: [{ id: 'military', answers: {} }] })).toBe(true);
  });

  it('returns true when personas has multiple entries', () => {
    expect(hasAnsweredPersona({ personas: [{ id: 'parent' }, { id: 'military' }] })).toBe(true);
  });

  it('returns false when personas is an empty array', () => {
    expect(hasAnsweredPersona({ personas: [] })).toBe(false);
  });

  it('returns false when personas is missing entirely', () => {
    expect(hasAnsweredPersona({})).toBe(false);
  });

  it('returns false for null profile', () => {
    expect(hasAnsweredPersona(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(hasAnsweredPersona(undefined)).toBe(false);
  });
});
