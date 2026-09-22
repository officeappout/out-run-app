import { describe, it, expect } from 'vitest';
import { buildPriorityGroups } from '../priority-order';

describe('buildPriorityGroups', () => {
  it('null/undefined progression: no groups', () => {
    expect(buildPriorityGroups(null)).toEqual([]);
    expect(buildPriorityGroups(undefined)).toEqual([]);
    expect(buildPriorityGroups({})).toEqual([]);
  });

  it('a single-item field (below the 2-item threshold) produces no group for that field', () => {
    expect(buildPriorityGroups({ cardFocusOrder: ['health'] })).toEqual([]);
    expect(buildPriorityGroups({ muscleFocusIds: ['chest'] })).toEqual([]);
    expect(buildPriorityGroups({ skillFocusIds: ['planche'] })).toEqual([]);
  });

  it('cardFocusOrder with 2+ entries: one group, correct order + Hebrew labels', () => {
    const groups = buildPriorityGroups({ cardFocusOrder: ['skills', 'body_focus'] });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('cards');
    expect(groups[0].items).toEqual([
      { id: 'skills', order: 1, labelHe: 'קליסטניקס מתקדם' },
      { id: 'body_focus', order: 2, labelHe: 'עיצוב ושרירים' },
    ]);
  });

  it('muscleFocusIds with 2+ entries: one group, correct order + Hebrew labels', () => {
    const groups = buildPriorityGroups({ muscleFocusIds: ['back', 'chest', 'legs'] });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('muscles');
    expect(groups[0].items).toEqual([
      { id: 'back', order: 1, labelHe: 'גב' },
      { id: 'chest', order: 2, labelHe: 'חזה' },
      { id: 'legs', order: 3, labelHe: 'רגליים' },
    ]);
  });

  it('skillFocusIds with 2+ entries: one group, correct order + Hebrew labels', () => {
    const groups = buildPriorityGroups({ skillFocusIds: ['planche', 'front_lever'] });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('skills');
    expect(groups[0].items).toEqual([
      { id: 'planche', order: 1, labelHe: 'פלאנץ׳' },
      { id: 'front_lever', order: 2, labelHe: 'פרונט לבר' },
    ]);
  });

  it('all 3 fields present with 2+ entries: 3 groups, in cards/muscles/skills order', () => {
    const groups = buildPriorityGroups({
      cardFocusOrder: ['skills', 'body_focus'],
      muscleFocusIds: ['chest', 'back'],
      skillFocusIds: ['planche', 'handstand'],
    });
    expect(groups.map((g) => g.key)).toEqual(['cards', 'muscles', 'skills']);
  });

  it('an unrecognized id falls back to the raw id as its label', () => {
    const groups = buildPriorityGroups({ muscleFocusIds: ['chest', 'made_up_muscle'] });
    expect(groups[0].items[1]).toEqual({ id: 'made_up_muscle', order: 2, labelHe: 'made_up_muscle' });
  });

  it('mixed thresholds: only the fields meeting the 2-item minimum produce a group', () => {
    const groups = buildPriorityGroups({
      cardFocusOrder: ['health'], // below threshold
      muscleFocusIds: ['chest', 'back'], // meets threshold
    });
    expect(groups.map((g) => g.key)).toEqual(['muscles']);
  });
});
