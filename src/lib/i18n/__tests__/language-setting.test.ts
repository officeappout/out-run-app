import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  serverTimestamp: () => 'TS',
  updateDoc: (...a: unknown[]) => updateDoc(...a),
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/onboardingPrefs', () => ({ setOnboardingPref: vi.fn(), getOnboardingPrefAsync: vi.fn() }));

import { languageOptions } from '../language-setting';
import { effectiveLocaleFlags, pickAppLocale } from '../locale-resolution';
import { setUserLocale } from '../locale-persistence';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { useLocaleStore } from '@/store/useLocaleStore';

const F = (o: Partial<Parameters<typeof pickAppLocale>[0]> = {}) => ({
  enableI18n: true, enableLocaleEn: false, enableLocaleRu: false, enableLocaleDe: false, ...o,
});

describe('language options', () => {
  it('flag off: no row, even for a super admin / with en on', () => {
    expect(languageOptions(F({ enableI18n: false, enableLocaleEn: true }), true)).toEqual([]);
  });
  it('flag on, en off: Hebrew only → no picker; super admin gets he + en', () => {
    expect(languageOptions(F(), false)).toEqual([]);
    expect(languageOptions(F(), true).map((o) => o.value)).toEqual(['he', 'en']);
  });
  it('en flag on: everyone sees native names', () => {
    expect(languageOptions(F({ enableLocaleEn: true }), false)).toEqual([
      { value: 'he', name: 'עברית' }, { value: 'en', name: 'English' },
    ]);
  });
});

describe('resolution order', () => {
  const flags = F({ enableLocaleEn: true });
  it('explicit profile choice beats stored and device', () => {
    expect(pickAppLocale(flags, { profileLocale: 'he', storedLocale: 'en', deviceLocales: ['en-US'] })).toBe('he');
  });
  it('stored (cookie/localStorage pref) beats device', () => {
    expect(pickAppLocale(flags, { storedLocale: 'he', deviceLocales: ['en-US'] })).toBe('he');
    expect(pickAppLocale(flags, { storedLocale: 'en', deviceLocales: ['he-IL'] })).toBe('en');
  });
  it('device first-run default: en only when enabled, else he', () => {
    expect(pickAppLocale(flags, { deviceLocales: ['en-GB'] })).toBe('en');
    expect(pickAppLocale(F(), { deviceLocales: ['en-GB'] })).toBe('he');
    expect(pickAppLocale(flags, { deviceLocales: ['fr-FR'] })).toBe('he');
    expect(pickAppLocale(flags, {})).toBe('he');
  });
  it('flag off: always he', () => {
    expect(pickAppLocale(F({ enableI18n: false, enableLocaleEn: true }), { profileLocale: 'en', storedLocale: 'en', deviceLocales: ['en'] })).toBe('he');
  });
  it('super admin resolves en before enable_locale_en; others do not', () => {
    const src = { profileLocale: 'en' };
    expect(pickAppLocale(effectiveLocaleFlags(F(), true), src)).toBe('en');
    expect(pickAppLocale(effectiveLocaleFlags(F(), false), src)).toBe('he');
    expect(pickAppLocale(effectiveLocaleFlags(F({ enableI18n: false }), true), src)).toBe('he');
  });
});

describe('persistence write', () => {
  beforeEach(() => { updateDoc.mockReset(); useLocaleStore.setState({ locale: 'he' }); });
  it('writes core.locale to the user doc, pref and store', async () => {
    await setUserLocale('en', 'u1');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { 'core.locale': 'en', updatedAt: 'TS' });
    expect(setOnboardingPref).toHaveBeenCalledWith('app_locale', 'en');
    expect(useLocaleStore.getState().locale).toBe('en');
  });
  it('no uid: no Firestore write', async () => {
    await setUserLocale('he', null);
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
