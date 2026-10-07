import { describe, expect, it, beforeAll } from 'vitest';
import { classifyPriority } from '../workout-selection.utils';
import { buildIdToSlugMapFromPrograms } from '../../services/program-hierarchy.utils';
import type { Program } from '@/features/content/programs/core/program.types';

/**
 * Regression coverage for the targetPrograms-based skill classification fix
 * (2026-10-07). Before this fix, classifyPriority() relied entirely on
 * name-substring matching (SKILL_NAME_PATTERNS) -- confirmed live against
 * the real catalog that NONE of planche (0/25), muscle_up (0/14),
 * one_arm_pullup (0/27), handstand (0/4), or handstand_pushup (0/8) ever
 * classified as 'skill', for two different reasons: planche's catalog
 * spelling ("פלאנץ׳") didn't match the old /פלאנש/i pattern, and the other
 * four had no name pattern at all -- their own accessory/progression
 * exercises (e.g. a muscle-up swing-prep drill) aren't named with the
 * skill's name regardless of pattern correctness. front_lever (18/22) and
 * human_flag (8/8) were already mostly/fully correct via name-matching --
 * covered here too, as a no-regression check.
 */

// Minimal fake programs so resolveToSlug() has a warm map in this isolated
// unit test -- ids ARE the slugs, mirroring the real catalog's resolved form.
const FAKE_PROGRAMS: Program[] = [
  'planche', 'front_lever', 'muscle_up', 'one_arm_pullup', 'human_flag', 'handstand', 'handstand_pushup',
].map((slug) => ({ id: slug, name: slug, isMaster: false } as Program));

beforeAll(() => {
  buildIdToSlugMapFromPrograms(FAKE_PROGRAMS);
});

function exerciseTaggedWith(programId: string, opts: Partial<{
  nameHe: string; mechanicalType: string; movementType: string; tags: string[];
}> = {}): any {
  return {
    id: 'test-ex',
    name: { he: opts.nameHe ?? 'תרגיל בדיקה' },
    tags: opts.tags ?? [],
    movementType: opts.movementType,
    mechanicalType: opts.mechanicalType ?? 'straight_arm',
    movementGroup: undefined,
    targetPrograms: [{ programId, level: 7 }],
  };
}

describe('classifyPriority — targetPrograms membership (the 5 previously-broken skills)', () => {
  it.each(['planche', 'muscle_up', 'one_arm_pullup', 'handstand', 'handstand_pushup'])(
    "%s: a descriptively-named accessory (no skill keyword in the name) now classifies as 'skill'",
    (slug) => {
      // Real-shape case: an accessory/progression exercise for the skill,
      // named nothing like the skill itself (e.g. muscle-up swing prep) --
      // this is exactly the shape name-matching could never catch.
      const ex = exerciseTaggedWith(slug, { nameHe: 'תרגיל עזר כללי', mechanicalType: 'bent_arm', movementType: 'compound' });
      expect(classifyPriority(ex)).toBe('skill');
    },
  );

  it('planche: the REAL catalog spelling ("פלאנץ׳") now matches too, not just targetPrograms', () => {
    // Confirms the spelling fix independently -- strip targetPrograms so
    // ONLY the name-pattern path can decide.
    const ex = { id: 'x', name: { he: 'שכיבות סמיכה פלאנץ׳ בטאק מתקדם' }, tags: [], mechanicalType: 'bent_arm', movementType: 'compound', targetPrograms: [] };
    expect(classifyPriority(ex as any)).toBe('skill');
  });

  it('old spelling /פלאנש/i (never actually in the catalog) still matches too — kept, not removed', () => {
    const ex = { id: 'x', name: { he: 'פלאנש בטאק' }, tags: [], mechanicalType: 'straight_arm', movementType: 'compound', targetPrograms: [] };
    expect(classifyPriority(ex as any)).toBe('skill');
  });

  it('front_lever and human_flag (already-correct via name-matching) are not regressed', () => {
    const frontLever = exerciseTaggedWith('front_lever', { nameHe: 'פרונט לבר בטאק', mechanicalType: 'straight_arm', movementType: 'compound' });
    const humanFlag = exerciseTaggedWith('human_flag', { nameHe: 'דגל אנושי בטאק', mechanicalType: 'straight_arm', movementType: 'compound' });
    expect(classifyPriority(frontLever)).toBe('skill');
    expect(classifyPriority(humanFlag)).toBe('skill');
  });

  it('a genuine non-skill exercise (no skill targetPrograms, no skill-name match) is unaffected', () => {
    const genericPushup = exerciseTaggedWith('push', { nameHe: 'שכיבות סמיכה רגילות', mechanicalType: 'bent_arm', movementType: 'compound' });
    expect(classifyPriority(genericPushup)).toBe('foundation');
  });

  it("the explicit 'skill' tag path (pre-existing, untouched) still wins on its own, independent of targetPrograms", () => {
    const ex = exerciseTaggedWith('push', { nameHe: 'תרגיל ללא שם רלוונטי', tags: ['skill'] });
    expect(classifyPriority(ex)).toBe('skill');
  });
});
