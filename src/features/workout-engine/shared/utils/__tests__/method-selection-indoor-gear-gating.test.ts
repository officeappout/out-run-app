import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectMethodForContext } from '../method-selection.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Generator audit P0 #1 (2026-10-17): home/office equipment was never enforced.
 * Priority 1 returned ANY method tagged for the location regardless of
 * availableGear (a no-gear home user got "door pull-up bar", rings, TRX and
 * band methods — 128 leaks in one offline matrix), and office fell back to
 * ungated home methods. Indoor (home/office/school) candidates are now gated
 * with the same requiredIds.every(satisfiesGearRequirement) rule as park,
 * with the assumed indoor fixtures (door/chair/wall/mat/towel) always passing.
 */

const ex = (id: string, methods: Array<Record<string, unknown>>): Exercise =>
  ({ id, name: { he: id, en: id }, execution_methods: methods } as unknown as Exercise);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('selectMethodForContext — indoor gear gating (home / office / school)', () => {
  it('home, no gear: a home method needing a pull-up bar is skipped for a gear-less home method', () => {
    const e = ex('row', [
      { location: 'home', methodName: 'bar', gearIds: ['pullup_bar'], media: { imageUrl: 'a.jpg' } },
      { location: 'home', methodName: 'floor', gearIds: [], media: {} },
    ]);
    expect(selectMethodForContext(e, 'home', ['bodyweight'])?.methodName).toBe('floor');
  });

  it('home, no gear: when every home method needs missing gear, the exercise is excluded (null)', () => {
    const e = ex('rings-only', [
      { location: 'home', gearIds: ['rings'] },
      { location: 'home', gearIds: ['trx'] },
    ]);
    expect(selectMethodForContext(e, 'home', ['bodyweight'])).toBeNull();
  });

  it('home: a gear-less method authored for ANOTHER location does not rescue an exercise whose home methods all need missing gear', () => {
    // The real case: "סקין דה קאט ... בפארק על מוט" — a park method missing its bar tag.
    const e = ex('skin-the-cat', [
      { location: 'home', gearIds: ['rings'] },
      { location: 'park', gearIds: [] },
    ]);
    expect(selectMethodForContext(e, 'home', ['bodyweight'])).toBeNull();
  });

  it('home WITH the gear: the gear method is selected (no regression for equipped users)', () => {
    const e = ex('pullup', [{ location: 'home', methodName: 'door-bar', gearIds: ['pullup_bar'] }]);
    expect(selectMethodForContext(e, 'home', ['bodyweight', 'pullup_bar'])?.methodName).toBe('door-bar');
  });

  it('home: assumed indoor fixtures (door, chair, towel) pass even when the caller passes no gear at all', () => {
    const door = ex('door-row', [{ location: 'home', methodName: 'door', gearIds: ['door'] }]);
    const towel = ex('towel-pull', [{ location: 'home', methodName: 'towel', gearIds: ['towel'] }]);
    expect(selectMethodForContext(door, 'home', [])?.methodName).toBe('door');
    expect(selectMethodForContext(towel, 'home', [])?.methodName).toBe('towel');
  });

  it('office: the home fallback is gated too — a home band method is not served to an office user without a band', () => {
    const e = ex('band-press', [{ location: 'home', gearIds: ['resistance_bands'] }]);
    expect(selectMethodForContext(e, 'office', ['bodyweight'])).toBeNull();
    const ok = ex('chair-dip', [{ location: 'home', methodName: 'chair', gearIds: ['chair'] }]);
    expect(selectMethodForContext(ok, 'office', ['bodyweight'])?.methodName).toBe('chair');
  });

  it('school uses the same indoor gating', () => {
    const e = ex('rings', [{ location: 'school', gearIds: ['rings'] }]);
    expect(selectMethodForContext(e, 'school', ['bodyweight'])).toBeNull();
  });

  it('gym is NOT gear-gated at Priority 1 (unchanged behaviour outside home/office/school)', () => {
    const e = ex('cable', [{ location: 'gym', methodName: 'cable', gearIds: ['cable_machine'] }]);
    expect(selectMethodForContext(e, 'gym', ['bodyweight'])?.methodName).toBe('cable');
  });

  it('park behaviour is untouched (still gated, still never home)', () => {
    const e = ex('mixed', [
      { location: 'home', gearIds: [] },
      { location: 'park', gearIds: ['pullup_bar'] },
    ]);
    expect(selectMethodForContext(e, 'park', ['bodyweight'])).toBeNull();
    expect(selectMethodForContext(e, 'park', ['pullup_bar'])?.location).toBe('park');
  });
});

describe('door pull-up bar ↔ overhead-bar family (needed once indoor gating is enforced)', () => {
  it('a profile with the canonical pull-up bar can do a door-bar method, and vice versa', () => {
    const doorBarMethod = ex('pullup-door', [{ location: 'home', methodName: 'door', gearIds: ['pullup_bar_door'] }]);
    const barMethod = ex('pullup-bar', [{ location: 'home', methodName: 'bar', gearIds: ['pullup_bar'] }]);
    expect(selectMethodForContext(doorBarMethod, 'home', ['pullup_bar'])?.methodName).toBe('door');
    expect(selectMethodForContext(barMethod, 'home', ['pullup_bar_door'])?.methodName).toBe('bar');
    expect(selectMethodForContext(doorBarMethod, 'home', ['bodyweight'])).toBeNull();
  });
});
