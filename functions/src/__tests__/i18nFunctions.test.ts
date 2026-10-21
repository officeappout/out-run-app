import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatIcu } from '../shared/i18n-icu';
import { __resetRegisteredCatalogsForTests, getCatalog, getT, makeT, registerCatalog, toLocale } from '../shared/i18n-t';
import {
  allowedLocalesFromFlags,
  getI18nAllowedLocales,
  getUserLocale,
  userLocaleFromProfile,
  type DocReader,
} from '../services/user-locale.service';

/**
 * i18n wave 2A — the Cloud Functions side of the translation core (docs/i18n/PLAN.md §2.1, §2.6):
 * ICU adapter, server getT over the mirrored catalogs, and the user-locale reader.
 * Nothing here is wired into a sender yet.
 */

afterEach(() => __resetRegisteredCatalogsForTests());

describe('formatIcu (intl-messageformat adapter)', () => {
  it('returns plain text untouched (no parse)', () => {
    expect(formatIcu('שלום, מה נשמע?', 'he')).toBe('שלום, מה נשמע?');
    expect(formatIcu('a < b', 'he')).toBe('a < b');
  });
  it('fills arguments, plural and select', () => {
    expect(formatIcu('שלום {name}!', 'he', { name: 'דנה' })).toBe('שלום דנה!');
    expect(formatIcu('{n, plural, one {דקה אחת} two {שתי דקות} other {# דקות}}', 'he', { n: 2 })).toBe('שתי דקות');
    expect(formatIcu('{n, plural, one {# day} other {# days}}', 'en', { n: 1 })).toBe('1 day');
  });
  it('ignores tags (a stray < is text) and throws on a malformed message', () => {
    expect(formatIcu('<b>{x}</b>', 'he', { x: 1 })).toBe('<b>1</b>');
    expect(() => formatIcu('שבור {name', 'he')).toThrow();
  });
});

describe('getT over the mirrored catalogs (common)', () => {
  it('Hebrew is the source', () => {
    expect(getT('he', 'common')('actions.save')).toBe('שמירה');
  });
  it('gender select — injected from opts, overridable per call, unknown → other', () => {
    expect(getT('he', 'common', { gender: 'female' })('greeting.ready')).toBe('מוכנה?');
    expect(getT('he', 'common', { gender: 'male' })('greeting.ready')).toBe('מוכן?');
    expect(getT('he', 'common')('greeting.ready')).toBe('מוכנים?');
    expect(getT('he', 'common', { gender: 'legacy-value' })('greeting.ready')).toBe('מוכנים?');
    expect(getT('he', 'common', { gender: 'male' })('greeting.ready', { gender: 'female' })).toBe('מוכנה?');
  });
  it('Hebrew plural (one / two / other)', () => {
    const t = getT('he', 'common');
    expect(t('count.minutes', { count: 1 })).toBe('דקה אחת');
    expect(t('count.minutes', { count: 2 })).toBe('שתי דקות');
    expect(t('count.minutes', { count: 7 })).toBe('7 דקות');
  });
  it('ru / de with empty catalogs fall back to en; en formats with en plural rules', () => {
    expect(getT('ru', 'common')('actions.save')).toBe('Save');
    expect(getT('de', 'common')('count.minutes', { count: 1 })).toBe('1 minute');
    expect(getT('en', 'common')('count.minutes', { count: 2 })).toBe('2 minutes');
  });
  it('a bad locale is Hebrew', () => {
    expect(toLocale('fr')).toBe('he');
    expect(toLocale(undefined)).toBe('he');
    const t = getT('xx', 'common');
    expect(t.locale).toBe('he');
    expect(t('actions.back')).toBe('חזרה');
  });
  it('the catalogs have the src/messages/<locale>/<ns>.json shape', () => {
    for (const loc of ['he', 'en', 'ru', 'de']) {
      const cat = getCatalog(loc, 'common');
      expect(cat).toBeDefined();
      for (const v of Object.values(cat ?? {})) expect(typeof v).toBe('string');
    }
  });
});

describe('fallback to Hebrew (registered catalogs)', () => {
  it('missing in ru and en → the Hebrew message, formatted with Hebrew rules', () => {
    registerCatalog('he', 'test', {
      only: 'רק בעברית',
      ready: '{gender, select, female {מוכנה, {name}?} other {מוכן, {name}?}}',
      days: '{n, plural, one {יום אחד} two {יומיים} other {# ימים}}',
    });
    registerCatalog('en', 'test', { ready: 'Ready, {name}?' });
    registerCatalog('ru', 'test', {});
    const ru = makeT('ru', 'test', { gender: 'female' });
    expect(ru('only')).toBe('רק בעברית');
    expect(ru('ready', { name: 'Маша' })).toBe('Ready, Маша?'); // en bridge before he
    expect(ru('days', { n: 2 })).toBe('יומיים');
    expect(makeT('he', 'test', { gender: 'female' })('ready', { name: 'דנה' })).toBe('מוכנה, דנה?');
    expect(makeT('he', 'test')('ready', { name: 'דן' })).toBe('מוכן, דן?');
  });
  it('a key missing everywhere returns the key; a malformed message returns its raw text', () => {
    registerCatalog('he', 'test', { broken: 'שבור {name' });
    const t = makeT('en', 'test');
    expect(t('nope')).toBe('nope');
    expect(t('broken', { name: 'x' })).toBe('שבור {name');
  });
  it('an empty string counts as missing', () => {
    registerCatalog('he', 'test', { k: 'עברית' });
    registerCatalog('en', 'test', { k: '' });
    expect(makeT('en', 'test')('k')).toBe('עברית');
  });
});

