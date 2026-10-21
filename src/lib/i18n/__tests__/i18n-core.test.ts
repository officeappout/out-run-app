import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  fallbackChain,
  genderArg,
  lookupMessage,
  messageArgNames,
  normalizeLocaleTag,
  pickText,
  resolveLocale,
  translate,
  type Catalog,
} from '../core/i18n-core';
import { formatIcu } from '../core/icu';

const catalogs: Record<string, Catalog> = {
  he: {
    hello: 'שלום {name}',
    ready: '{gender, select, female {מוכנה?} male {מוכן?} other {מוכנים?}}',
    days: '{count, plural, one {יום אחד} two {יומיים} other {# ימים}}',
    onlyHe: 'רק בעברית',
    plain: 'טקסט רגיל בלי משתנים',
    apostrophe: "צ'אט עם המאמן",
    broken: 'שבור {name',
  },
  en: {
    hello: 'Hello {name}',
    ready: 'Ready?',
    days: '{count, plural, one {# day} other {# days}}',
  },
  ru: {
    hello: 'Привет, {name}',
    ready: '{gender, select, female {Готова?} male {Готов?} other {Готовы?}}',
  },
};
const catalogFor = (loc: string) => catalogs[loc];
const t = (locale: string, key: string, values?: Record<string, unknown>) =>
  translate(catalogFor, formatIcu, locale, key, values);

describe('fallback chain', () => {
  it('he → he; en → en, he; ru → ru, en, he', () => {
    expect(fallbackChain('he')).toEqual(['he']);
    expect(fallbackChain('en')).toEqual(['en', 'he']);
    expect(fallbackChain('ru')).toEqual(['ru', 'en', 'he']);
  });

  it('a key missing in the locale falls back to English, then Hebrew', () => {
    expect(t('ru', 'days', { count: 3 })).toBe('3 days');
    expect(t('ru', 'onlyHe')).toBe('רק בעברית');
    expect(t('en', 'onlyHe')).toBe('רק בעברית');
    expect(lookupMessage(catalogFor, 'de', 'onlyHe')).toEqual({ message: 'רק בעברית', locale: 'he', found: true });
  });

  it('a key missing everywhere returns the key itself (never throws)', () => {
    expect(t('en', 'no.such.key')).toBe('no.such.key');
    expect(lookupMessage(catalogFor, 'he', 'no.such.key').found).toBe(false);
  });

  it('an unloaded catalog (undefined) is skipped', () => {
    expect(translate(() => undefined, formatIcu, 'en', 'hello')).toBe('hello');
    expect(translate((l) => (l === 'he' ? catalogs.he : undefined), formatIcu, 'de', 'hello', { name: 'דנה' })).toBe('שלום דנה');
  });

  it('a malformed message returns the raw text instead of throwing', () => {
    expect(t('he', 'broken', { name: 'x' })).toBe('שבור {name');
  });
});

describe('ICU', () => {
  it('interpolates values', () => {
    expect(t('he', 'hello', { name: 'דנה' })).toBe('שלום דנה');
    expect(t('en', 'hello', { name: 'Dana' })).toBe('Hello Dana');
  });

  it('gender select picks the branch, unknown gender → other', () => {
    expect(t('he', 'ready', { gender: 'female' })).toBe('מוכנה?');
    expect(t('he', 'ready', { gender: 'male' })).toBe('מוכן?');
    expect(t('he', 'ready', { gender: genderArg(undefined) })).toBe('מוכנים?');
    expect(t('ru', 'ready', { gender: 'female' })).toBe('Готова?');
    // English collapsed the select to one text: the gender value is simply unused.
    expect(t('en', 'ready', { gender: 'female' })).toBe('Ready?');
  });

  it('plural uses the rules of the locale the message came from (Hebrew dual)', () => {
    expect(t('he', 'days', { count: 1 })).toBe('יום אחד');
    expect(t('he', 'days', { count: 2 })).toBe('יומיים');
    expect(t('he', 'days', { count: 5 })).toBe('5 ימים');
  });

  it('Hebrew without variables comes back byte-identical (apostrophes included)', () => {
    expect(t('he', 'plain')).toBe(catalogs.he.plain);
    expect(t('he', 'apostrophe')).toBe("צ'אט עם המאמן");
  });
});

