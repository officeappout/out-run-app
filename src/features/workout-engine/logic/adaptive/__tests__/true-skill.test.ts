import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assignVolume, rederiveVolumeForSwappedExercise } from '../../workout-budgeting.utils';
import type { WorkoutGenerationContext, VolumeAdjustment } from '../../workout-generator.types';
import type { ScoredExercise } from '../../contextual-engine.types';
import { isTrueSkillExercise, aboveLevelRepRange, repCeilingFor, trueSkillHoldCap } from '../true-skill';
import {
  NON_SKILL_ELITE_REPS, NON_SKILL_HARD_REPS, NON_SKILL_HARD_REP_CEILING, SKILL_HOLD_CEILING_S, SKILL_REP_CEILING,
} from '../adaptive.config';
import { POLICY_OFF } from '../policy';

const ON = { ...POLICY_OFF, trueSkillCap: true };

const ex = (name: string, extra: Record<string, unknown> = {}) => ({
  id: name,
  name: { he: name, en: '' },
  type: 'reps',
  mechanicalType: 'bent_arm',
  movementGroup: 'vertical_pull',
  symmetry: 'bilateral',
  tags: [],
  ...extra,
}) as never;

const scored = (exercise: never, levelDiff: number): ScoredExercise & { levelDiff: number } => ({
  exercise, method: 'bodyweight' as never, mechanicalType: 'bent_arm' as never, score: 80, reasoning: [], levelDiff,
});

const ctx = (policy?: typeof ON): WorkoutGenerationContext => ({
  availableTime: 30, userLevel: 10, daysInactive: 0, intentMode: 'standard', persona: null,
  location: 'park', injuryCount: 0, progressionPolicy: policy,
}) as never;

const noAdj: VolumeAdjustment = { reason: 'inactivity', reductionPercent: 0, originalSets: 0, adjustedSets: 0, badge: '' };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('isTrueSkillExercise — owner list only', () => {
  it.each([
    'מתח יד אחת עם חולצה', 'פרונט לבר בטאק', 'באק לבר', 'פלאנץ׳ בטאק', 'שכיבות סמיכה בעמידת ידיים חזה לקיר',
    'עליית כוח עם טבעות', 'דגל אנושי', 'דגל בטאק', 'פיסטול סקוואט', 'Front Lever Raises',
  ])('%s is a true skill', (n) => expect(isTrueSkillExercise(ex(n))).toBe(true));

  it.each([
    'מתח', 'מתח רחב', 'מקבילים', 'שכיבות סמיכה', 'שכיבות סמיכה פסודו פלאנץ׳', 'הישענות פסודו פלאנץ׳',
    'דגל פלאנק צידי', 'חתירות יד אחת ב-45°', 'שכיבות סמיכה פייק', 'סקוואט',
  ])('%s is NOT a true skill', (n) => expect(isTrueSkillExercise(ex(n))).toBe(false));

  it('catalog signals win: base_movement_id and the true_skill tag', () => {
    expect(isTrueSkillExercise(ex('תרגיל', { base_movement_id: 'muscle_up' }))).toBe(true);
    expect(isTrueSkillExercise(ex('תרגיל', { tags: ['true_skill'] }))).toBe(true);
    expect(isTrueSkillExercise(ex('תרגיל', { base_movement_id: 'pull_up' }))).toBe(false);
  });

  it('a plain pull-up filed under skill programs is still not a true skill', () => {
    expect(isTrueSkillExercise(ex('מתח', {
      targetPrograms: [{ programId: 'front_lever', level: 8 }, { programId: 'one_arm_pullup', level: 6 }],
    }))).toBe(false);
  });
});

