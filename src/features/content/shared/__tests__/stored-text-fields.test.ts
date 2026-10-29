import { describe, it, expect } from 'vitest';
import {
  foldLocalizedListsForWrite,
  hebrewOrEmpty,
  hebrewText,
  normalizeStoredListFields,
  pickList,
  pickText,
} from '../stored-text-fields';

const LISTS = [{ key: 'cues', localizedKey: 'cuesLocalized' }];

describe('hebrewOrEmpty / hebrewText', () => {
  it('string, {he,en}, {he:"",en}, and junk never come back as an object', () => {
    expect(hebrewOrEmpty('מתח')).toBe('מתח');
    expect(hebrewOrEmpty({ he: 'מתח', en: 'Pull-up' })).toBe('מתח');
    expect(hebrewOrEmpty({ he: '', en: 'Pull-up' })).toBe('Pull-up');
    expect(hebrewOrEmpty(undefined)).toBe('');
    expect(hebrewOrEmpty(null)).toBe('');
    expect(hebrewOrEmpty(5)).toBe('');
    expect(String(hebrewText({ he: 'א', en: 'a' }))).toBe('א');
  });
});

describe('list normalize / fold', () => {
  it('plain string list passes through untouched (no sibling key)', () => {
    const doc = { cues: ['א', 'ב'] };
    expect(normalizeStoredListFields(doc, LISTS)).toEqual(doc);
  });
  it('mixed list: Hebrew strings in `cues`, pairs in `cuesLocalized`', () => {
    const out = normalizeStoredListFields({ cues: ['א', { he: 'ב', en: 'b' }] }, LISTS) as Record<string, unknown>;
    expect(out.cues).toEqual(['א', 'ב']);
    expect(out.cuesLocalized).toEqual([{ he: 'א', en: '' }, { he: 'ב', en: 'b' }]);
  });
  it('fold: English entered on one item -> that item is {he,en}; none -> plain list as given', () => {
    const withEn = foldLocalizedListsForWrite({ cues: ['א', 'ב'], cuesLocalized: [{ he: 'א', en: '' }, { he: 'ב', en: 'b' }] }, LISTS) as Record<string, unknown>;
    expect(withEn.cues).toEqual(['א', { he: 'ב', en: 'b' }]);
    expect('cuesLocalized' in withEn).toBe(false);
    const none = foldLocalizedListsForWrite({ cues: ['א', 'ב'], cuesLocalized: [{ he: 'א', en: '' }, { he: 'ב', en: '' }] }, LISTS) as Record<string, unknown>;
    expect(none.cues).toEqual(['א', 'ב']);
    const absent = foldLocalizedListsForWrite({ cues: ['א'] }, LISTS);
    expect(absent).toEqual({ cues: ['א'] });
  });
});

describe('pickText / pickList', () => {
  const eq = { name: 'מתח', nameLocalized: { he: 'מתח', en: 'Pull-up' }, cues: ['א', 'ב'], cuesLocalized: [{ he: 'א', en: 'a' }, { he: 'ב', en: '' }] };
  it('he (flag off) is always the Hebrew string', () => {
    expect(pickText(eq, 'name', 'he')).toBe('מתח');
    expect(pickList(eq, 'cues', 'he')).toEqual(['א', 'ב']);
  });
  it('en resolves per item with Hebrew fallback', () => {
    expect(pickText(eq, 'name', 'en')).toBe('Pull-up');
    expect(pickList(eq, 'cues', 'en')).toEqual(['a', 'ב']);
    expect(pickText({ name: 'מתח' }, 'name', 'en')).toBe('מתח');
    expect(pickList(null, 'cues', 'en')).toEqual([]);
  });
});
