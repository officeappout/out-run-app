import { describe, it, expect } from 'vitest';
import {
  toggleCard,
  getCardOrder,
  canContinueWithCards,
  type ProgramCardId,
} from '../program-card-selection';

describe('toggleCard', () => {
  it('appends an unselected card at the end (lowest priority so far)', () => {
    expect(toggleCard([], 'health')).toEqual(['health']);
    expect(toggleCard(['health'], 'skills')).toEqual(['health', 'skills']);
  });

  it('removes an already-selected card, preserving the order of the rest', () => {
    expect(toggleCard(['health', 'skills', 'body_focus'], 'skills')).toEqual([
      'health',
      'body_focus',
    ]);
  });

  it('re-selecting a removed card appends it at the end (loses its old priority)', () => {
    const afterRemove = toggleCard(['health', 'skills'], 'health'); // ['skills']
    expect(toggleCard(afterRemove, 'health')).toEqual(['skills', 'health']);
  });
});

describe('getCardOrder', () => {
  it('returns 1-based priority for a selected card', () => {
    const selected: ProgramCardId[] = ['skills', 'health', 'body_focus'];
    expect(getCardOrder(selected, 'skills')).toBe(1);
    expect(getCardOrder(selected, 'health')).toBe(2);
    expect(getCardOrder(selected, 'body_focus')).toBe(3);
  });

  it('returns null for a card not in the selection', () => {
    expect(getCardOrder(['health'], 'skills')).toBeNull();
    expect(getCardOrder([], 'health')).toBeNull();
  });
});

describe('canContinueWithCards', () => {
  it('false when no card is selected', () => {
    expect(canContinueWithCards([], [], [])).toBe(false);
  });

  it('true for health alone — no sub-selection required', () => {
    expect(canContinueWithCards(['health'], [], [])).toBe(true);
  });

  it('false for body_focus selected with no muscles chosen yet', () => {
    expect(canContinueWithCards(['body_focus'], [], [])).toBe(false);
  });

  it('true once body_focus has at least one muscle', () => {
    expect(canContinueWithCards(['body_focus'], ['chest'], [])).toBe(true);
  });

  it('false for skills selected with no skill chosen yet', () => {
    expect(canContinueWithCards(['skills'], [], [])).toBe(false);
  });

  it('true once skills has at least one skill', () => {
    expect(canContinueWithCards(['skills'], [], ['planche'])).toBe(true);
  });

  it('multi-card: every card needing a sub-selection must have one', () => {
    expect(canContinueWithCards(['health', 'skills'], [], [])).toBe(false);
    expect(canContinueWithCards(['health', 'skills'], [], ['planche'])).toBe(true);
    expect(
      canContinueWithCards(['body_focus', 'skills'], ['chest'], []),
    ).toBe(false);
    expect(
      canContinueWithCards(['body_focus', 'skills'], ['chest'], ['planche']),
    ).toBe(true);
  });
});
