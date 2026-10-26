import { describe, expect, it } from 'vitest';
import { chosenParkIdForSwap } from '../chosen-park';

describe('chosenParkIdForSwap', () => {
  it('the where-to-train card the user tapped wins', () => {
    expect(chosenParkIdForSwap({ location: 'park', pickedParkId: 'tapped', sourceParkId: 'page', suggestedParkId: 'best' })).toBe('tapped');
  });
  it('else the park whose page started the workout', () => {
    expect(chosenParkIdForSwap({ location: 'park', pickedParkId: null, sourceParkId: 'page', suggestedParkId: 'best' })).toBe('page');
  });
  it("else the carousel's selected (best-match) park", () => {
    expect(chosenParkIdForSwap({ location: 'street', suggestedParkId: 'best' })).toBe('best');
  });
  it('nothing chosen → null (the caller falls back to the nearest park)', () => {
    expect(chosenParkIdForSwap({ location: 'park' })).toBeNull();
    expect(chosenParkIdForSwap({ location: 'park', pickedParkId: '', sourceParkId: '  ', suggestedParkId: null })).toBeNull();
  });
  it('a non-park switch never uses a park', () => {
    expect(chosenParkIdForSwap({ location: 'home', pickedParkId: 'tapped', sourceParkId: 'page' })).toBeNull();
    expect(chosenParkIdForSwap({ location: 'gym', sourceParkId: 'page' })).toBeNull();
  });
});
