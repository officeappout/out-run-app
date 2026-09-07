import { describe, it, expect } from 'vitest';
import {
  matchesAnyRequiredDomain,
  selectExercisesWithDomainQuotas,
  selectExercisesWithDominance,
} from '../workout-selection.utils';
import type { ScoredExercise } from '../contextual-engine.types';
import type { WorkoutGenerationContext } from '../workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Task 4 (docs/workout-engine/03-CHANGES.md Addendum 35, 07.09.2026): the 3
 * remaining High-severity domain-blind sites from Addendum 26's audit,
 * closed with the SAME shared gate (`matchesAnyRequiredDomain`) — not 3
 * separate point-fixes:
 *   1. selectExercisesWithDomainQuotas's final "any" fallback — used to skip
 *      the domain check ENTIRELY whenever context.strictDomains wasn't set
 *      (the common 'auto' case). takeFromPool (Addendum 26) never had this
 *      strictDomains dependency — only this sibling block did.
 *   2/3. selectExercisesWithDominance's accessoryPool + tail-fill — this
 *      function (the P1/P2/P3 skill-dominance selection path) never
 *      consulted context.requiredDomains at all, pre-empting domain quotas
 *      entirely for any call that has both a dominanceRatio AND
 *      requiredDomains set.
 *
 * Both fixes fail OPEN when requiredDomains is empty/absent — a call with no
 * domain context at all (a plain full-body request, or a pure skill/
 * dominance request with no domains derived) is unaffected; the gate only
 * starts mattering once requiredDomains is actually set for that call.
 */

function makeEx(id: string, programId: string, level: number, tags: string[] = []): Exercise {
  return { id, name: { he: id, en: id }, targetPrograms: [{ programId, level }], tags } as any;
}

function scored(ex: Exercise, score: number): ScoredExercise {
  return { exercise: ex, method: 'bodyweight' as any, score, reasoning: [], mechanicalType: 'none' as any, levelDiff: -1 } as any;
}

describe('matchesAnyRequiredDomain — the shared gate itself', () => {
  const context = (requiredDomains?: string[]) => ({ requiredDomains } as WorkoutGenerationContext);

  it('fails open (true) when requiredDomains is absent — no domain context to gate on', () => {
    expect(matchesAnyRequiredDomain(makeEx('e1', 'push', 5), context(undefined))).toBe(true);
  });

  it('fails open (true) when requiredDomains is an empty array', () => {
    expect(matchesAnyRequiredDomain(makeEx('e1', 'push', 5), context([]))).toBe(true);
  });

  it('matches when the exercise belongs to one of the required domains', () => {
    expect(matchesAnyRequiredDomain(makeEx('e1', 'push', 5), context(['push', 'legs']))).toBe(true);
  });

  it('rejects when the exercise belongs to none of the required domains', () => {
    expect(matchesAnyRequiredDomain(makeEx('e1', 'core', 5), context(['push', 'legs']))).toBe(false);
  });
});

