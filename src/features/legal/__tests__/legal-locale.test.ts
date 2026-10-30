import { describe, expect, it } from 'vitest';
import { legalHostAttrs, pickLegalLocale, requestedLegalLocale } from '../legal-locale';
import { accessibilityLastUpdated, legalLastUpdated } from '../legal-dates';
import { LEGAL_LAST_UPDATED_HE } from '../legal-content';

const ON = { enableI18n: true, enableLocaleEn: true, enableLocaleRu: false, enableLocaleDe: false };

describe('requestedLegalLocale', () => {
  it('?lang= wins over the cookie; junk params fall back to the cookie', () => {
    expect(requestedLegalLocale('en', 'he')).toBe('en');
    expect(requestedLegalLocale('he', 'en')).toBe('he');
    expect(requestedLegalLocale(['en'], null)).toBe('en');
    expect(requestedLegalLocale('xx', 'en')).toBe('en');
    expect(requestedLegalLocale(undefined, null)).toBeNull();
  });
});

describe('pickLegalLocale', () => {
  it('Hebrew unless the stored flags allow the requested language', () => {
    expect(pickLegalLocale(null, ON)).toBe('he');
    expect(pickLegalLocale('en', ON)).toBe('en');
    expect(pickLegalLocale('en', null)).toBe('he');
    expect(pickLegalLocale('en', { ...ON, enableI18n: false })).toBe('he');
    expect(pickLegalLocale('en', { ...ON, enableLocaleEn: false })).toBe('he');
    expect(pickLegalLocale('ru', ON)).toBe('he');
  });
});

describe('host attrs + dates', () => {
  it('he/rtl, en/ltr', () => {
    expect(legalHostAttrs('he')).toEqual({ dir: 'rtl', lang: 'he' });
    expect(legalHostAttrs('en')).toEqual({ dir: 'ltr', lang: 'en' });
  });
  it('Hebrew dates are the original strings; English is formatted', () => {
    expect(legalLastUpdated('he')).toBe(LEGAL_LAST_UPDATED_HE);
    expect(accessibilityLastUpdated('he')).toBe('27 באוקטובר 2026');
    expect(legalLastUpdated('en')).toBe('October 2026');
    expect(accessibilityLastUpdated('en')).toBe('October 27, 2026');
  });
});
