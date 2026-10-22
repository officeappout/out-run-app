/**
 * isHiddenSkillExercise — an exercise is hidden only when EVERY program it belongs to is a
 * hidden skill (muscle_up / handstand / human_flag). HSPU stays visible (owner 22.10).
 */
import { describe, it, expect } from 'vitest';
import { isHiddenSkillExercise, isHiddenProgram } from '../hidden-programs';

describe('isHiddenSkillExercise', () => {
  it('only-hidden programs → hidden (slug or raw doc id)', () => {
    expect(isHiddenSkillExercise({ targetPrograms: [{ programId: 'muscle_up' }] })).toBe(true);
    expect(isHiddenSkillExercise({ targetPrograms: [{ programId: 'EtY8YCol0qpF6DzgcTx1' }] })).toBe(true);
    expect(isHiddenSkillExercise({ targetPrograms: [{ programId: 'handstand' }, { programId: 'human_flag' }] })).toBe(true);
  });

  it('shared with a visible program → visible', () => {
    expect(isHiddenSkillExercise({ targetPrograms: [{ programId: 'muscle_up' }, { programId: 'pull' }] })).toBe(false);
    expect(isHiddenSkillExercise({ targetPrograms: [{ programId: 'handstand' }], programIds: ['push'] })).toBe(false);
  });

  it('HSPU is not hidden', () => {
    expect(isHiddenProgram('hspu')).toBe(false);
    expect(isHiddenSkillExercise({ targetPrograms: [{ programId: 'hspu' }] })).toBe(false);
  });

  it('untagged / missing → visible', () => {
    expect(isHiddenSkillExercise({})).toBe(false);
    expect(isHiddenSkillExercise(null)).toBe(false);
    expect(isHiddenSkillExercise({ targetPrograms: [] })).toBe(false);
  });
});
