/**
 * Route + stops for a SYNTHETIC profile with the structure of the owner's test account (no real
 * data): level-1 core/legs, high push/pull, full_body program, raw-id (non-slug) tracks.
 * His report: "הליכה + עצירות" shows no strength.
 *
 * Pins what was verified for that structure (hermetic corpus, 19.10.2026): level-1 core /
 * legs count as ASSESSED (not dropped as unassessed), raw-id tracks resolve without breaking the
 * map, the session's target domains are the full-body four, and a spent weekly budget still
 * defaults to core (a core stop is runnable for him — he does not hit the lock-card path that
 * route-stops-spent-budget-core.test.ts covers).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => import('../../../../../tests/invariants/hermetic/firebase.stub'));
vi.mock('firebase/firestore', () => import('../../../../../tests/invariants/hermetic/firestore.stub'));

import { resolveHybridUserLevels } from '../hybrid-context.util';
import { applySpentBudgetCoreDefault, isCoreStopRunnable } from '../weekly-budget-gate';
import { resolveChildDomainsForParent } from '../../services/program-hierarchy.utils';

const lvl = (currentLevel: number) => ({ currentLevel });
const OWNER_SHAPE = {
  id: 'synthetic-user',
  progression: {
    activePrograms: [
      { id: 'full_body', templateId: 'full_body', focusDomains: ['full_body'], name: 'full body' },
      { id: 'rawProgramIdB', templateId: 'rawProgramIdB', focusDomains: ['rawProgramIdB'], name: 'rawProgramIdB' },
    ],
    skillFocusIds: ['front_lever', 'planche'],
    tracks: {
      core: lvl(1), legs: lvl(1), push: lvl(12), pull: lvl(22), upper_body: lvl(21), full_body: lvl(15),
      front_lever: lvl(13), muscle_up: lvl(21), planche: lvl(10), calisthenics_upper: lvl(13),
      rawMasterIdA: lvl(15), 'rawProgramIdB': lvl(21), rawSkillIdC: lvl(21),
    },
    domains: {
      core: { currentLevel: 1, isUnlocked: true }, legs: { currentLevel: 1, isUnlocked: true },
      push: { currentLevel: 12, isUnlocked: true }, pull: { currentLevel: 22, isUnlocked: true },
      human_flag: { currentLevel: 0, isUnlocked: true }, handstand: { currentLevel: 0, isUnlocked: true },
      full_body: { currentLevel: 15, isUnlocked: true }, upper_body: { currentLevel: 21, isUnlocked: true },
      rawMasterIdA: { currentLevel: 15, isUnlocked: null },
    },
  },
};

describe('route + stops — owner profile shape', () => {
  it('level-1 core and legs are assessed domains (not dropped), push/pull keep their levels', async () => {
    const { userProgramLevels } = await resolveHybridUserLevels(OWNER_SHAPE as never, '[test]');
    expect(userProgramLevels.get('core')).toBe(1);
    expect(userProgramLevels.get('legs')).toBe(1);
    expect(userProgramLevels.get('push')).toBe(12);
    expect(userProgramLevels.get('pull')).toBe(22);
    expect(isCoreStopRunnable(userProgramLevels)).toBe(true);
  });

  it('the full_body program targets all four domains (a station split never lands on an unassessed one)', () => {
    expect([...resolveChildDomainsForParent('full_body', OWNER_SHAPE as never)].sort()).toEqual(['core', 'legs', 'pull', 'push']);
  });

  it('spent weekly budget → core default still applies for him (runnable core stop)', async () => {
    const { userProgramLevels } = await resolveHybridUserLevels(OWNER_SHAPE as never, '[test]');
    const r = applySpentBudgetCoreDefault(
      [{ activityType: 'strength' }], { weeklyBudget: 44, totalSetsCompleted: 44 }, userProgramLevels,
    );
    expect(r.reason).toBe('defaulted_to_core');
  });
});
