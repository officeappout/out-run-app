import { describe, expect, it } from 'vitest';
import { allowedLocales, decideHtmlLangDir, pickAppLocale } from '../locale-resolution';
import { parseLocaleCookie } from '../locale-cookie';
import { formatDate, formatNumber, formatTime, weekdayName } from '../core/fmt';
import { getTranslation, he as legacyHe } from '../dictionaries';
import heLegacy from '@/messages/he/legacy-dictionary.json';

const OFF = { enableI18n: false, enableLocaleEn: true, enableLocaleRu: true, enableLocaleDe: true };
const ON_EN = { enableI18n: true, enableLocaleEn: true, enableLocaleRu: false, enableLocaleDe: false };

describe('flags', () => {
  it('master off → Hebrew only, even with language flags on', () => {
    expect(allowedLocales(OFF)).toEqual(['he']);
    expect(pickAppLocale(OFF, { profileLocale: 'en', deviceLocales: ['en-US'] })).toBe('he');
  });
  it('master on → Hebrew + the languages switched on', () => {
    expect(allowedLocales(ON_EN)).toEqual(['he', 'en']);
    expect(pickAppLocale(ON_EN, { deviceLocales: ['en-US'] })).toBe('en');
    expect(pickAppLocale(ON_EN, { profileLocale: 'ru', deviceLocales: ['ru-RU'] })).toBe('he');
    expect(pickAppLocale(ON_EN, { profileLocale: 'he', deviceLocales: ['en-US'] })).toBe('he');
  });
});

describe('<html lang dir>', () => {
  it('i18n off: exactly the old LanguageProvider values (legacy store)', () => {
    expect(decideHtmlLangDir({ i18nEnabled: false, locale: 'he', legacyLanguage: 'he', legacyDirection: 'rtl' })).toEqual({ lang: 'he', dir: 'rtl' });
    // The challenge pages' he/en toggle keeps working as today.
    expect(decideHtmlLangDir({ i18nEnabled: false, locale: 'he', legacyLanguage: 'en', legacyDirection: 'ltr' })).toEqual({ lang: 'en', dir: 'ltr' });
  });
  it('i18n on + Hebrew: still the legacy values', () => {
    expect(decideHtmlLangDir({ i18nEnabled: true, locale: 'he', legacyLanguage: 'he', legacyDirection: 'rtl' })).toEqual({ lang: 'he', dir: 'rtl' });
  });
  it('i18n on + another locale: that locale, ltr', () => {
    expect(decideHtmlLangDir({ i18nEnabled: true, locale: 'de', legacyLanguage: 'he', legacyDirection: 'rtl' })).toEqual({ lang: 'de', dir: 'ltr' });
  });
});

describe('out_locale cookie', () => {
  it('parses a valid locale, ignores anything else', () => {
    expect(parseLocaleCookie('a=1; out_locale=en; b=2')).toBe('en');
    expect(parseLocaleCookie('out_locale=fr')).toBeNull();
    expect(parseLocaleCookie('')).toBeNull();
    expect(parseLocaleCookie(undefined)).toBeNull();
  });
});

describe('fmt: Hebrew output equals today\'s he-IL calls', () => {
  const d = new Date(2026, 9, 21, 7, 5);
  it('numbers, dates, times', () => {
    expect(formatNumber(12345.678, 'he')).toBe((12345.678).toLocaleString('he-IL'));
    expect(formatDate(d, 'he', { day: 'numeric', month: 'long' })).toBe(d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }));
    expect(formatTime(d, 'he')).toBe(d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
    expect(weekdayName(0, 'he')).toBe('יום ראשון');
    expect(weekdayName(0, 'en')).toBe('Sunday');
  });
});

describe('legacy dictionary (folded into src/messages, behaviour unchanged)', () => {
  it('he is the catalog, en falls back to the key', () => {
    expect(legacyHe).toEqual(heLegacy);
    expect(getTranslation('onboarding.continue')).toBe(heLegacy['onboarding.continue']);
    expect(getTranslation('challenge.booth.participants', 'en')).toBe('Participants');
    expect(getTranslation('onboarding.continue', 'en')).toBe('onboarding.continue');
  });
});