describe('selectExercisesWithDomainQuotas — final "any" fallback respects domain even when strictDomains is unset (site 1)', () => {
  it('prefers a cap-excess on-domain candidate over a much-higher-scored off-domain one, with strictDomains never set', () => {
    // 2 required domains → per-domain cap = ceil(6/2) = 3. Dedicated pick
    // takes 1 of each (push_top, legs_top). 5 more push candidates exist
    // (real, on-domain) but the cap only allows 2 more through
    // takeFromPool, leaving 3 "cap-excess" push candidates genuinely
    // available but unselected. Only 1 more legs candidate exists (used).
    // 4 off-domain 'core' fillers score far higher than everything else.
    // Total: 12 fixtures == count*2, so none get cut by the difficulty
    // pre-filter — every fixture is visible to the domain-quota logic.
    const pushTop = scored(makeEx('push-top', 'push', 5), 500);
    const pushExtras = [90, 80, 70, 60, 50].map((score, i) =>
      scored(makeEx(`push-${i}`, 'push', 5, ['compound']), score),
    );
    const legsTop = scored(makeEx('legs-top', 'legs', 5), 500);
    const legsExtra = scored(makeEx('legs-extra', 'legs', 5, ['compound']), 85);
    const coreFillers = [1000, 999, 998, 997].map((score, i) =>
      scored(makeEx(`core-filler-${i}`, 'core', 5), score),
    );
    const pool = [pushTop, ...pushExtras, legsTop, legsExtra, ...coreFillers];

    const context: WorkoutGenerationContext = {
      userLevel: 10,
      requiredDomains: ['push', 'legs'],
      userProgramLevels: new Map([['push', 5], ['legs', 5]]),
      globalExercisePool: [],
      // strictDomains: intentionally NOT set — this is exactly the gap.
    } as any;

    for (let i = 0; i < 10; i++) {
      const selected = selectExercisesWithDomainQuotas(pool as any, 6, true, context, 2 as any);
      expect(selected).toHaveLength(6);
      const domains = selected.map((s) => (s.exercise as any).targetPrograms[0].programId);
      expect(domains.every((d) => d === 'push' || d === 'legs')).toBe(true);
      expect(domains.some((d) => d === 'core')).toBe(false);
    }
  });
});

describe('selectExercisesWithDominance — accessoryPool + tail-fill respect requiredDomains when set (sites 2/3)', () => {
  it('fills as many real requested-domain candidates as exist before falling back to a much-higher-scored off-domain pool', () => {
    // priority1/priority2 skill pools are deliberately empty (skill_a/
    // skill_b match nothing in the fixture pool) so every slot is filled by
    // the accessoryPool + tail-fill paths — exactly the 2 sites in
    // question. requiredDomains=['push'] alongside a real dominanceRatio —
    // the combination the audit flagged as completely unhandled.
    const pushCandidates = [50, 40].map((score, i) => scored(makeEx(`push-${i}`, 'push', 5), score));
    const offDomainFillers = [1000, 999, 998, 997].map((score, i) =>
      scored(makeEx(`legs-filler-${i}`, 'legs', 5), score),
    );
    const pool = [...pushCandidates, ...offDomainFillers];

    const context: WorkoutGenerationContext = {
      userLevel: 10,
      dominanceRatio: { p1: 0.1, p2: 0.1 },
      priority1SkillIds: ['skill_a'],
      priority2SkillIds: ['skill_b'],
      dailySetBudget: 6,
      requiredDomains: ['push'],
    } as any;

    for (let i = 0; i < 10; i++) {
      const selected = selectExercisesWithDominance(pool as any, 5, true, context, 2 as any);
      expect(selected).toHaveLength(5);
      const pushSelected = selected.filter((s) => (s.exercise as any).targetPrograms[0].programId === 'push');
      // Both real push candidates must be used before any off-domain
      // filler — pre-fix, accessoryPool/tail-fill ranked purely by score
      // and could leave real on-domain candidates unused while off-domain
      // fillers (scored far higher) took their slots.
      expect(pushSelected).toHaveLength(2);
    }
  });

  it('is unaffected when requiredDomains is not set — pure skill/dominance requests keep their existing behavior', () => {
    const offDomainFillers = [1000, 999].map((score, i) => scored(makeEx(`legs-filler-${i}`, 'legs', 5), score));
    const context: WorkoutGenerationContext = {
      userLevel: 10,
      dominanceRatio: { p1: 0.1, p2: 0.1 },
      priority1SkillIds: ['skill_a'],
      priority2SkillIds: ['skill_b'],
      dailySetBudget: 6,
      // requiredDomains intentionally absent.
    } as any;

    const selected = selectExercisesWithDominance(offDomainFillers as any, 2, true, context, 2 as any);
    expect(selected).toHaveLength(2);
  });
});
