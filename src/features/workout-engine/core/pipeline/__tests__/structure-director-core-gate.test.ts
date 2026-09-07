import { describe, it, expect } from 'vitest';
import { createStructureDirector } from '../StructureDirector';
import type { WorkoutGenerationContext, DifficultyLevel } from '../../../logic/workout-generator.types';

/**
 * docs/workout-engine/09-CORE-TABATA.md §3/§4: "15min + strength goal (performance_
 * boost) → core doesn't enter unless time remains", and the explicit manual-builder
 * exemption — isManualOverride skips this rule entirely (David's decision).
 */

const baseContext = (overrides: Partial<WorkoutGenerationContext>): WorkoutGenerationContext =>
  ({
    availableTime: 30,
    userLevel: 10,
    daysInactive: 0,
    intentMode: 'standard',
    persona: null,
    location: 'park',
    injuryCount: 0,
    requiredDomains: ['push', 'pull', 'legs', 'core'],
    ...overrides,
  } as WorkoutGenerationContext);

const hasCoreBlock = (context: WorkoutGenerationContext, difficulty: DifficultyLevel = 2): boolean => {
  const blueprint = createStructureDirector().plan(context, difficulty);
  return blueprint.blocks.some((b) => b.domain === 'core');
};

describe('StructureDirector — core duration/goal gate', () => {
  it('15min + performance_boost + no time headroom (3 other domains × 5min reserved = 15 ≥ 15) → core excluded', () => {
    const context = baseContext({ availableTime: 15, mainGoal: 'performance_boost' });
    expect(hasCoreBlock(context)).toBe(false);
  });

  it('20min + performance_boost (above the 15min threshold) → rule does not apply, core included', () => {
    const context = baseContext({ availableTime: 20, mainGoal: 'performance_boost' });
    expect(hasCoreBlock(context)).toBe(true);
  });

  it('15min + a non-strength goal → rule does not apply, core included', () => {
    const context = baseContext({ availableTime: 15, mainGoal: 'weight_loss' });
    expect(hasCoreBlock(context)).toBe(true);
  });

  it('15min + performance_boost + fewer non-core domains (time budget actually remains) → core included', () => {
    // Full-body strategy requires domains.length===0 or >=3 (_detectStrategy) —
    // 2 non-core domains + core = 3 total, still under the 15min reservation.
    const context = baseContext({ availableTime: 15, mainGoal: 'performance_boost', requiredDomains: ['push', 'pull', 'core'] });
    expect(hasCoreBlock(context)).toBe(true);
  });

  it('manual builder (isManualOverride) → the exclusion rule never fires, even at 15min + performance_boost', () => {
    const context = baseContext({ availableTime: 15, mainGoal: 'performance_boost', isManualOverride: true });
    expect(hasCoreBlock(context)).toBe(true);
  });

  it('core absent from requiredDomains entirely → no block regardless of the gate (unrelated to this rule)', () => {
    const context = baseContext({ availableTime: 30, mainGoal: 'performance_boost', requiredDomains: ['push', 'pull', 'legs'] });
    expect(hasCoreBlock(context)).toBe(false);
  });
});

/**
 * Rule A vs Rule B (David, 07.09.2026 — Addendum 36): core the user explicitly
 * requested stands equal to push/pull/legs (main-tier, isAccessorySlot false);
 * core that's here only because the auto-derived full-body domain set happens
 * to include it stays a bonus (accessory-tier). `domains.includes('core')`
 * can't distinguish the two — activeCore already requires it either way — so
 * the real signal is `context.strictDomains`, which is exactly what real
 * explicit-pick callers set (WorkoutBuilderSheet.tsx:644 and others).
 */
describe('StructureDirector — core block main-tier vs accessory-tier (Rule A / Rule B)', () => {
  const coreBlock = (context: WorkoutGenerationContext, difficulty: DifficultyLevel = 2) => {
    const blueprint = createStructureDirector().plan(context, difficulty);
    return blueprint.blocks.find((b) => b.domain === 'core');
  };

  it('strictDomains:true (explicit chip-pick) → core gets a main-tier slot, isAccessorySlot falsy', () => {
    const context = baseContext({ strictDomains: true });
    const block = coreBlock(context);
    expect(block).toBeDefined();
    expect(block?.isAccessorySlot).toBeFalsy();
  });

  it('strictDomains unset (schedule/program-derived requiredDomains) → core stays accessory-tier', () => {
    const context = baseContext({});
    const block = coreBlock(context);
    expect(block).toBeDefined();
    expect(block?.isAccessorySlot).toBe(true);
  });

  it('strictDomains:false explicitly → same as unset, core stays accessory-tier', () => {
    const context = baseContext({ strictDomains: false });
    const block = coreBlock(context);
    expect(block?.isAccessorySlot).toBe(true);
  });
});
