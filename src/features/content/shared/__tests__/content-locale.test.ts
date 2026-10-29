import { describe, it, expect } from 'vitest';
import { contentLanguage, localizedContent, resolveContentText } from '../content-locale';

const full = { he: 'סקוואט', en: 'Squat' };
const noEn = { he: 'משיכה', en: '' };

describe('contentLanguage', () => {
  it('is he with the flag off, whatever the locale', () => {
    expect(contentLanguage('en', false)).toBe('he');
    expect(contentLanguage('he', false)).toBe('he');
  });
  it('is he for he / other locales with the flag on', () => {
    expect(contentLanguage('he', true)).toBe('he');
    expect(contentLanguage('ru', true)).toBe('he');
    expect(contentLanguage(undefined, true)).toBe('he');
  });
  it('is en only for en with the flag on', () => {
    expect(contentLanguage('en', true)).toBe('en');
  });
});

describe('localizedContent', () => {
  it('he and default give the Hebrew text', () => {
    expect(localizedContent(full, 'he')).toBe('סקוואט');
    expect(localizedContent(full)).toBe('סקוואט');
  });
  it('en gives English', () => {
    expect(localizedContent(full, 'en')).toBe('Squat');
  });
  it('en with an empty slot falls back to Hebrew', () => {
    expect(localizedContent(noEn, 'en')).toBe('משיכה');
  });
  it('missing value is empty', () => {
    expect(localizedContent(undefined, 'en')).toBe('');
    expect(localizedContent(null, 'en')).toBe('');
  });
});

describe('resolveContentText', () => {
  it('plain string passes through', () => {
    expect(resolveContentText('שלום', 'en')).toBe('שלום');
  });
  it('gendered picks by gender, male when unknown', () => {
    const g = { male: 'בצע', female: 'בצעי' };
    expect(resolveContentText(g, 'en', 'female')).toBe('בצעי');
    expect(resolveContentText(g, 'he', 'male')).toBe('בצע');
    expect(resolveContentText(g, 'he', null)).toBe('בצע');
    expect(resolveContentText(g, 'he', 'other')).toBe('בצע');
  });
  it('localized follows language with fallback', () => {
    expect(resolveContentText(full, 'en')).toBe('Squat');
    expect(resolveContentText(noEn, 'en')).toBe('משיכה');
    expect(resolveContentText(full, 'he')).toBe('סקוואט');
  });
  it('empty is empty string', () => {
    expect(resolveContentText(undefined, 'en')).toBe('');
  });
});
