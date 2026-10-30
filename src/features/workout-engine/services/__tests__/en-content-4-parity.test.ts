/**
 * Hebrew baselines recorded from main BEFORE the en-content-4 changes (cues, hero title, park-write guard, subcollection scripts).
 * Hebrew output must stay byte-identical after the change.
 */
import { describe, it, expect } from 'vitest';
import { titleWithFocusHe } from '../split-decision/day-focus.utils';
import { normalizeStoredTextFields } from '@/features/content/programs/core/localized-fields';
import { generatedToHeroWorkout } from '@/features/home/utils/generatedToHeroWorkout';
import { applyWrites, buildImport, extractFields, checkTranslation } from '../../../../../scripts/i18n/content/collection-bulk';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';

describe('en-content-4 Hebrew baselines (recorded from main)', () => {
  it('title with day focus', () => {
    expect(titleWithFocusHe('אימון כוח', 'upper')).toBe('אימון עליון');
    expect(titleWithFocusHe('אימון יומי בבית', 'lower')).toBe('אימון יומי בבית · תחתון');
    expect(titleWithFocusHe('אימון בפארק', 'full')).toBe('אימון בפארק');
  });

  it('plain Hebrew cue / phrase rows stay untouched by the row normalizer', () => {
    const fields = ['text', 'cue', 'phrase'].map((key) => ({ key, localizedKey: `${key}Localized` }));
    const row = { text: 'שלום', cue: 'הערה', phrase: 'יאללה', variant: 'balanced' };
    expect(normalizeStoredTextFields(row, fields)).toEqual(row);
  });

  it('hero workout adapter keeps the Hebrew title', () => {
    const gw = { title: 'אימון יומי בבית', description: 'ד', exercises: [], estimatedDuration: 30, difficulty: 2, isRecovery: false, dayFocus: 'upper' } as unknown as GeneratedWorkout;
    const h = generatedToHeroWorkout(gw);
    expect(h.title).toBe('אימון יומי בבית · עליון');
    expect(h.description).toBe('ד');
  });

  it('collection import core: top-level collection plan', () => {
    const exp = { format: 'out-collection-translations-v1', kind: 'export', collection: 'parks', exportedAt: 't', docCount: 1, fields: extractFields('p1', { description: 'פארק יפה' }) } as never;
    const { file } = buildImport(exp, { 'פארק יפה': 'A lovely park' });
    expect(file.writes).toEqual([{ docId: 'p1', path: 'description', he: 'פארק יפה', en: 'A lovely park', write: { he: 'פארק יפה', en: 'A lovely park' } }]);
    expect(applyWrites({ description: 'פארק יפה' }, file.writes)).toEqual({ description: { he: 'פארק יפה', en: 'A lovely park' } });
    expect(checkTranslation('פארק 3', 'Park 3')).toEqual([]);
    expect(checkTranslation('פארק', 'פארק')).toEqual(['Hebrew characters in English']);
  });
});
