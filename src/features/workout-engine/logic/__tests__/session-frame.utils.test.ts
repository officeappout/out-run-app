import { describe, it, expect } from 'vitest';
import { warmupSlotBudget, cooldownCountBudget, WARMUP_MIN_SLOTS } from '../session-frame.utils';

/**
 * Product decision (10.07.2026): warmup/cooldown are INCLUDED in the user's
 * time budget and scale with it. A minimum warmup floor always remains
 * (injury prevention) — never skipped by default.
 */
describe('warmupSlotBudget', () => {
  it('short sessions shrink to the injury-prevention floor (15min → 2 slots ≈ 2min)', () => {
    expect(warmupSlotBudget(15)).toBe(WARMUP_MIN_SLOTS);
    expect(warmupSlotBudget(10)).toBe(WARMUP_MIN_SLOTS); // Vibe minimum
  });

  it('mid sessions scale (~13% share): 30min → 3 slots', () => {
    expect(warmupSlotBudget(30)).toBe(3);
  });

  it('long sessions keep the historical 6-min ladder ceiling (45/60min → 5 slots)', () => {
    expect(warmupSlotBudget(45)).toBe(5);
    expect(warmupSlotBudget(60)).toBe(5);
  });

  it('no time provided → legacy ceiling (behavior unchanged for legacy callers)', () => {
    expect(warmupSlotBudget(undefined)).toBe(5);
    expect(warmupSlotBudget(0)).toBe(5);
  });

  it('the floor NEVER drops below WARMUP_MIN_SLOTS, even for absurdly short sessions', () => {
    expect(warmupSlotBudget(1)).toBe(WARMUP_MIN_SLOTS);
    expect(warmupSlotBudget(5)).toBe(WARMUP_MIN_SLOTS);
  });
});

describe('cooldownCountBudget', () => {
  it('scales with the session: <20 → 1 · 20-39 → 2 · 40+ → 3', () => {
    expect(cooldownCountBudget(15)).toBe(1);
    expect(cooldownCountBudget(10)).toBe(1);
    expect(cooldownCountBudget(30)).toBe(2);
    expect(cooldownCountBudget(45)).toBe(3);
    expect(cooldownCountBudget(60)).toBe(3);
  });

  it('no time provided → 2 (today\'s typical output)', () => {
    expect(cooldownCountBudget(undefined)).toBe(2);
  });
});
