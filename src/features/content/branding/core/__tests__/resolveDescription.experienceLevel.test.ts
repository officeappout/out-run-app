import { describe, it, expect } from 'vitest';
import { resolveDescription } from '../branding.utils';
import type { TagResolverContext } from '../branding.utils';

/**
 * @רמה gendering (2026-10-01) — experienceLevel itself stays the plain
 * English categorical key (scoreContentRow's exact-match scoring key against
 * admin-authored rows); gendering happens only at render time here, via the
 * same userGender pipeline @מגדר already uses. See resolveExperienceLevelFromUserLevel's
 * own doc comment (workout-metadata.service.ts) for why the key itself never genders.
 */
describe('resolveDescription — @רמה gendering', () => {
  const baseCtx: TagResolverContext = {};

  it('renders the male form for userGender "male"', () => {
    const ctx: TagResolverContext = { ...baseCtx, experienceLevel: 'advanced', userGender: 'male' };
    expect(resolveDescription('רמה: @רמה', ctx)).toBe('רמה: מתקדם');
  });

  it('renders the female form for userGender "female"', () => {
    const ctx: TagResolverContext = { ...baseCtx, experienceLevel: 'advanced', userGender: 'female' };
    expect(resolveDescription('רמה: @רמה', ctx)).toBe('רמה: מתקדמת');
  });

  it('defaults to the male form when gender is "other"', () => {
    const ctx: TagResolverContext = { ...baseCtx, experienceLevel: 'pro', userGender: 'other' };
    expect(resolveDescription('רמה: @רמה', ctx)).toBe('רמה: מקצוען');
  });

  it('defaults to the male form when gender is missing entirely', () => {
    const ctx: TagResolverContext = { ...baseCtx, experienceLevel: 'beginner' };
    expect(resolveDescription('רמה: @רמה', ctx)).toBe('רמה: מתחיל');
  });

  it('covers all 4 bands, both genders', () => {
    const expected: Record<string, { male: string; female: string }> = {
      beginner: { male: 'מתחיל', female: 'מתחילה' },
      intermediate: { male: 'בינוני', female: 'בינונית' },
      advanced: { male: 'מתקדם', female: 'מתקדמת' },
      pro: { male: 'מקצוען', female: 'מקצוענית' },
    };
    for (const [level, { male, female }] of Object.entries(expected)) {
      expect(resolveDescription('@רמה', { ...baseCtx, experienceLevel: level, userGender: 'male' })).toBe(male);
      expect(resolveDescription('@רמה', { ...baseCtx, experienceLevel: level, userGender: 'female' })).toBe(female);
    }
  });

  it('still falls through to the generic placeholder when experienceLevel itself is absent', () => {
    const ctx: TagResolverContext = { ...baseCtx, userGender: 'female' };
    expect(resolveDescription('@רמה', ctx)).toBe('כל הרמות');
  });
});
