/**
 * progression-v2-fanout-gating.test.ts — Progression System v2, Phase 2.
 *
 * Unit tests for the gate-respecting workout-completion fan-out: the
 * targetPrograms-based detection that replaced the old
 * exercise.programLevels-based one, the credit-eligibility predicate
 * (isCreditableProgramState), and a full chained worked-example trace
 * proving a locked program receives zero credit while the same program
 * gets credited once its prerequisite is met.
 *
 * Deliberately pure/synthetic, no live Firestore reads or writes — this is
 * a WRITE path (real users' progression.tracks), so unlike Phase 0/1's
 * read-only audits, this suite never touches real user data. It tests the
 * new pure pieces directly (detectTargetProgramsFromExercises,
 * calculateVolumeContribution, isCreditableProgramState — all exported
 * from progression.service.ts specifically to make this possible) and
 * chains them with Phase 1's real derivePrerequisites/evaluateProgramGate/
 * getProgramState using a small synthetic exercise catalog + slug map,
 * mirroring exactly what gateAndCreditTargetPrograms does internally.
 *
 * Imports from target-program-fanout.service.ts, NOT progression.service.ts
 * itself — the latter imports from the '@/features/content/programs'
 * barrel, which transitively pulls in JSX (program-icon.util.tsx) and
 * fails to parse under this repo's node-only vitest config. The 3
 * functions under test were extracted specifically to be reachable without
 * that barrel — see that file's own header comment.
 */
import { describe, it, expect } from 'vitest';
import {
  detectTargetProgramsFromExercises,
  calculateVolumeContribution,
  isCreditableProgramState,
  type ProgramSlugMap,
} from '../target-program-fanout.service';
import { derivePrerequisites, DOMAIN_PROGRAM_IDS } from '@/features/progression-map/services/prerequisite-derivation.service';
import { evaluateProgramGate, getProgramState } from '@/features/progression-map/services/program-gating.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExerciseResult } from '../../../core/types/progression.types';
import type { Program } from '@/features/content/programs/core/program.types';

// ── Synthetic id/slug fixtures (raw Firestore ids are deliberately NOT
// slug-shaped, to catch any code that silently assumes they're the same
// space — exactly the bug class Phase 2's recon found) ─────────────────
// Real pull-domain Firestore id (Phase 1's DOMAIN_PROGRAM_IDS.pull) — NOT a
// made-up id: derivePrerequisites only recognizes its 4 hardcoded domain
// ids as valid prerequisite tags, so the worked-example section below
// needs the real one to exercise the real derivation logic end to end.
const PULL_RAW = DOMAIN_PROGRAM_IDS.pull;
const FRONT_LEVER_RAW = 'RAWID_frontlever_4a1';
const FULL_BODY_RAW = 'RAWID_fullbody_00';
// Mirrors the real call site's `new Set(Object.keys(KNOWN_MASTER_PROGRAMS))`.
const MASTER_SLUGS = new Set(['full_body', 'upper_body', 'lower_body']);

function buildSlugMap(): ProgramSlugMap {
  const idToSlug = new Map([
    [PULL_RAW, 'pull'],
    [FRONT_LEVER_RAW, 'front_lever'],
    [FULL_BODY_RAW, 'full_body'],
  ]);
  const slugToId = new Map([
    ['pull', PULL_RAW],
    ['front_lever', FRONT_LEVER_RAW],
    ['full_body', FULL_BODY_RAW],
  ]);
  const idToProgram = new Map<string, Program>();
  return { idToSlug, slugToId, idToProgram };
}

function ex(id: string, targetPrograms: { programId: string; level: number }[]): Exercise {
  return { id, name: { he: id }, targetPrograms } as unknown as Exercise;
}

function workoutResult(exerciseId: string): WorkoutExerciseResult {
  return {
    exerciseId,
    exerciseName: exerciseId,
    programLevels: {},
    setsCompleted: 3,
    repsPerSet: [10, 10, 10],
    targetReps: 10,
    isCompound: false,
  };
}

