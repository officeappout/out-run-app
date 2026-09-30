/**
 * program-card-state.test.ts — Progression System v2, Phase 4a / 4a-fix.
 *
 * Unit tests for resolveProgramCardState — the pure state->variant mapping
 * behind ProgramProgressCard's new `state` prop. Reuses Phase 1's real
 * derivePrerequisites/evaluateProgramGate/getProgramState (same synthetic-
 * catalog worked-example pattern as Phase 1/2/3's own tests).
 *
 * Phase 4a-fix (follow-up): 'available' must never be returned bare — it
 * structurally means "never assessed, no real data" (see the service's own
 * reasoning), which used to render a fabricated "level 1 / 0%" card. It now
 * always folds to either locked_prereq (a leaf/skill program — it HAS a
 * questionnaire) or not_started_master (it doesn't).
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

  it('a leaf/skill program with prerequisite met (raw "available") folds to locked_prereq + "בצע מבדק" — it has never been assessed itself, and it HAS its own questionnaire', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: CATALOG,
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: { pull: 10 },
      activeProgramSlugs: new Set(['pull']),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'בצע מבדק' });
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

  it('a non-leaf (master) program never gets prerequisite-derived, and folds "available" to not_started_master — never a fabricated own level, never "בצע מבדק" (no own questionnaire)', () => {
    const result = resolveProgramCardState({
      programSlug: 'full_body',
      isLeafSkillProgram: false,
      allExercises: CATALOG,
      rawSkillProgramId: 'full_body',
      flatTracksBySlug: {},
      activeProgramSlugs: new Set(),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'not_started_master' });
  });

  it('a master that IS active still resolves to active, not not_started_master', () => {
    const result = resolveProgramCardState({
      programSlug: 'full_body',
      isLeafSkillProgram: false,
      allExercises: CATALOG,
      rawSkillProgramId: 'full_body',
      flatTracksBySlug: { full_body: 3 },
      activeProgramSlugs: new Set(['full_body']),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'active' });
  });

  it('an empty exercise catalog (not yet hydrated) never crashes — a leaf program falls through to locked_prereq/"בצע מבדק"', () => {
    const result = resolveProgramCardState({
      programSlug: 'front_lever',
      isLeafSkillProgram: true,
      allExercises: [],
      rawSkillProgramId: FRONT_LEVER_RAW,
      flatTracksBySlug: {},
      activeProgramSlugs: new Set(),
      resolveDomainSlug: identitySlug,
    });
    expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'בצע מבדק' });
  });
});
