import { describe, it, expect } from 'vitest';
import { hasStrengthTrack, hasRunningTrack } from '../track-ownership';

describe('hasStrengthTrack', () => {
  it('returns false for a pure runner (domains.running assessed, no strength domain) -- the naive-check trap', () => {
    expect(
      hasStrengthTrack({ progression: { domains: { running: { currentLevel: 5 } } } }),
    ).toBe(false);
  });

  it('returns false for a pure runner via tracks too', () => {
    expect(
      hasStrengthTrack({ progression: { tracks: { running: { currentLevel: 3 }, flexibility: { currentLevel: 2 } } } }),
    ).toBe(false);
  });

  it('returns false for flexibility assessed alone, no strength domain at all -- isolates the OTHER half of NON_STRENGTH, not just running', () => {
    expect(
      hasStrengthTrack({ progression: { domains: { flexibility: { currentLevel: 4 } } } }),
    ).toBe(false);
  });

  it('does not throw when domains is explicitly null (Firestore can hold this, not just undefined -- a default param only catches undefined)', () => {
    expect(() => hasStrengthTrack({ progression: { domains: null as any } })).not.toThrow();
    expect(hasStrengthTrack({ progression: { domains: null as any } })).toBe(false);
  });

  it('does not throw when tracks is explicitly null', () => {
    expect(() => hasStrengthTrack({ progression: { tracks: null as any } })).not.toThrow();
    expect(hasStrengthTrack({ progression: { tracks: null as any } })).toBe(false);
  });

  it('returns false when a strength domain is present but unassessed (currentLevel 0)', () => {
    expect(
      hasStrengthTrack({ progression: { domains: { upper_body: { currentLevel: 0 } } } }),
    ).toBe(false);
  });

  it('returns false when a strength domain key exists with no level field at all', () => {
    expect(
      hasStrengthTrack({ progression: { domains: { upper_body: {} } } }),
    ).toBe(false);
  });

  it('returns true when a strength domain is assessed (currentLevel > 0)', () => {
    expect(
      hasStrengthTrack({ progression: { domains: { upper_body: { currentLevel: 1 } } } }),
    ).toBe(true);
  });

  it('returns true via the legacy `level` field when currentLevel is absent', () => {
    expect(
      hasStrengthTrack({ progression: { domains: { upper_body: { level: 2 } } } }),
    ).toBe(true);
  });

  it('returns true when strength is assessed alongside an assessed running domain (dual-track)', () => {
    expect(
      hasStrengthTrack({
        progression: { domains: { upper_body: { currentLevel: 1 }, running: { currentLevel: 4 } } },
      }),
    ).toBe(true);
  });

  it('returns true when only tracks (not domains) has an assessed strength entry', () => {
    expect(
      hasStrengthTrack({ progression: { tracks: { full_body: { currentLevel: 1 } } } }),
    ).toBe(true);
  });

  it('returns false when neither domains nor tracks exist', () => {
    expect(hasStrengthTrack({ progression: {} })).toBe(false);
  });

  it('returns false when progression itself is missing', () => {
    expect(hasStrengthTrack({})).toBe(false);
  });

  it('returns false for null profile', () => {
    expect(hasStrengthTrack(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(hasStrengthTrack(undefined)).toBe(false);
  });
});

describe('hasRunningTrack', () => {
  it('returns true when running.isUnlocked is true', () => {
    expect(hasRunningTrack({ running: { isUnlocked: true } })).toBe(true);
  });

  it('returns false when running.isUnlocked is false', () => {
    expect(hasRunningTrack({ running: { isUnlocked: false } })).toBe(false);
  });

  it('returns false when running.isUnlocked is absent', () => {
    expect(hasRunningTrack({ running: {} })).toBe(false);
  });

  it('returns false when running itself is missing', () => {
    expect(hasRunningTrack({})).toBe(false);
  });

  it('returns false for null profile', () => {
    expect(hasRunningTrack(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(hasRunningTrack(undefined)).toBe(false);
  });

  it('is independent of hasStrengthTrack -- a dual-track user gets true from both', () => {
    const dualTrackProfile = {
      progression: { domains: { upper_body: { currentLevel: 1 } } },
      running: { isUnlocked: true },
    };
    expect(hasStrengthTrack(dualTrackProfile)).toBe(true);
    expect(hasRunningTrack(dualTrackProfile)).toBe(true);
  });
});