describe('detectTargetProgramsFromExercises', () => {
  const slugMap = buildSlugMap();

  it('collects a candidate from a real targetPrograms tag, resolved to its slug', () => {
    const flExercise = ex('fl-1', [{ programId: FRONT_LEVER_RAW, level: 1 }]);
    const lookup = new Map([['fl-1', flExercise]]);
    const candidates = detectTargetProgramsFromExercises(
      [workoutResult('fl-1')],
      lookup,
      new Set(['pull']), // activeProgramId excluded
      slugMap,
      MASTER_SLUGS,
    );
    expect(candidates).toEqual(new Set(['front_lever']));
  });

  it('excludes activeProgramId even when it also appears as a targetPrograms tag', () => {
    const pullExercise = ex('p-1', [{ programId: PULL_RAW, level: 8 }]);
    const lookup = new Map([['p-1', pullExercise]]);
    const candidates = detectTargetProgramsFromExercises(
      [workoutResult('p-1')],
      lookup,
      new Set(['pull']),
      slugMap,
      MASTER_SLUGS,
    );
    expect(candidates.size).toBe(0);
  });

  it('excludes a master program slug — never treated as a linked candidate', () => {
    const taggedToMaster = ex('m-1', [{ programId: FULL_BODY_RAW, level: 3 }]);
    const lookup = new Map([['m-1', taggedToMaster]]);
    const candidates = detectTargetProgramsFromExercises(
      [workoutResult('m-1')],
      lookup,
      new Set(['pull']),
      slugMap,
      MASTER_SLUGS,
    );
    expect(candidates.size).toBe(0);
  });

  it('skips an unresolvable raw id rather than guessing', () => {
    const unresolvable = ex('u-1', [{ programId: 'RAWID_unknown_zz', level: 1 }]);
    const lookup = new Map([['u-1', unresolvable]]);
    const candidates = detectTargetProgramsFromExercises(
      [workoutResult('u-1')],
      lookup,
      new Set(['pull']),
      slugMap,
      MASTER_SLUGS,
    );
    expect(candidates.size).toBe(0);
  });

  it('fans out across multiple exercises (not single-select, unlike classifyExerciseToChild)', () => {
    const e1 = ex('e1', [{ programId: FRONT_LEVER_RAW, level: 1 }]);
    const e2 = ex('e2', [{ programId: PULL_RAW, level: 8 }, { programId: FRONT_LEVER_RAW, level: 2 }]);
    const lookup = new Map([['e1', e1], ['e2', e2]]);
    const candidates = detectTargetProgramsFromExercises(
      [workoutResult('e1'), workoutResult('e2')],
      lookup,
      new Set(['pull']), // pull is active — excluded even though e2 tags it
      slugMap,
      MASTER_SLUGS,
    );
    expect(candidates).toEqual(new Set(['front_lever']));
  });

  it('double-count guard: a slug already claimed by rule.linkedPrograms is excluded from detection', () => {
    const flExercise = ex('fl-1', [{ programId: FRONT_LEVER_RAW, level: 1 }]);
    const lookup = new Map([['fl-1', flExercise]]);
    // Simulates the real call site: excludeSlugs = {activeProgramId, ...ruleLinkedIds}
    const candidates = detectTargetProgramsFromExercises(
      [workoutResult('fl-1')],
      lookup,
      new Set(['pull', 'front_lever']), // front_lever already rule-linked this call
      slugMap,
      MASTER_SLUGS,
    );
    expect(candidates.size).toBe(0);
  });

  it('returns no candidates at all when slugMap is null (fail closed, cannot resolve anything)', () => {
    const flExercise = ex('fl-1', [{ programId: FRONT_LEVER_RAW, level: 1 }]);
    const lookup = new Map([['fl-1', flExercise]]);
    const candidates = detectTargetProgramsFromExercises([workoutResult('fl-1')], lookup, new Set(), null, MASTER_SLUGS);
    expect(candidates.size).toBe(0);
  });
});

describe('calculateVolumeContribution', () => {
  const slugMap = buildSlugMap();

  it('counts only exercises really tagged to the target slug', () => {
    const tagged = ex('t-1', [{ programId: FRONT_LEVER_RAW, level: 1 }]);
    const untagged = ex('t-2', [{ programId: PULL_RAW, level: 8 }]);
    const lookup = new Map([['t-1', tagged], ['t-2', untagged]]);
    const contribution = calculateVolumeContribution(
      [workoutResult('t-1'), workoutResult('t-2')],
      'front_lever',
      lookup,
      slugMap,
    );
    expect(contribution).toBe(0.5); // 1 of 2 exercises tagged
  });

  it('returns 0 for an empty exercise list', () => {
    expect(calculateVolumeContribution([], 'front_lever', new Map(), slugMap)).toBe(0);
  });

  it('returns 0 when slugMap is null', () => {
    expect(calculateVolumeContribution([workoutResult('x')], 'front_lever', new Map(), null)).toBe(0);
  });
});

