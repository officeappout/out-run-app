/**
 * Generic catalog validation for every locale listed in LOCALE_PROFILES (docs/i18n/ADD-LANGUAGE.md).
 * Adding a language = add catalog files + one line in locale-profiles.ts; this test then covers it.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadGlossary, parseGlossaryLint, pluralCategories, validateLocale, validateLocaleCatalog } from '../../../../scripts/i18n/validate-catalog';
import { dirOf, LOCALES, SOURCE_LOCALE } from '../locales';
import { LOCALE_PROFILES } from '../locale-profiles';

const root = path.resolve(__dirname, '../../../..');
const messages = path.join(root, 'src/messages');

describe('locale profiles config', () => {
  it('lists only registered, non-source locales that have a catalog directory', () => {
    for (const p of LOCALE_PROFILES) {
      expect(LOCALES as readonly string[], p.locale).toContain(p.locale);
      expect(p.locale).not.toBe(SOURCE_LOCALE);
      expect(fs.existsSync(path.join(messages, p.locale)), `src/messages/${p.locale}`).toBe(true);
    }
  });

  it('every locale with at least one translated key is listed (cannot ship an unvalidated language)', () => {
    const listed = new Set(LOCALE_PROFILES.map((p) => p.locale));
    for (const loc of LOCALES) {
      if (loc === SOURCE_LOCALE) continue;
      const nonEmpty = fs.readdirSync(path.join(messages, loc)).some((f) => f.endsWith('.json') && Object.keys(JSON.parse(fs.readFileSync(path.join(messages, loc, f), 'utf8'))).length > 0);
      if (nonEmpty) expect(listed.has(loc), `${loc} has translated keys but no LOCALE_PROFILES line`).toBe(true);
    }
  });
});

describe.each(LOCALE_PROFILES.map((p) => [p.locale, p] as const))('catalogs: %s', (locale, profile) => {
  const { issues, reports } = validateLocale(messages, {
    locale, partial: profile.status === 'partial', allowNbsp: profile.allowNbsp, rtl: dirOf(locale as never) === 'rtl',
    glossary: loadGlossary(path.join(root, 'docs/i18n'), locale),
  });

  it('has no blocking issue (parity, ICU, placeholders, plural categories, tags, scripts, dashes, invisible characters)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a complete locale holds every in-scope Hebrew key', () => {
    if (profile.status !== 'complete') return;
    for (const r of reports) expect(r.targetKeys, r.ns).toBeGreaterThanOrEqual(r.scoped);
  });
});

describe('validator catches defects (any locale)', () => {
  const run = (locale: string, he: string, target: string, extra: Record<string, unknown> = {}) =>
    validateLocaleCatalog({ ns: 't', he: { k: he }, target: { k: target }, options: { locale, ...extra } }).filter((i) => i.severity === 'error').map((i) => i.check);

  it('G4 Russian plurals need one/few/many/other', () => {
    expect(run('ru', '{n, plural, one {א} other {ב}}', '{n, plural, one {# день} other {# дней}}')).toContain('G4');
    expect(run('ru', '{n, plural, one {א} other {ב}}', '{n, plural, one {# день} few {# дня} many {# дней} other {# дня}}')).toEqual([]);
  });
  it('G4 a category the language does not use (English "few")', () => {
    expect(run('en', '{n, plural, one {א} other {ב}}', '{n, plural, one {a} few {b} other {c}}')).toContain('G4');
  });
  it('G4 Spanish "many" only warns (reached by 1000000 only), "one" and "other" are required', () => {
    expect(run('es', '{n, plural, one {א} other {ב}}', '{n, plural, one {# día} other {# días}}')).toEqual([]);
    expect(run('es', '{n, plural, one {א} other {ב}}', '{n, plural, other {# días}}')).toContain('G4');
  });
  it('pluralCategories', () => {
    expect(pluralCategories('ru').reachable.sort()).toEqual(['few', 'many', 'one', 'other']);
    expect(pluralCategories('de').all.sort()).toEqual(['one', 'other']);
    expect(pluralCategories('es').reachable.sort()).toEqual(['one', 'other']);
  });
  it('G1 key that does not exist in Hebrew', () => {
    expect(validateLocaleCatalog({ ns: 't', he: { k: 'א' }, target: { z: 'a' }, options: { locale: 'es' } }).map((i) => i.check)).toContain('G1');
  });
  it('G1 missing key is an error unless partial', () => {
    expect(validateLocaleCatalog({ ns: 't', he: { k: 'א' }, target: {}, options: { locale: 'es' } }).map((i) => i.check)).toContain('G1');
    expect(validateLocaleCatalog({ ns: 't', he: { k: 'א' }, target: {}, options: { locale: 'es', partial: true } })).toEqual([]);
  });
  it('G2 / G3 / G7 / G8 / G10 structure', () => {
    expect(run('es', 'א {n}', 'a {n')).toContain('G2');
    expect(run('es', 'א {n}', 'a')).toContain('G3');
    expect(run('es', 'א', 'a {m}')).toContain('G3');
    expect(run('es', '<b>א</b>', 'a')).toContain('G7');
    expect(run('es', 'א', 'שלום')).toContain('G8');
    expect(run('es', 'א', 'a 5')).toContain('G10');
  });
  it('G5 / G6 selects: non-gender branches kept, gender may collapse', () => {
    expect(run('es', '{x, select, a {א} other {ב}}', '{x, select, b {a} other {b}}')).toContain('G5');
    expect(run('es', '{gender, select, male {א} female {ג} other {ב}}', 'Intentar de nuevo')).toEqual([]);
    expect(run('es', '{gender, select, male {א} other {ב}}', '{gender, select, boy {a} other {b}}')).toContain('G6');
  });
  it('G12 long dash is an error (a warning only when Hebrew has it)', () => {
    expect(run('es', 'א', 'a — b')).toContain('G12');
    expect(run('es', 'א — ב', 'a — b')).not.toContain('G12');
  });
  it('G19 zero-width characters; no-break space unless the profile allows it; bidi marks only in RTL locales', () => {
    expect(run('es', 'א', 'a​b')).toContain('G19');
    expect(run('es', 'א', 'a b')).toContain('G19');
    expect(run('ru', 'א', 'a b', { allowNbsp: true })).toEqual([]);
    expect(run('es', 'א', 'a‏b')).toContain('G19');
    expect(run('ar', 'א', 'a‏b', { rtl: true })).toEqual([]);
  });
  it('G14 untranslated', () => expect(run('es', 'שלום', 'שלום')).toContain('G8'));
  it('G20 push @tokens are kept byte for byte', () => {
    expect(run('es', 'האימון ב-@שעה', 'Tu entrenamiento a las @hora')).toContain('G20');
    expect(run('es', 'האימון ב-@שעה', 'Tu entrenamiento a las @שעה')).toContain('G8');
  });
  it('G13 per-locale glossary lint file', () => {
    const glossary = parseGlossaryLint('x\n```lint\n# comment\nרצף => racha => streak\n!! parque de fitness => use "gimnasio al aire libre"\n```\n');
    expect(glossary.required).toHaveLength(1);
    const found = validateLocaleCatalog({ ns: 't', he: { k: 'רצף' }, target: { k: 'secuencia' }, options: { locale: 'es', glossary } });
    expect(found.map((i) => `${i.check}:${i.severity}`)).toEqual(['G13:warn']);
    expect(run('es', 'א', 'un parque de fitness', { glossary })).toContain('G13');
  });
  it('he-only hidden keys must stay Hebrew: translating one is an error', () => {
    const issues = validateLocaleCatalog({ ns: 'community', he: { 'group.location.military': 'א' }, target: { 'group.location.military': 'a' }, inScope: () => false, options: { locale: 'es' } });
    expect(issues.map((i) => i.check)).toContain('G1');
  });
});