describe('user locale', () => {
  const ALL_ON = { enable_i18n: true, enable_locale_en: true, enable_locale_ru: true, enable_locale_de: true };

  it('flags → allowed locales (fail-closed; only true counts)', () => {
    expect(allowedLocalesFromFlags(null)).toEqual(['he']);
    expect(allowedLocalesFromFlags({ enable_locale_en: true })).toEqual(['he']);
    expect(allowedLocalesFromFlags({ enable_i18n: 'true', enable_locale_en: true })).toEqual(['he']);
    expect(allowedLocalesFromFlags({ enable_i18n: true })).toEqual(['he']);
    expect(allowedLocalesFromFlags({ enable_i18n: true, enable_locale_ru: true })).toEqual(['he', 'ru']);
    expect(allowedLocalesFromFlags(ALL_ON)).toEqual(['he', 'en', 'ru', 'de']);
  });

  it('profile → locale, Hebrew fallback', () => {
    const all = allowedLocalesFromFlags(ALL_ON);
    expect(userLocaleFromProfile({ core: { locale: 'en' } }, all)).toBe('en');
    expect(userLocaleFromProfile({ core: { locale: 'ru-RU' } }, all)).toBe('ru');
    expect(userLocaleFromProfile({ core: { locale: 'fr' } }, all)).toBe('he');
    expect(userLocaleFromProfile({ core: {} }, all)).toBe('he');
    expect(userLocaleFromProfile({}, all)).toBe('he');
    expect(userLocaleFromProfile(null, all)).toBe('he');
    expect(userLocaleFromProfile({ core: { locale: 42 } }, all)).toBe('he');
    // Language not switched on, or i18n off → he even when the profile says otherwise.
    expect(userLocaleFromProfile({ core: { locale: 'de' } }, ['he', 'en'])).toBe('he');
    expect(userLocaleFromProfile({ core: { locale: 'en' } }, ['he'])).toBe('he');
    expect(userLocaleFromProfile({ core: { locale: 'en' } })).toBe('he');
  });

  function fakeDb(docs: Record<string, unknown>, fail = false): DocReader & { reads: string[] } {
    const reads: string[] = [];
    return {
      reads,
      doc: (p: string) => ({
        get: async () => {
          reads.push(p);
          if (fail) throw new Error('unavailable');
          return { exists: p in docs, data: () => docs[p] };
        },
      }),
    };
  }

  it('getI18nAllowedLocales reads system_config/feature_flags; missing doc or error → he only', async () => {
    expect(await getI18nAllowedLocales(fakeDb({ 'system_config/feature_flags': ALL_ON }))).toEqual(['he', 'en', 'ru', 'de']);
    expect(await getI18nAllowedLocales(fakeDb({}))).toEqual(['he']);
    const warn = vi.fn();
    expect(await getI18nAllowedLocales(fakeDb({}, true), warn)).toEqual(['he']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('getUserLocale reads users/{uid}.core.locale; no read while only he is allowed; errors → he', async () => {
    const db = fakeDb({ 'users/u1': { core: { locale: 'en', gender: 'female' } } });
    expect(await getUserLocale(db, 'u1', ['he', 'en'])).toBe('en');
    expect(await getUserLocale(db, 'missing', ['he', 'en'])).toBe('he');
    expect(db.reads).toEqual(['users/u1', 'users/missing']);

    const off = fakeDb({ 'users/u1': { core: { locale: 'en' } } });
    expect(await getUserLocale(off, 'u1', ['he'])).toBe('he');
    expect(await getUserLocale(off, '', ['he', 'en'])).toBe('he');
    expect(off.reads).toEqual([]);

    const warn = vi.fn();
    expect(await getUserLocale(fakeDb({}, true), 'u1', ['he', 'en'], warn)).toBe('he');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('end to end: profile locale + gender → the right text', async () => {
    const db = fakeDb({
      'system_config/feature_flags': { enable_i18n: true, enable_locale_en: true },
      'users/a': { core: { locale: 'en', gender: 'female' } },
      'users/b': { core: { locale: 'ru', gender: 'female' } },
    });
    const allowed = await getI18nAllowedLocales(db);
    expect(getT(await getUserLocale(db, 'a', allowed), 'common', { gender: 'female' })('greeting.ready')).toBe('Ready?');
    // ru is not switched on → Hebrew, with the user's gender.
    expect(getT(await getUserLocale(db, 'b', allowed), 'common', { gender: 'female' })('greeting.ready')).toBe('מוכנה?');
  });
});