describe('isCreditableProgramState — the Phase 2 product decision', () => {
  it('credits active, tracked, and available', () => {
    expect(isCreditableProgramState('active')).toBe(true);
    expect(isCreditableProgramState('tracked')).toBe(true);
    expect(isCreditableProgramState('available')).toBe(true);
  });

  it('does NOT credit locked_prereq, needs_assessment, or locked_pro', () => {
    expect(isCreditableProgramState('locked_prereq')).toBe(false);
    expect(isCreditableProgramState('needs_assessment')).toBe(false);
    expect(isCreditableProgramState('locked_pro')).toBe(false);
  });
});

describe('Worked-example trace — a locked program receives zero credit (chained, real Phase 1 functions)', () => {
  // Mirrors gateAndCreditTargetPrograms's own internal chain exactly:
  // derivePrerequisites -> translate to slug space -> evaluateProgramGate
  // -> getProgramState -> isCreditableProgramState. Synthetic catalog: a
  // "front_lever" skill program whose level-1 exercise requires pull L10.
  const slugMap = buildSlugMap();
  const frontLeverLevel1Exercise = ex('fl-level1', [
    { programId: FRONT_LEVER_RAW, level: 1 },
    { programId: PULL_RAW, level: 10 },
  ]);
  const catalog: Exercise[] = [frontLeverLevel1Exercise];

  function runChain(pullCurrentLevel: number | undefined) {
    const rawPrereqs = derivePrerequisites(catalog, FRONT_LEVER_RAW);
    const prereqsSlugSpace = rawPrereqs.map((p) => ({
      domainProgramId: slugMap.idToSlug.get(p.domainProgramId) ?? p.domainProgramId,
      minLevel: p.minLevel,
    }));
    const flatTracks: Record<string, number> = {};
    if (pullCurrentLevel != null) flatTracks.pull = pullCurrentLevel;

    const gate = evaluateProgramGate({ tracks: flatTracks, tier: 1 }, {}, prereqsSlugSpace);
    const state = getProgramState(
      { tracks: flatTracks, tier: 1, activeProgramIds: new Set(['pull']) },
      'front_lever',
      gate,
    );
    return { gate, state, credited: isCreditableProgramState(state) };
  }

  it('derives pull L10 as the real prerequisite from the synthetic catalog', () => {
    const rawPrereqs = derivePrerequisites(catalog, FRONT_LEVER_RAW);
    expect(rawPrereqs).toEqual([{ domainProgramId: PULL_RAW, minLevel: 10 }]);
  });

  it('user with pull L5 (below the L10 requirement): locked_prereq, zero credit', () => {
    const { gate, state, credited } = runChain(5);
    expect(gate).toEqual({
      status: 'locked_prereq',
      requirements: [{ domainProgramId: 'pull', need: 10, have: 5 }],
    });
    expect(state).toBe('locked_prereq');
    expect(credited).toBe(false); // <-- the worked example's core assertion: zero credit
  });

  it('user who never assessed pull at all: needs_assessment, zero credit', () => {
    const { gate, state, credited } = runChain(undefined);
    expect(gate.status).toBe('needs_assessment');
    expect(state).toBe('needs_assessment');
    expect(credited).toBe(false);
  });

  it('user with pull L10 (prerequisite exactly met): available, IS credited', () => {
    const { gate, state, credited } = runChain(10);
    expect(gate).toEqual({ status: 'available' });
    expect(state).toBe('available');
    expect(credited).toBe(true);
  });

  it('user already tracking front_lever directly: tracked, IS credited regardless of the pull gate', () => {
    const rawPrereqs = derivePrerequisites(catalog, FRONT_LEVER_RAW);
    const prereqsSlugSpace = rawPrereqs.map((p) => ({
      domainProgramId: slugMap.idToSlug.get(p.domainProgramId) ?? p.domainProgramId,
      minLevel: p.minLevel,
    }));
    // pull is still only L5 (would gate to locked_prereq on its own), but
    // the user already has a front_lever track entry -> tracked wins.
    const flatTracks: Record<string, number> = { pull: 5, front_lever: 2 };
    const gate = evaluateProgramGate({ tracks: flatTracks, tier: 1 }, {}, prereqsSlugSpace);
    const state = getProgramState(
      { tracks: flatTracks, tier: 1, activeProgramIds: new Set(['pull']) },
      'front_lever',
      gate,
    );
    expect(state).toBe('tracked');
    expect(isCreditableProgramState(state)).toBe(true);
  });
});