describe('genderArg / normalizeLocaleTag', () => {
  it('maps profile values to select values', () => {
    expect(genderArg('male')).toBe('male');
    expect(genderArg('female')).toBe('female');
    expect(genderArg('other')).toBe('other');
    expect(genderArg('')).toBe('other');
    expect(genderArg(null)).toBe('other');
  });

  it('normalizes device tags', () => {
    expect(normalizeLocaleTag('en-US')).toBe('en');
    expect(normalizeLocaleTag('RU')).toBe('ru');
    expect(normalizeLocaleTag('de_AT')).toBe('de');
    expect(normalizeLocaleTag(42)).toBe('');
  });
});

describe('resolveLocale', () => {
  const base = { allowed: ['en', 'ru'] };
  it('flag off → he whatever else is set', () => {
    expect(resolveLocale({ ...base, i18nEnabled: false, profileLocale: 'en', deviceLocales: ['en-US'] })).toBe('he');
  });
  it('profile → stored → device → he, allowed locales only', () => {
    expect(resolveLocale({ ...base, i18nEnabled: true, profileLocale: 'ru', storedLocale: 'en' })).toBe('ru');
    expect(resolveLocale({ ...base, i18nEnabled: true, profileLocale: 'de', storedLocale: 'en' })).toBe('en');
    expect(resolveLocale({ ...base, i18nEnabled: true, deviceLocales: ['fr-FR', 'en-GB'] })).toBe('en');
    expect(resolveLocale({ ...base, i18nEnabled: true, deviceLocales: ['fr-FR'] })).toBe('he');
    expect(resolveLocale({ i18nEnabled: true, allowed: [], profileLocale: 'en' })).toBe('he');
  });
});

describe('pickText (Firestore content)', () => {
  it('a legacy plain string is Hebrew and is returned as is', () => {
    expect(pickText('שכיבות סמיכה', 'en', 'female')).toBe('שכיבות סמיכה');
  });
  it('locale+gender → locale neutral → en → he+gender → he', () => {
    const v = { he: { male: 'מוכן', female: 'מוכנה' }, en: 'Ready', ru: { male: 'Готов', female: 'Готова' } };
    expect(pickText(v, 'ru', 'female')).toBe('Готова');
    expect(pickText(v, 'ru', 'other')).toBe('Готов');
    expect(pickText(v, 'en', 'female')).toBe('Ready');
    expect(pickText(v, 'de', 'female')).toBe('Ready');
    expect(pickText(v, 'he', 'female')).toBe('מוכנה');
    expect(pickText({ he: { male: 'מוכן', female: 'מוכנה' } }, 'de', 'female')).toBe('מוכנה');
    expect(pickText({ he: 'שלום' }, 'de')).toBe('שלום');
    expect(pickText(undefined, 'he')).toBe('');
  });
});

describe('messageArgNames', () => {
  it('finds plain, select, plural and nested arguments', () => {
    expect(messageArgNames('שלום {name}')).toEqual(['name']);
    expect(messageArgNames('{gender, select, female {היי {name}} other {היי}}')).toEqual(['gender', 'name']);
    expect(messageArgNames('{count, plural, one {# יום} other {# ימים}}')).toEqual(['count']);
    expect(messageArgNames("'{literal}' {x}")).toEqual(['x']);
    expect(messageArgNames('בלי משתנים')).toEqual([]);
  });
});

describe('server mirror', () => {
  it('functions/src/shared/i18n-core.ts is this file, byte for byte (run the functions build to refresh)', () => {
    const root = path.resolve(__dirname, '../../../..');
    const app = readFileSync(path.join(root, 'src/lib/i18n/core/i18n-core.ts'), 'utf8');
    const mirror = readFileSync(path.join(root, 'functions/src/shared/i18n-core.ts'), 'utf8');
    expect(mirror.slice(mirror.indexOf('\n') + 1)).toBe(app);
  });
});
