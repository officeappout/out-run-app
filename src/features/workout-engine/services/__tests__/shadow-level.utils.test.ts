import { describe, it, expect } from 'vitest';
import { exerciseMatchesProgram, getEffectiveLevelForExercise } from '../shadow-level.utils';
import { buildIdToSlugMapFromPrograms } from '../program-hierarchy.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { Program } from '@/features/content/programs/core/program.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

/**
 * Housekeeping audit (mapping gaps in PROGRAM_MUSCLE_MAP / the legs
 * primaryMuscle matcher): 'forearms'/'traps' were already in
 * UPPER_BODY_MUSCLES but missing from PROGRAM_MUSCLE_MAP.pull, so a
 * forearms- or traps-primary exercise never surfaced under a back/biceps
 * (pull) selection even though they're real, tagged exercises. Separately,
 * 'adductors'/'hip_flexors' reconcile the legs primaryMuscle matcher with
 * muscle-chips.ts's own `legs` group, which already included both.
 */

function makeExercise(id: string, primaryMuscle: Exercise['primaryMuscle']): Exercise {
  return {
    id,
    name: { he: id, en: id },
    movementGroup: 'isolation',
    primaryMuscle,
    targetPrograms: [],
    programIds: [],
  } as any;
}

describe('exerciseMatchesProgram — PROGRAM_MUSCLE_MAP.pull gap fix', () => {
  it('a forearms-primary exercise now matches the pull program', () => {
    const ex = makeExercise('wrist-curl', 'forearms');
    expect(exerciseMatchesProgram(ex, 'pull')).toBe(true);
  });

  it('a traps-primary exercise now matches the pull program', () => {
    const ex = makeExercise('shrug', 'traps');
    expect(exerciseMatchesProgram(ex, 'pull')).toBe(true);
  });

  it('a push-only muscle (chest) still does not match pull', () => {
    const ex = makeExercise('bench-press', 'chest');
    expect(exerciseMatchesProgram(ex, 'pull')).toBe(false);
  });
});

describe('exerciseMatchesProgram — legs primaryMuscle matcher reconciliation', () => {
  it('an adductors-primary exercise matches the legs program', () => {
    const ex = makeExercise('hip-adduction', 'adductors');
    expect(exerciseMatchesProgram(ex, 'legs')).toBe(true);
  });

  it('a hip_flexors-primary exercise matches the legs program', () => {
    const ex = makeExercise('leg-raise', 'hip_flexors');
    expect(exerciseMatchesProgram(ex, 'legs')).toBe(true);
  });
});

describe('getEffectiveLevelForExercise — Stage 8 fix (program-identity audit §06): Step 4a resolves BOTH sides symmetrically', () => {
  // A planche exercise multi-tagged with its foundational parent (push) too
  // — the exact shape the "first-wins blindness" fix (Step 4a) exists for.
  // push is listed FIRST on purpose: Step 4b's plain array-order fallback
  // would pick push's level (5) if Step 4a's active-program match fails to
  // fire — that's the symptom this test distinguishes from the fix.
  function plancheExercise(): Exercise {
    return {
      id: 'planche-tuck',
      name: { he: 'פלאנץ׳ טאק', en: 'Tuck Planche' },
      movementGroup: 'isolation',
      targetPrograms: [
        { programId: 'push', level: 5 },
        { programId: 'planche', level: 7 },
      ],
      programIds: [],
    } as unknown as Exercise;
  }

  function userProfile(): UserFullProfile {
    return {
      progression: {
        tracks: {
          push: { currentLevel: 5, percent: 0 },
          planche: { currentLevel: 10, percent: 0 },
        },
        domains: {},
      },
    } as unknown as UserFullProfile;
  }

  it('activeProgramId already a slug — unaffected (existing behavior, confirms no regression)', () => {
    const level = getEffectiveLevelForExercise(plancheExercise(), userProfile(), undefined, 1, 'planche');
    expect(level).toBe(10);
  });

  it('activeProgramId is a legacy raw Firestore hash for the SAME skill — now resolves correctly (fails pre-fix: fell through to push=5 via Step 4b array order)', () => {
    buildIdToSlugMapFromPrograms([
      { id: 'pCI5NHXpowu2ySucqDn8', name: 'פלאנץ׳', slug: 'planche', movementPattern: null, isMaster: false } as unknown as Program,
    ]);
    const level = getEffectiveLevelForExercise(
      plancheExercise(),
      userProfile(),
      undefined,
      1,
      'pCI5NHXpowu2ySucqDn8', // activeProgramId — the hash, never resolved before this fix
    );
    expect(level).toBe(10); // planche's real level, not push's 5
  });
});
