/**
 * English pilot (docs/i18n/EN-PILOT-PLAN.md): the 14-check validator over the three en files,
 * plus proof that the validator itself catches each class of defect.
 */
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PILOT_SCOPE, validateAll, validateCatalog } from '../../../../scripts/i18n/validate-en-catalog';

const messages = path.resolve(__dirname, '../../../messages');

describe('en pilot catalogs (common, pages, home settings.*)', () => {
  const { issues, reports } = validateAll(messages);

  it('has 370 pilot keys: 186 + 17 + 167', () => {
    const by = Object.fromEntries(reports.map((r) => [r.ns, r.enKeys]));
    expect(by).toEqual({ common: 186, pages: 17, home: 167 });
  });

  it('passes every blocking check (V1-V10, V13-error, V14)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('home en holds only settings.* keys', () => {
    expect(Object.keys(PILOT_SCOPE)).toEqual(['common', 'pages', 'home']);
    const rep = reports.find((r) => r.ns === 'home')!;
    expect(rep.enKeys).toBe(rep.scoped);
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
  it('V14 untranslated', () => expect(run('שלום', 'שלום')).toContain('V14'));
  it('accepts a good collapsed gender select', () => expect(run('{gender, select, male {א} other {ב}}', 'Try again')).toEqual([]));
});
