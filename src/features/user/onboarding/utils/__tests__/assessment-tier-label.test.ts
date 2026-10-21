import { describe, it, expect } from 'vitest';
import { resolveTierLabel, resolveSkillTierLabel, stepProportion, levelProportion } from '../assessment-tier-label';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

// Labels come from the `onboarding` catalog (tier.*); the Hebrew itself is pinned against the
// pre-extraction resolvers in src/lib/i18n/__tests__/onboarding-he.test.ts.
const t = makeT('he', onboarding);
const BEGINNER = t('tier.beginner', { gender: 'other' });
const BEGINNER_F = t('tier.beginner', { gender: 'female' });
const INTERMEDIATE = t('tier.intermediate');
const ADVANCED = t('tier.advanced', { gender: 'other' });
const ADVANCED_F = t('tier.advanced', { gender: 'female' });
const SKILL = {
  beginner: t('tier.skill.beginner'),
  beginnerPlus: t('tier.skill.beginnerPlus'),
  intermediate: t('tier.skill.intermediate'),
  advanced: t('tier.skill.advanced'),
};

describe('resolveTierLabel', () => {
  it('boundaries: just under 1/3 is beginner, exactly 1/3 is intermediate', () => {
    expect(resolveTierLabel(0, false, t)).toBe(BEGINNER);
    expect(resolveTierLabel(1 / 3 - 0.001, false, t)).toBe(BEGINNER);
    expect(resolveTierLabel(1 / 3, false, t)).toBe(INTERMEDIATE);
  });

  it('boundaries: just under 2/3 is intermediate, exactly 2/3 is advanced', () => {
    expect(resolveTierLabel(2 / 3 - 0.001, false, t)).toBe(INTERMEDIATE);
    expect(resolveTierLabel(2 / 3, false, t)).toBe(ADVANCED);
    expect(resolveTierLabel(1, false, t)).toBe(ADVANCED);
  });

  it('gendered variants for beginner/advanced, בינוני unchanged', () => {
    expect(resolveTierLabel(0, true, t)).toBe(BEGINNER_F);
    expect(resolveTierLabel(0.5, true, t)).toBe(INTERMEDIATE);
    expect(resolveTierLabel(1, true, t)).toBe(ADVANCED_F);
  });

  it('out-of-range proportions clamp instead of throwing or misclassifying', () => {
    expect(resolveTierLabel(-5, false, t)).toBe(BEGINNER);
    expect(resolveTierLabel(5, false, t)).toBe(ADVANCED);
    expect(resolveTierLabel(NaN, false, t)).toBe(BEGINNER);
  });
});

describe('resolveSkillTierLabel', () => {
  it('4 equal buckets, proportional across the full range', () => {
    expect(resolveSkillTierLabel(0, t)).toBe(SKILL.beginner);
    expect(resolveSkillTierLabel(0.24, t)).toBe(SKILL.beginner);
    expect(resolveSkillTierLabel(0.25, t)).toBe(SKILL.beginnerPlus);
    expect(resolveSkillTierLabel(0.49, t)).toBe(SKILL.beginnerPlus);
    expect(resolveSkillTierLabel(0.5, t)).toBe(SKILL.intermediate);
    expect(resolveSkillTierLabel(0.74, t)).toBe(SKILL.intermediate);
    expect(resolveSkillTierLabel(0.75, t)).toBe(SKILL.advanced);
    expect(resolveSkillTierLabel(1, t)).toBe(SKILL.advanced);
  });

  it('out-of-range proportions clamp instead of throwing or misclassifying', () => {
    expect(resolveSkillTierLabel(-5, t)).toBe(SKILL.beginner);
    expect(resolveSkillTierLabel(5, t)).toBe(SKILL.advanced);
    expect(resolveSkillTierLabel(NaN, t)).toBe(SKILL.beginner);
  });
});

describe('stepProportion', () => {
  it('first step is 0, last step is 1, middle steps interpolate', () => {
    expect(stepProportion(0, 7)).toBe(0);
    expect(stepProportion(6, 7)).toBe(1);
    expect(stepProportion(3, 7)).toBeCloseTo(0.5, 5);
  });

  it('single-step list (totalSteps <= 1) never divides by zero', () => {
    expect(stepProportion(0, 1)).toBe(0);
    expect(stepProportion(0, 0)).toBe(0);
  });
});

describe('levelProportion', () => {
  it('interpolates between min and max', () => {
    expect(levelProportion(1, 1, 25)).toBe(0);
    expect(levelProportion(25, 1, 25)).toBe(1);
    expect(levelProportion(13, 1, 25)).toBeCloseTo(0.5, 2);
  });

  it('degenerate range (max <= min) never divides by zero', () => {
    expect(levelProportion(5, 10, 10)).toBe(0);
    expect(levelProportion(5, 10, 5)).toBe(0);
  });
});

describe('integration: coverflow vs degraded modes agree at the same relative position', () => {
  it('the middle step of a 7-step list and the middle level of a 1-25 range both resolve to בינוני', () => {
    const coverflowLabel = resolveTierLabel(stepProportion(3, 7), false, t);
    const degradedLabel = resolveTierLabel(levelProportion(13, 1, 25), false, t);
    expect(coverflowLabel).toBe(INTERMEDIATE);
    expect(degradedLabel).toBe(INTERMEDIATE);
  });
});
