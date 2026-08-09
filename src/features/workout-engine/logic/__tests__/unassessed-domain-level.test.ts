import { describe, it, expect } from 'vitest';
import { UNASSESSED_DOMAIN_LEVEL } from '../contextual-engine.types';

/**
 * UNASSESSED_DOMAIN_LEVEL (09.08.2026) is deliberately -Infinity, not undefined/NaN — the
 * whole safety property of the "absent=absent for partial assessment" fix rests on this
 * sentinel failing every numeric comparison in ContextualEngine.ts correctly. These tests
 * replicate the EXACT formulas from the 3 real call sites (ContextualEngine.ts:164-171,
 * 240-241, 552-554) — not a re-implementation, a characterization of the actual math — so a
 * future change to the sentinel value can't silently reintroduce the NaN-admits-everything bug.
 */
describe('UNASSESSED_DOMAIN_LEVEL — sentinel safety property', () => {
  it('is -Infinity, not undefined/NaN/0', () => {
    expect(UNASSESSED_DOMAIN_LEVEL).toBe(-Infinity);
  });

  it('tolerance filter (ContextualEngine.ts:164-171): excludes regardless of the exercise\'s own level', () => {
    const levelTolerance = 3;
    const effectiveLevelForTolerance = UNASSESSED_DOMAIN_LEVEL;
    const minLevel = Math.max(1, effectiveLevelForTolerance - levelTolerance);
    const maxLevel = effectiveLevelForTolerance + levelTolerance;
    for (const programLevel of [1, 5, 12, 25]) {
      const excluded = programLevel < minLevel || programLevel > maxLevel;
      expect(excluded).toBe(true);
    }
  });

  it('skill gate (ContextualEngine.ts:240-241): excludes regardless of SKILL_GATE_MIN_LEVEL', () => {
    const SKILL_GATE_MIN_LEVEL = 15;
    const userEffective = UNASSESSED_DOMAIN_LEVEL;
    expect(userEffective < SKILL_GATE_MIN_LEVEL).toBe(true);
  });

  it('scoring (ContextualEngine.ts:552-554): contributes 0, never NaN, if ever reached independently', () => {
    const exerciseLevel = 10;
    const userEffectiveLevel = UNASSESSED_DOMAIN_LEVEL;
    const levelDiff = Math.abs(exerciseLevel - userEffectiveLevel);
    const levelScore = Math.max(0, 3 - levelDiff);
    expect(Number.isNaN(levelScore)).toBe(false);
    expect(levelScore).toBe(0);
  });

  it('field-fallback band check (compose-hybrid-session.service.ts:642): never counts as "in band"', () => {
    const targetLevel = 8;
    const HOME_SUBSTITUTE_LEVEL_BAND = 3;
    const inBand = Math.abs(UNASSESSED_DOMAIN_LEVEL - targetLevel) <= HOME_SUBSTITUTE_LEVEL_BAND;
    expect(inBand).toBe(false);
  });

  it('control: undefined would NOT be safe at any of the 3 ContextualEngine.ts sites (regression guard on the choice itself)', () => {
    const bad = undefined as unknown as number;
    const minLevel = Math.max(1, bad - 3);
    const maxLevel = bad + 3;
    // This is exactly the bug the sentinel avoids: NaN comparisons are always false.
    expect(5 < minLevel || 5 > maxLevel).toBe(false);
    expect(bad < 15).toBe(false);
  });
});
