import { describe, it, expect } from 'vitest';
import { V2_HIDDEN_SKILLS, V2_SKILL_GROUPS, canToggleSkillV2 } from '../skill-selection';
import { SKILL_MASTER_ID, SKILL_PROGRAMS } from '../../constants/program-path.constants';

describe('v2 skills step', () => {
  it('shows only known skill ids, without the hidden ones', () => {
    const ids = V2_SKILL_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    const known = new Set(SKILL_PROGRAMS.map((s) => s.id));
    expect(ids.every((id) => known.has(id))).toBe(true);
    expect(ids.some((id) => V2_HIDDEN_SKILLS.has(id))).toBe(false);
    // hidden from both pickers now (shared HIDDEN_PROGRAM_SLUGS)
    expect(known.has('muscle_up') || known.has('handstand')).toBe(false);
  });

  it('caps individual picks at 3; deselect and the master always pass', () => {
    const three = ['front_lever', 'planche', 'hspu'];
    expect(canToggleSkillV2(three, 'one_arm_pullup')).toBe(false);
    expect(canToggleSkillV2(three, 'planche')).toBe(true);
    expect(canToggleSkillV2(three, SKILL_MASTER_ID)).toBe(true);
    expect(canToggleSkillV2(['front_lever', 'planche'], 'hspu')).toBe(true);
    expect(canToggleSkillV2([SKILL_MASTER_ID], 'hspu')).toBe(true);
  });
});
