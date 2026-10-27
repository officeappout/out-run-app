/**
 * Wave 5B — pushes by recipient locale (docs/i18n/PLAN.md §2.6): the gate, the selection chain,
 * and the flag-off identity proof against output recorded from origin/main before this wave.
 */
import { describe, it, expect } from 'vitest';
import fixture from './push-locale-identity.fixture.json';
import {
  PUSH_CATALOG,
  defaultRowsFor,
  resolvePushLocale,
  rowLocale,
  sampleVarsFor,
  selectPushCopy,
  type PushCopyRow,
} from '../push-library.core';

const NOW = new Date('2026-10-20T09:00:00Z');
const row = (o: Partial<PushCopyRow>): PushCopyRow => ({
  id: 'r',
  pushType: 'level_up',
  title: 'כותרת',
  body: 'גוף',
  active: true,
  ...o,
});
const pick = (rows: PushCopyRow[], ctx: Record<string, unknown> = {}) =>
  selectPushCopy('level_up', rows, { uid: 'u1', now: NOW, vars: sampleVarsFor('level_up'), ...ctx } as never);

describe('resolvePushLocale (the gate)', () => {
  it('needs BOTH flags and a sane core.locale', () => {
    expect(resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: true, userLocale: 'en' })).toBe('en');
    expect(resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: true, userLocale: ' EN ' })).toBe('en');
    expect(resolvePushLocale({ i18nEnabled: false, pushLocaleEnabled: true, userLocale: 'en' })).toBe('he');
    expect(resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: false, userLocale: 'en' })).toBe('he');
    expect(resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: true })).toBe('he');
    expect(resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: true, userLocale: 'english' })).toBe('he');
    expect(resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: true, userLocale: 42 })).toBe('he');
  });
  it('rowLocale: absent / empty → he', () => {
    expect(rowLocale({})).toBe('he');
    expect(rowLocale({ locale: '' })).toBe('he');
    expect(rowLocale({ locale: 'EN' })).toBe('en');
  });
});

describe('selection chain matrix', () => {
  const he = row({ id: 'he1', title: 'עברית', body: 'גוף עברי' });
  const en = row({ id: 'en1', locale: 'en', title: 'English', body: 'English body' });
  const enAudience = { gender: 'female' as const };

  it('locale he (or none): only Hebrew rows, an en row never leaks', () => {
    expect(pick([en, he])?.rowId).toBe('he1');
    expect(pick([en, he], { locale: 'he' })?.rowId).toBe('he1');
    expect(pick([en, he])?.locale).toBeUndefined();
  });
  it('locale en + en row → the en row (any recipient gender: an ungendered row fits everyone)', () => {
    for (const gender of [undefined, 'male', 'female'] as const) {
      const r = pick([he, en], { locale: 'en', audience: { gender } });
      expect(r?.rowId).toBe('en1');
      expect(r?.title).toBe('English');
      expect(r?.locale).toBe('en');
    }
  });
  it('locale en: a gendered en row follows the gender chain, the ungendered one is the neutral fallback', () => {
    const f = row({ id: 'en-f', locale: 'en', gender: 'female', title: 'F', body: 'F' });
    const both = row({ id: 'en-b', locale: 'en', title: 'B', body: 'B' });
    expect(pick([f, both], { locale: 'en', audience: enAudience })?.rowId).toBe('en-f');
    expect(pick([f, both], { locale: 'en', audience: { gender: 'male' } })?.rowId).toBe('en-b');
    expect(pick([f, both], { locale: 'en', audience: {} })?.rowId).toBe('en-b');
  });
  it('locale en, no en row, no translated defaults → Hebrew library row', () => {
    const r = pick([he], { locale: 'en' });
    expect(r?.rowId).toBe('he1');
    expect(r?.source).toBe('library');
    expect(r?.locale).toBeUndefined();
  });
  it('locale en, nothing at all → Hebrew code default', () => {
    const r = pick([], { locale: 'en' });
    expect(r?.source).toBe('default');
    expect(r?.rowId).toBe('default:level_up:' + r?.rowId.split(':')[2]);
    expect(r?.locale).toBeUndefined();
  });
  it('unknown locale ("xx") behaves like missing translations → Hebrew', () => {
    expect(pick([he], { locale: 'xx' })?.rowId).toBe('he1');
    expect(pick([], { locale: 'xx' })?.source).toBe('default');
  });
  it('an inactive / archived en row is skipped → Hebrew', () => {
    expect(pick([row({ ...en, active: false }), he], { locale: 'en' })?.rowId).toBe('he1');
    expect(pick([row({ ...en, archived: true }), he], { locale: 'en' })?.rowId).toBe('he1');
  });
  it('translated code defaults of the locale win over the Hebrew library; untranslated keys do not count', () => {
    // No locale ships push.json yet → no translated defaults exist.
    // (an untranslated key falls back to the Hebrew text inside the shared core)
    expect(defaultRowsFor('level_up', 'en').map((r) => r.title)).toEqual(defaultRowsFor('level_up', 'he').map((r) => r.title));
    const r = pick([he], { locale: 'en' });
    expect(r?.rowId).toBe('he1');
  });
});

describe('flag-off identity (30 cases recorded from origin/main before wave 5B)', () => {
  const genders = fixture.cases.map((c) => c.gender);
  it('covers all three recipient genders', () => {
    expect(new Set(genders)).toEqual(new Set(['male', 'female', null]));
    expect(fixture.cases).toHaveLength(30);
  });
  it.each(fixture.cases.map((c, i) => [i, c] as const))('case %i selects + renders as before', (_i, c) => {
    // A Hebrew library full of en rows must not change anything either.
    const enRows = PUSH_CATALOG.map((e) => row({ id: `en-${e.pushType}`, pushType: e.pushType, locale: 'en', title: 'T', body: 'B' }));
    const locale = resolvePushLocale({ i18nEnabled: true, pushLocaleEnabled: false, userLocale: 'en' });
    const ctx = {
      uid: c.uid,
      now: NOW,
      audience: { gender: c.gender, locale: 'en' },
      vars: sampleVarsFor(c.pushType, { gender: c.gender as never, subjectGender: c.subjectGender as never }),
      subjectGender: c.subjectGender,
      conditions: { tone: 'cute', track: 'strength', level: '5', bucket: 'mid', stage: '1' },
      locale,
    };
    for (const rows of [[], enRows]) {
      const r = selectPushCopy(c.pushType, rows, ctx as never)!;
      expect({ title: r.title, body: r.body, deepLink: r.deepLink, rowId: r.rowId, source: r.source }).toEqual(c.result);
      expect(r.locale).toBeUndefined();
    }
  });
});