describe('pure helpers', () => {
  it('aboveLevelRepRange', () => {
    expect(aboveLevelRepRange('hard', false, { min: 1, max: 3 })).toEqual(NON_SKILL_HARD_REPS);
    expect(aboveLevelRepRange('elite', false, { min: 1, max: 3 })).toEqual(NON_SKILL_ELITE_REPS);
    expect(aboveLevelRepRange('hard', true, { min: 1, max: 3 })).toEqual({ min: 1, max: 3 });
    expect(aboveLevelRepRange('match', false, { min: 3, max: 6 })).toBeNull();
  });
  it('repCeilingFor — off keeps today, on is true-skill only', () => {
    expect(repCeilingFor({ flagOn: false, trueSkill: false, isSkillPriority: true, isAboveLevelTier: false })).toBe(5);
    expect(repCeilingFor({ flagOn: false, trueSkill: false, isSkillPriority: false, isAboveLevelTier: true })).toBe(5);
    expect(repCeilingFor({ flagOn: true, trueSkill: true, isSkillPriority: false, isAboveLevelTier: false })).toBe(SKILL_REP_CEILING);
    expect(repCeilingFor({ flagOn: true, trueSkill: false, isSkillPriority: true, isAboveLevelTier: false })).toBeNull();
    expect(repCeilingFor({ flagOn: true, trueSkill: false, isSkillPriority: false, isAboveLevelTier: true })).toBe(NON_SKILL_HARD_REP_CEILING);
  });
  it('trueSkillHoldCap', () => {
    expect(trueSkillHoldCap(15, true)).toBe(SKILL_HOLD_CEILING_S);
    expect(trueSkillHoldCap(15, false)).toBe(15);
    expect(trueSkillHoldCap(45, false)).toBe(45);
  });
});

describe('assignVolume with 3d', () => {
  it('flag OFF: a regular pull-up one level above stays at 1–3 (today)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const [r] = assignVolume([scored(ex('מתח'), 1)], ctx(), noAdj, 2);
    expect(r.repsRange).toEqual({ min: 1, max: 3 });
    expect(r.reps).toBeLessThanOrEqual(3);
  });

  it('flag ON: regular pull-up hard → 3–6, elite → 2–5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const [hard] = assignVolume([scored(ex('מתח'), 1)], ctx(ON), noAdj, 2);
    expect(hard.repsRange).toEqual({ min: 3, max: 6 });
    expect(hard.reps).toBe(6);
    const [elite] = assignVolume([scored(ex('מתח'), 2)], ctx(ON), noAdj, 2);
    expect(elite.repsRange).toEqual({ min: 2, max: 5 });
  });

  it('flag ON: a true skill above level keeps 1–3 and ≤5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const [r] = assignVolume([scored(ex('עליית כוח עם טבעות'), 1)], ctx(ON), noAdj, 2);
    expect(r.repsRange).toEqual({ min: 1, max: 3 });
    expect(r.reps).toBeLessThanOrEqual(SKILL_REP_CEILING);
  });

  it('skill-tagged regular move at match tier: 5-cap OFF, uncapped ON', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const pushup = ex('שכיבות סמיכה רחבות', { tags: ['skill'], movementGroup: 'horizontal_push' });
    const [off] = assignVolume([scored(pushup, 0)], { ...ctx(), levelProgressPercent: 80 } as never, noAdj, 2);
    expect(off.reps).toBeLessThanOrEqual(5);
    const [on] = assignVolume([scored(pushup, 0)], { ...ctx(ON), levelProgressPercent: 80 } as never, noAdj, 2);
    expect(on.reps).toBeGreaterThan(5);
  });

  it('flag ON: a true-skill hold never goes past 12 s; a regular hold is unchanged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const lever = ex('החזקת פרונט לבר בטאק', { type: 'time', mechanicalType: 'straight_arm', movementGroup: 'horizontal_pull' });
    const [off] = assignVolume([scored(lever, 0)], ctx(), noAdj, 1);
    const [on] = assignVolume([scored(lever, 0)], ctx(ON), noAdj, 1);
    expect(off.reps).toBeLessThanOrEqual(15);
    expect(on.reps).toBeLessThanOrEqual(SKILL_HOLD_CEILING_S);
    expect(on.repsRange!.max).toBeLessThanOrEqual(SKILL_HOLD_CEILING_S);
  });
});

describe('rederiveVolumeForSwappedExercise with 3d', () => {
  it('a regular pull-up swapped in one level above: 1–3 off, 3–6 on', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(rederiveVolumeForSwappedExercise(ex('מתח'), 1, 2).repsRange).toEqual({ min: 1, max: 3 });
    expect(rederiveVolumeForSwappedExercise(ex('מתח'), 1, 2, undefined, undefined, ON).repsRange).toEqual({ min: 3, max: 6 });
  });
});
