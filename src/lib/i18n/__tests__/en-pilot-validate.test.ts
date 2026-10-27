/**
 * English pilot (docs/i18n/EN-PILOT-PLAN.md): the 14-check validator over the three en files,
 * plus proof that the validator itself catches each class of defect.
 */
import fs from 'fs';
import path from 'path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_SKIPPED, PILOT_SCOPE, validateAll, validateCatalog } from '../../../../scripts/i18n/validate-en-catalog';

const messages = path.resolve(__dirname, '../../../messages');

describe('en pilot catalogs (common, pages, home settings.*)', () => {
  const { issues, reports } = validateAll(messages);

  it('has 370 pilot keys (186 + 17 + 167) and 1034 onboarding keys', () => {
    const by = Object.fromEntries(reports.map((r) => [r.ns, r.enKeys]));
    expect(by).toEqual({ common: 186, pages: 17, home: 167, onboarding: 1034 });
  });

  it('passes every blocking check (V1-V10, V13-error, V14)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('home en holds only settings.* keys', () => {
    expect(Object.keys(PILOT_SCOPE)).toEqual(['common', 'pages', 'home', 'onboarding']);
    const rep = reports.find((r) => r.ns === 'home')!;
    expect(rep.enKeys).toBe(rep.scoped);
  });
});

describe('en onboarding (batch 2)', () => {
  const { reports, issues } = validateAll(messages);
  const he = JSON.parse(fs.readFileSync(path.join(messages, 'he/onboarding.json'), 'utf8')) as Record<string, string>;
  const en = JSON.parse(fs.readFileSync(path.join(messages, 'en/onboarding.json'), 'utf8')) as Record<string, string>;

  it('translates every key except the 62 deliberately skipped ones', () => {
    const skipped = Object.keys(he).filter((k) => ONBOARDING_SKIPPED.test(k));
    expect(skipped.length).toBe(62);
    expect(Object.keys(en).length + skipped.length).toBe(Object.keys(he).length);
    expect(skipped.some((k) => k in en)).toBe(false);
  });

  it('has 0 errors (parity, plurals, ICU parse, no Hebrew)', () => {
    expect(issues.filter((i) => i.ns === 'onboarding' && i.severity === 'error')).toEqual([]);
    expect(reports.find((r) => r.ns === 'onboarding')!.errors).toBe(0);
  });

  it('every English string parses as ICU', () => {
    for (const [k, v] of Object.entries(en)) expect(() => new IntlMessageFormat(v, 'en'), k).not.toThrow();
  });

  it('plural coverage: every plural has one (or =N) and other; no stray digit-noun counts', () => {
    for (const [k, v] of Object.entries(en)) {
      for (const m of v.matchAll(/\{(\w+), plural,/g)) expect(v, k).toMatch(/other \{/);
      expect(/\{\w+\}\s+(minutes|weeks|days|hours|runs|walks|workouts|exercises|stations|members)\b/.test(v.replace(/\{\w+, plural,[^]*$/, '')), k).toBe(false);
    }
  });

  it('no spaces inside <b>…</b>, no em dashes, no ASCII apostrophes', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(/<b>\s|\s<\/b>/.test(v), k).toBe(false);
      expect(v.includes('—'), k).toBe(false);
      expect(v.includes("'"), k).toBe(false);
    }
  });
});

describe('validator catches defects', () => {
  const run = (he: string, en: string) =>
    validateCatalog({ ns: 't', he: { k: he }, en: { k: en } }).filter((i) => i.severity === 'error').map((i) => i.check);

  it('V1 extra / missing key', () => {
    expect(validateCatalog({ ns: 't', he: { k: 'א' }, en: {} }).map((i) => i.check)).toContain('V1');
    expect(validateCatalog({ ns: 't', he: { k: 'א' }, en: { k: 'a', z: 'b' } }).map((i) => i.check)).toContain('V1');
  });
  it('V2 unparseable', () => expect(run('א {n}', 'a {n')).toContain('V2'));
  it('V3 placeholder missing or added', () => {
    expect(run('א {n}', 'a')).toContain('V3');
    expect(run('א {n}', 'a {n} {m}')).toContain('V3');
  });
  it('V4 plural turned into text, or a "two" category', () => {
    expect(run('{n, plural, one {א} other {ב}}', 'a {n}')).toContain('V4');
    expect(run('{n, plural, one {א} other {ב}}', '{n, plural, one {a} two {b} other {c}}')).toContain('V4');
  });
  it('V5 select branches differ', () => expect(run('{x, select, a {א} other {ב}}', '{x, select, b {a} other {b}}')).toContain('V5'));
  it('V6 gendered slash', () => expect(run('א', 'he/she')).toContain('V6'));
  it('V7 tag mismatch', () => expect(run('<b>א</b>', 'a')).toContain('V7'));
  it('V8 Hebrew left', () => expect(run('א', 'שלום')).toContain('V8'));
  it('V9 ASCII apostrophe', () => expect(run('א', "don't")).toContain('V9'));
  it('V10 stray digit', () => expect(run('א', 'a 5')).toContain('V10'));
  it('V13 old term "fitness park"', () => expect(run('גינת כושר', 'fitness park')).toContain('V13'));
  it('V15 a count next to a noun needs an ICU plural', () => {
    expect(run('{n} אימונים', '{n} workouts')).toContain('V15');
    expect(run('{n, plural, =1 {אחד} other {{n} אימונים}}', '{n, plural, =1 {One} other {{n} workouts}}')).toEqual([]);
    expect(run('{n, plural, one {א} other {ב}}', '{n, plural, other {# workouts}}')).toContain('V15');
  });
  it('V16 space inside a rich tag', () => expect(run('<b>א</b>', '<b> a </b>')).toContain('V16'));
  it('V17 "log in"', () => expect(run('התחברות', 'Log in')).toContain('V17'));
  it('V14 untranslated', () => expect(run('שלום', 'שלום')).toContain('V14'));
  it('accepts a good collapsed gender select', () => expect(run('{gender, select, male {א} other {ב}}', 'Try again')).toEqual([]));
});
