import { describe, expect, it } from 'vitest';
import { englishProgramName } from '../localized-fields';

describe('englishProgramName (AI3)', () => {
  const withEn = { name: 'כל הגוף', nameLocalized: { he: 'כל הגוף', en: 'Full body' } };
  const heOnly = { name: 'דחיפה' };
  it('English name only in English', () => {
    expect(englishProgramName(withEn, 'en')).toBe('Full body');
    expect(englishProgramName(withEn, 'he')).toBe('');
  });
  it('no doc -> empty, so the caller keeps its Hebrew chain', () => {
    expect(englishProgramName(null, 'en')).toBe('');
    expect(englishProgramName(undefined, 'en')).toBe('');
  });
  it('a Hebrew-only doc reads its Hebrew name in English', () => {
    expect(englishProgramName(heOnly, 'en')).toBe('דחיפה');
  });
});
