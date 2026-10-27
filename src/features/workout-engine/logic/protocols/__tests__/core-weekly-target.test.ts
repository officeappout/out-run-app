import { describe, expect, it } from 'vitest';
import {
  CORE_BLOCK_SET_EQUIVALENT,
  coreSetsLeft,
  coreSetsOfOptionalCard,
  coreSetsOfSlot,
  coreSlotOpen,
  OPTIONAL_CORE_CARD_MINUTES,
} from '../core-weekly-target';

describe('core weekly target (R31, owner 27.10.2026)', () => {
  it('the core slot stays open until the weekly set target is met', () => {
    expect(coreSlotOpen({ weeklyTarget: 6, setsThisWeek: 0 })).toBe(true);
    expect(coreSlotOpen({ weeklyTarget: 6, setsThisWeek: 5 })).toBe(true);
    expect(coreSlotOpen({ weeklyTarget: 6, setsThisWeek: 6 })).toBe(false);
    expect(coreSlotOpen({ weeklyTarget: 6, setsThisWeek: 9 })).toBe(false);
  });

  it('no known target keeps today\'s behavior (slot open)', () => {
    expect(coreSlotOpen({})).toBe(true);
    expect(coreSlotOpen({ weeklyTarget: null, setsThisWeek: 50 })).toBe(true);
    expect(coreSlotOpen({ weeklyTarget: 0, setsThisWeek: 50 })).toBe(true);
    expect(coreSetsLeft({ weeklyTarget: 0, setsThisWeek: 0 })).toBe(0);
  });

  it('counts sets left', () => {
    expect(coreSetsLeft({ weeklyTarget: 8, setsThisWeek: 3 })).toBe(5);
    expect(coreSetsLeft({ weeklyTarget: 8, setsThisWeek: 12 })).toBe(0);
  });

  it('a single counts its sets, a 4-minute tabata / follow-along counts as 4 sets (owner 27.10)', () => {
    expect(CORE_BLOCK_SET_EQUIVALENT).toBe(4);
    expect(coreSetsOfSlot('single', 3)).toBe(3);
    expect(coreSetsOfSlot('single', 2)).toBe(2);
    expect(coreSetsOfSlot('tabata')).toBe(CORE_BLOCK_SET_EQUIVALENT);
    expect(coreSetsOfSlot('follow_along')).toBe(CORE_BLOCK_SET_EQUIVALENT);
  });

  it('the optional 8-minute core card on a non-workout day counts toward the target (S13)', () => {
    expect(OPTIONAL_CORE_CARD_MINUTES).toBe(8);
    const card = coreSetsOfOptionalCard();
    expect(card).toBe(8);
    // Week: target 8, one 2-set single, then the optional card: target met, next slot skipped.
    const sets = coreSetsOfSlot('single', 2) + card;
    expect(coreSlotOpen({ weeklyTarget: 8, setsThisWeek: sets })).toBe(false);
  });

  it('target not met: the next strength workout still gets its core slot', () => {
    const sets = coreSetsOfSlot('single', 2);
    expect(coreSlotOpen({ weeklyTarget: 6, setsThisWeek: sets })).toBe(true);
  });
});
