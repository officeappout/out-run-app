import { describe, it, expect } from 'vitest';
import { resolveAggregateFullBodyBudget } from '../lead-program.service';
import type { Program } from '@/features/content/programs/core/program.types';

/**
 * Regression coverage for the movementPattern-ambiguity full_body budget
 * bug (2026-10-10). PR #160 (08.10.2026) wrote movementPattern onto 7 SKILL
 * programs too (via DOMAIN_RESOLUTION_SKILL_PARENT_MAP: planche/handstand/
 * handstand_pushup/human_flag -> 'push'), breaking the implicit assumption
 * that exactly one non-master program matches a given movementPattern.
 * `resolveAggregateFullBodyBudget`'s `candidates[0]` (from
 * getAllPrograms()'s own orderBy('name','asc')) silently picked whichever
 * one sorted first alphabetically -- "דגל אנושי" (Human Flag) before
 * "דחיפה" (Push) in Hebrew -- so every full-body user's push-domain budget
 * was computed against Human Flag's volume curve instead of Push's.
 */

function makeProgram(id: string, name: string, slug: string, movementPattern?: string): Program {
  return { id, name, slug, movementPattern, isMaster: false } as any;
}

describe('resolveAggregateFullBodyBudget — movementPattern/slug collision (2026-10-10 fix)', () => {
  it('resolves the real push program, not a skill that merely inherits movementPattern:"push"', async () => {
    // Alphabetically "דגל אנושי" (Human Flag) < "דחיפה" (Push) in Hebrew --
    // listed in that order here specifically to exercise candidates[0]'s
    // old behavior (the bug would pick the array's first entry).
    const programs: Program[] = [
      makeProgram('human-flag-id', 'דגל אנושי', 'human_flag', 'push'),
      makeProgram('push-id', 'דחיפה', 'push', 'push'),
      makeProgram('pull-id', 'משיכה', 'pull', 'pull'),
      makeProgram('legs-id', 'רגליים', 'legs', 'legs'),
      makeProgram('core-id', 'ליבה', 'core', 'core'),
    ];
    const userProgramLevels = new Map<string, number>([['push', 15], ['pull', 10], ['legs', 8], ['core', 6]]);

    const { domainBudgets } = await resolveAggregateFullBodyBudget(3, userProgramLevels, programs);

    const pushBudget = domainBudgets.find((d) => d.domain === 'push');
    expect(pushBudget).toBeDefined();
    expect(pushBudget!.level).toBe(15); // from userProgramLevels.get('push'), not human_flag's level
  });

  it('a pattern with only skill-level matches (no generic program at all) resolves with no program, not a false-positive skill match', async () => {
    const programs: Program[] = [
      makeProgram('planche-id', 'פלאנץ׳', 'planche', 'push'),
      makeProgram('handstand-id', 'עמידת ידיים', 'handstand', 'push'),
    ];
    const userProgramLevels = new Map<string, number>([['push', 15]]);

    const { domainBudgets } = await resolveAggregateFullBodyBudget(3, userProgramLevels, programs);

    const pushBudget = domainBudgets.find((d) => d.domain === 'push');
    expect(pushBudget).toBeDefined();
    expect(pushBudget!.level).toBe(1); // no `program` resolved -> falls to the default(1) path, not a skill's level
  });
});
