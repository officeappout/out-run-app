import { describe, expect, it } from 'vitest';
import { allowedLocales, decideHtmlLangDir, deviceLocalesFor, effectiveLocaleFlags, deviceDetectAllowed, isNewUserForLocale, pickAppLocale } from '../locale-resolution';
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
  it('he is the catalog, en translated, including the health/terms keys (legal-draft register, pending lawyer review)', () => {
    expect(legacyHe).toEqual(heLegacy);
    expect(getTranslation('onboarding.continue')).toBe(heLegacy['onboarding.continue']);
    expect(getTranslation('challenge.booth.participants', 'en')).toBe('Participants');
    expect(getTranslation('onboarding.continue', 'en')).toBe('Continue');
    expect(getTranslation('onboarding.health.title', 'en')).toBe('Health Declaration and Terms of Use');
    expect(getTranslation('onboarding.terms.title', 'en')).toBe('Terms of Use');
  });
});

describe('deviceLocalesFor — super-admin English is never an automatic device default', () => {
  it('real enable_locale_en off: en devices are dropped, other languages stay', () => {
    expect(deviceLocalesFor(['en-US', 'ru', 'en'], { enableLocaleEn: false })).toEqual(['ru']);
    expect(deviceLocalesFor(['he-IL'], { enableLocaleEn: false })).toEqual(['he-IL']);
    expect(deviceLocalesFor(['english'], { enableLocaleEn: false })).toEqual(['english']);
  });
  it('real enable_locale_en on: untouched', () => {
    expect(deviceLocalesFor(['en-US'], { enableLocaleEn: true })).toEqual(['en-US']);
  });
  it('a super admin on an English device resolves to Hebrew until they pick English', () => {
    const flags = effectiveLocaleFlags({ enableI18n: true, enableLocaleEn: false, enableLocaleRu: false, enableLocaleDe: false }, true);
    expect(pickAppLocale(flags, { deviceLocales: deviceLocalesFor(['en-US'], { enableLocaleEn: false }) })).toBe('he');
    expect(pickAppLocale(flags, { storedLocale: 'en', deviceLocales: deviceLocalesFor(['en-US'], { enableLocaleEn: false }) })).toBe('en');
  });
});

describe('device detection is for new users only', () => {
  const on = { enableI18n: true, enableLocaleEn: true, enableLocaleRu: false, enableLocaleDe: false };
  const off = { ...on, enableI18n: false, enableLocaleEn: false };
  const NOW = Date.UTC(2026, 9, 29);
  const DAY = 24 * 60 * 60 * 1000;
  const device = ['en-US', 'he-IL'];
  const pick = (profile: { createdAt?: unknown } | null, extra: object = {}) =>
    pickAppLocale(on, { deviceLocales: device, detectDevice: isNewUserForLocale(profile, NOW), ...extra });

  it('classifies new vs existing', () => {
    expect(isNewUserForLocale(null, NOW)).toBe(true);
    expect(isNewUserForLocale({ createdAt: new Date(NOW - 1000) }, NOW)).toBe(true);
    expect(isNewUserForLocale({ createdAt: { seconds: (NOW - 2 * DAY) / 1000 } }, NOW)).toBe(false);
    expect(isNewUserForLocale({ createdAt: { toMillis: () => NOW - 30 * DAY } }, NOW)).toBe(false);
    expect(isNewUserForLocale({ onboardingStatus: 'COMPLETED' }, NOW)).toBe(false); // legacy doc without createdAt
  });
  it('existing user + English device -> he', () => {
    expect(pick({ createdAt: new Date(NOW - 30 * DAY) })).toBe('he');
  });
  it('new user (or no account yet) + English device -> en', () => {
    expect(pick(null)).toBe('en');
    expect(pick({ createdAt: new Date(NOW - 1000) })).toBe('en');
  });
  it('an explicit choice always wins, for existing users too', () => {
    const old = { createdAt: new Date(NOW - 30 * DAY) };
    expect(pick(old, { profileLocale: 'en' })).toBe('en');
    expect(pick(old, { storedLocale: 'en' })).toBe('en');
    expect(pick(null, { profileLocale: 'he' })).toBe('he');
  });
  it('flag off -> he for everyone', () => {
    expect(pickAppLocale(off, { deviceLocales: device, detectDevice: true })).toBe('he');
    expect(pickAppLocale(off, { profileLocale: 'en', deviceLocales: device })).toBe('he');
  });
  it('parses ISO string createdAt', () => {
    expect(isNewUserForLocale({ createdAt: new Date(NOW - 1000).toISOString() }, NOW)).toBe(true);
    expect(isNewUserForLocale({ createdAt: new Date(NOW - 9 * DAY).toISOString() }, NOW)).toBe(false);
  });
  it('pending createdAt: new while onboarding unsettled, existing when settled (legacy)', () => {
    expect(isNewUserForLocale({ createdAt: null }, NOW)).toBe(true);
    expect(isNewUserForLocale({ createdAt: null, onboardingStatus: 'IN_PROGRESS' }, NOW)).toBe(true);
    expect(isNewUserForLocale({ onboardingStatus: 'COMPLETED' }, NOW)).toBe(false);
    expect(isNewUserForLocale({ createdAt: {}, onboardingStatus: 'MAP_ONLY' }, NOW)).toBe(false);
  });
  it('no profile yet: device allowed only for a hydrated, anonymous launch', () => {
    expect(deviceDetectAllowed({ profile: null, hydrated: false, hasAuthUser: false })).toBe(false);
    expect(deviceDetectAllowed({ profile: null, hydrated: true, hasAuthUser: true })).toBe(false);
    expect(deviceDetectAllowed({ profile: null, hydrated: true, hasAuthUser: false })).toBe(true);
    expect(deviceDetectAllowed({ profile: { createdAt: new Date(NOW - 30 * DAY) }, hydrated: true, hasAuthUser: true, now: NOW })).toBe(false);
  });
});
