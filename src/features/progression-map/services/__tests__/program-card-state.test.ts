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
import { resolveProgramCardState, countConfiguredDomainChildren, buildFlatTracksBySlug } from '../program-card-state.service';
import { DOMAIN_PROGRAM_IDS } from '../prerequisite-derivation.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

const FRONT_LEVER_RAW = 'RAWID_frontlever_4a1';
const PULL_RAW = DOMAIN_PROGRAM_IDS.pull; // must be a real hardcoded domain id — derivePrerequisites only recognizes these 4
const PUSH_RAW = DOMAIN_PROGRAM_IDS.push;
const MUSCLE_UP_RAW = 'fTLWzjP9gH2VNpamyCZF'; // real Firestore id — matches the MANUAL_PREREQUISITE_OVERRIDES key

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
const pushPullSlug = (id: string) => (id === PULL_RAW ? 'pull' : id === PUSH_RAW ? 'push' : id);

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

  describe('muscle_up — Phase 4c-2 "Model A" (AND-of-two-domains via MANUAL_PREREQUISITE_OVERRIDES)', () => {
    it('both push and pull below minLevel 10 -> the hint names BOTH, not just the first', () => {
      const result = resolveProgramCardState({
        programSlug: 'muscle_up',
        isLeafSkillProgram: true,
        // Non-empty on purpose: resolveProgramCardState only calls
        // derivePrerequisites at all when allExercises.length > 0 (its own
        // pre-check guard, separate from the override living inside
        // derivePrerequisites itself) — content is irrelevant for muscle_up,
        // the override short-circuits before any of it is read.
        allExercises: CATALOG,
        rawSkillProgramId: MUSCLE_UP_RAW,
        flatTracksBySlug: { push: 5, pull: 3 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: pushPullSlug,
      });
      expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'דרוש דחיפה 10 ומשיכה 10' });
    });

    it('pull satisfied but push still below minLevel -> only the unmet one is named (AND semantics: still locked)', () => {
      const result = resolveProgramCardState({
        programSlug: 'muscle_up',
        isLeafSkillProgram: true,
        allExercises: CATALOG, // non-empty, see comment above — content irrelevant, the override short-circuits
        rawSkillProgramId: MUSCLE_UP_RAW,
        flatTracksBySlug: { push: 5, pull: 12 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: pushPullSlug,
      });
      expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'דרוש דחיפה 10' });
    });

    it('both push and pull at/above minLevel 10 -> unlocked (folds to locked_prereq + "בצע מבדק", same as any other leaf whose prerequisite is met)', () => {
      const result = resolveProgramCardState({
        programSlug: 'muscle_up',
        isLeafSkillProgram: true,
        allExercises: CATALOG, // non-empty, see comment above — content irrelevant, the override short-circuits
        rawSkillProgramId: MUSCLE_UP_RAW,
        flatTracksBySlug: { push: 10, pull: 14 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: pushPullSlug,
      });
      expect(result).toEqual({ state: 'locked_prereq', lockedHint: 'בצע מבדק' });
    });
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

  describe('configuredMasterChildCount — Phase 4b round 3 (the "too many masters at L14" / "calisthenics_upper opens with only [pull]" fix)', () => {
    it('a tracked master with FEWER than 2 configured children folds to not_started_master, not tracked', () => {
      const result = resolveProgramCardState({
        programSlug: 'calisthenics_upper',
        isLeafSkillProgram: false,
        allExercises: CATALOG,
        rawSkillProgramId: 'calisthenics_upper',
        flatTracksBySlug: { calisthenics_upper: 5 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: identitySlug,
        configuredMasterChildCount: 1,
      });
      expect(result).toEqual({ state: 'not_started_master' });
    });

    it('a tracked master with 0 configured children ALSO folds to not_started_master', () => {
      const result = resolveProgramCardState({
        programSlug: 'calisthenics_upper',
        isLeafSkillProgram: false,
        allExercises: CATALOG,
        rawSkillProgramId: 'calisthenics_upper',
        flatTracksBySlug: { calisthenics_upper: 5 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: identitySlug,
        configuredMasterChildCount: 0,
      });
      expect(result).toEqual({ state: 'not_started_master' });
    });

    it('a tracked master with 2 or more configured children stays tracked, real number shown', () => {
      const result = resolveProgramCardState({
        programSlug: 'calisthenics_upper',
        isLeafSkillProgram: false,
        allExercises: CATALOG,
        rawSkillProgramId: 'calisthenics_upper',
        flatTracksBySlug: { calisthenics_upper: 5 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: identitySlug,
        configuredMasterChildCount: 2,
      });
      expect(result).toEqual({ state: 'tracked' });
    });

    it('undefined count (master Program doc not fetched yet) never gates — stays tracked, no flash of the wrong state', () => {
      const result = resolveProgramCardState({
        programSlug: 'calisthenics_upper',
        isLeafSkillProgram: false,
        allExercises: CATALOG,
        rawSkillProgramId: 'calisthenics_upper',
        flatTracksBySlug: { calisthenics_upper: 5 },
        activeProgramSlugs: new Set(),
        resolveDomainSlug: identitySlug,
      });
      expect(result).toEqual({ state: 'tracked' });
    });

    it('the gate is scoped to tracked ONLY, never active — an active master with 1 child still resolves to active', () => {
      const result = resolveProgramCardState({
        programSlug: 'calisthenics_upper',
        isLeafSkillProgram: false,
        allExercises: CATALOG,
        rawSkillProgramId: 'calisthenics_upper',
        flatTracksBySlug: { calisthenics_upper: 5 },
        activeProgramSlugs: new Set(['calisthenics_upper']),
        resolveDomainSlug: identitySlug,
        configuredMasterChildCount: 1,
      });
      expect(result).toEqual({ state: 'active' });
    });

    it('a LEAF program is never subject to this gate even if a caller mistakenly passes a low count', () => {
      const result = resolveProgramCardState({
        programSlug: 'front_lever',
        isLeafSkillProgram: true,
        allExercises: CATALOG,
        rawSkillProgramId: FRONT_LEVER_RAW,
        flatTracksBySlug: { pull: 5, front_lever: 2 },
        activeProgramSlugs: new Set(['pull']),
        resolveDomainSlug: identitySlug,
        configuredMasterChildCount: 0,
      });
      expect(result).toEqual({ state: 'tracked' });
    });
  });
});

describe('countConfiguredDomainChildren — Phase 4b round 4 (domain-only refinement: exclude the skill\'s own entry, no provenance signal available to exclude derived-only)', () => {
  it('a master with a real level on 2 of the 4 canonical domains counts 2', () => {
    expect(countConfiguredDomainChildren(['push', 'pull', 'legs', 'core'], { push: 10, pull: 14 })).toBe(2);
  });

  it("a skill's own subProgram slug (never one of the 4 canonical domains) is excluded from the count even though it has a real level — the exact calisthenics_upper case (front_lever + derived pull)", () => {
    expect(
      countConfiguredDomainChildren(['front_lever', 'planche', 'push', 'pull'], { front_lever: 5, pull: 14 }),
    ).toBe(1); // only 'pull' — front_lever is excluded for not being a domain slug, regardless of its own real level
  });

  it('a single derived domain (the reported bug\'s exact shape) counts 1, correctly below the >=2 threshold', () => {
    expect(countConfiguredDomainChildren(['push', 'pull'], { pull: 14 })).toBe(1);
  });

  it('no configured domains at all counts 0', () => {
    expect(countConfiguredDomainChildren(['push', 'pull', 'legs', 'core'], {})).toBe(0);
  });

  it('a track present but at level 0 (filtered out upstream by flatTracksBySlug\'s own >0 rule) is not double-counted here — relies on the caller only passing real (>0) entries', () => {
    // flatTracksBySlug is documented as already >0-filtered by the caller (useProgramCardState) —
    // this test only confirms the function doesn't need its own redundant level check to behave correctly.
    expect(countConfiguredDomainChildren(['push', 'pull'], { push: 10 })).toBe(1);
  });

  it('duplicate slugs in subProgramSlugs (defensive — should not happen in real data) do not inflate the count', () => {
    expect(countConfiguredDomainChildren(['pull', 'pull', 'push'], { pull: 14, push: 10 })).toBe(2);
  });
});

describe('buildFlatTracksBySlug — Phase 4b round 5 (shared by useProgramCardState and useGatedProgramBuckets)', () => {
  const resolve = (id: string) => (id === 'RAWID_upper' ? 'calisthenics_upper' : id);

  it('resolves mixed id/slug keys into one slug-normalized map, real levels only', () => {
    expect(buildFlatTracksBySlug({ pull: { currentLevel: 14 }, RAWID_upper: { currentLevel: 5 } }, resolve)).toEqual({
      pull: 14,
      calisthenics_upper: 5,
    });
  });

  it('drops entries with currentLevel 0 or missing', () => {
    expect(buildFlatTracksBySlug({ pull: { currentLevel: 0 }, push: {}, legs: { currentLevel: 10 } }, resolve)).toEqual({
      legs: 10,
    });
  });

  it('empty tracks map yields an empty result, no crash', () => {
    expect(buildFlatTracksBySlug({}, resolve)).toEqual({});
  });
});
