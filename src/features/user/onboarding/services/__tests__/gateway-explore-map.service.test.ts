import { describe, it, expect } from 'vitest';
import { buildExploreMapProfileWrite } from '../gateway-explore-map.service';

// Pins the gateway wipe-guard fix (docs/research/gateway-home-strength-card-investigation.md):
// handleExploreMap's setDoc used to run unconditionally, resetting progression.domains
// (and core.gender/weight, running.activeProgram, etc.) to blank defaults for ANY resolved
// uid — including an already-onboarded returning user who lands on /gateway during the
// async auto-redirect's lookup window. This pins that the builder returns null (skip the
// write) whenever a doc already exists, regardless of what it contains.

describe('buildExploreMapProfileWrite', () => {
  it('returns the full new-user scaffold when no doc exists yet', () => {
    const result = buildExploreMapProfileWrite('uid-new-guest', undefined);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('uid-new-guest');
    expect(result?.onboardingPath).toBe('MAP_ONLY');
    expect(result?.onboardingStatus).toBe('MAP_ONLY');
    expect(result?.progression.domains).toEqual({});
    expect(result?.progression.activePrograms).toEqual([]);
    expect(result?.core.gender).toBe('other');
    expect(result?.running.activeProgram).toBeNull();
  });

  it('returns null when the user already has an assessed strength profile — the exact bug scenario', () => {
    const existingUserWithStrengthProfile = {
      id: 'uid-existing-strength-user',
      onboardingStatus: 'COMPLETED',
      core: { name: 'דוד', gender: 'male', weight: 82 },
      progression: {
        domains: { upper_body: { currentLevel: 6 } },
        activePrograms: ['upper_body'],
      },
    };

    const result = buildExploreMapProfileWrite('uid-existing-strength-user', existingUserWithStrengthProfile);

    expect(result).toBeNull();
  });

  it('returns null for ANY existing doc, even one with no progression yet — never re-scaffold an existing user', () => {
    const existingBareDoc = { id: 'uid-existing-bare' };

    const result = buildExploreMapProfileWrite('uid-existing-bare', existingBareDoc);

    expect(result).toBeNull();
  });

  it('is a pure function — same input always produces an equivalent scaffold', () => {
    const first = buildExploreMapProfileWrite('uid-a', undefined);
    const second = buildExploreMapProfileWrite('uid-a', undefined);

    expect(first).toEqual(second);
  });
});
