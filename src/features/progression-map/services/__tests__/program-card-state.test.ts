/**
 * program-card-state.test.ts — Progression System v2, Phase 4a.
 *
 * Unit tests for resolveProgramCardState — the pure state->variant mapping
 * behind ProgramProgressCard's new `state` prop. Reuses Phase 1's real
 * derivePrerequisites/evaluateProgramGate/getProgramState (same synthetic-
 * catalog worked-example pattern as Phase 1/2/3's own tests), asserting the
 * full chain: active/tracked/available map through unchanged; locked_prereq
 * carries the derived prerequisite label; needs_assessment renders like
 * locked_prereq but with the "בצע מבדק" hint instead.
 */
import { describe, it, expect } from 'vitest';
import { resolveProgramCardState } from '../program-card-state.service';
import { DOMAIN_PROGRAM_IDS } from '../prerequisite-derivation.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

const FRONT_LEVER_RAW = 'RAWID_frontlever_4a1';
const PULL_RAW = DOMAIN_PROGRAM_IDS.pull; // must be a real hardcoded domain id — derivePrerequisites only recognizes these 4

function ex(id: string, targetPrograms: { programId: string; level: number }[]): Exercise {
  return { id, name: { he: id }, targetPrograms } as unknown as Exercise;
}

// A minimal skill catalog: front_lever's own lowest-level exercise requires pull L10.
const CATALOG: Exercise[] = [
  ex('fl-level1', [
    { programId: FRONT_LEVER_RAW, level: 1 },
    { programId: PULL_RAW, level: 10 },
  ]),
];

const identitySlug = (id: string) => (id === PULL_RAW ? 'pull' : id);

describe('resolveProgramCardState', () => {
  it('active (in activePrograms) maps straight through, no hint', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: CATALOG,
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: { pull: 5 }, // would gate to locked_prereq on its own...
      activeProgramSlugs: new Set(['front_lever']), // ...but active wins first
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'active' });
  });

  it('tracked (has a track entry, not active) maps straight through, no hint', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: CATALOG,
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: { pull: 5, front_lever: 2 },
      activeProgramSlugs: new Set(['pull']),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'tracked' });
  });

  it('available (prerequisite met, not active/tracked) maps straight through, no hint', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: CATALOG,
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: { pull: 10 },
      activeProgramSlugs: new Set(['pull']),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'available' });
  });

  it('locked_prereq: below the required level -> the derived "דרוש X Y" hint', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: CATALOG,
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: { pull: 5 },
      activeProgramSlugs: new Set(['pull']),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'דרוש משיכה 10' });
  });

  it('needs_assessment: prerequisite domain never assessed -> renders like locked_prereq with "בצע מבדק"', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: CATALOG,
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: {}, // pull never assessed at all
      activeProgramSlugs: new Set(),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'בצע מבדק' });
  });

  it('a non-leaf (master) program never gets prerequisite-derived, always resolves available/active/tracked', () => {
    const result = resolveProgramCardState({
      programSlug: 'full_body',
      isLeafSkillProgram: false,
      allExercises: CATALOG,
      rawSkillProgramId: 'full_body',
      flatTracksBySlug: {},
      activeProgramSlugs: new Set(),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'available' });
  });

  it('an empty exercise catalog (not yet hydrated) never crashes — falls through to available', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: [],
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: {},
      activeProgramSlugs: new Set(),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'available' });
  });
});
