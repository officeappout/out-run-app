/**
 * tree-node-state.test.ts — Progression System v2, Phase 4a-fix.
 *
 * Unit tests for deriveState — specifically the fix: an unassessed user
 * (currentLevel === null) must get NO "אתה כאן" ('current') marker on any
 * rung, while the done/locked/target ladder shape for every OTHER rung
 * stays exactly as it was before this fix (regression coverage).
 */
import { describe, it, expect } from 'vitest';
import { deriveState } from '../tree-node-state.service';
import type { SkillTreeData, SkillTreeRung } from '../../core/types';

function rung(level: number): SkillTreeRung {
  return { level, representative: null, siblingCount: 0, isGap: false };
}

const TREE: SkillTreeData = {
  programId: 'p1',
  rungs: [1, 2, 3, 4, 5].map(rung),
  minLevel: 1,
  maxLevel: 5,
  exerciseCount: 5,
};

describe('deriveState — unassessed (currentLevel === null)', () => {
  it('never returns "current" for ANY rung when unassessed', () => {
    for (const r of TREE.rungs) {
      expect(deriveState(r, TREE, null)).not.toBe('current');
    }
  });

  it('the rung that would have been current (tree.minLevel) is "locked" instead', () => {
    expect(deriveState(rung(TREE.minLevel), TREE, null)).toBe('locked');
  });

  it('the max-level rung is still "target" regardless of assessment status', () => {
    expect(deriveState(rung(TREE.maxLevel), TREE, null)).toBe('target');
  });

  it('rungs above minLevel are "locked" when unassessed (nothing is presumed "done")', () => {
    expect(deriveState(rung(3), TREE, null)).toBe('locked');
  });
});

describe('deriveState — assessed (currentLevel is a real number)', () => {
  it('the rung at currentLevel is "current"', () => {
    expect(deriveState(rung(3), TREE, 3)).toBe('current');
  });

  it('rungs below currentLevel are "done"', () => {
    expect(deriveState(rung(1), TREE, 3)).toBe('done');
    expect(deriveState(rung(2), TREE, 3)).toBe('done');
  });

  it('rungs above currentLevel (below max) are "locked"', () => {
    expect(deriveState(rung(4), TREE, 3)).toBe('locked');
  });

  it('the max-level rung is always "target", even before it is reached', () => {
    expect(deriveState(rung(TREE.maxLevel), TREE, 1)).toBe('target');
  });

  it('the max-level rung stays "target" even once actually reached', () => {
    expect(deriveState(rung(TREE.maxLevel), TREE, TREE.maxLevel)).toBe('target');
  });
});
