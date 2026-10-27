/**
 * English pilot (docs/i18n/EN-PILOT-PLAN.md): the 14-check validator over the three en files,
 * plus proof that the validator itself catches each class of defect.
 */
import fs from 'fs';
import path from 'path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_NEUTRAL, PILOT_SCOPE, validateAll, validateCatalog } from '../../../../scripts/i18n/validate-en-catalog';

const messages = path.resolve(__dirname, '../../../messages');

describe('en catalogs (pilot: common, pages, home settings.*; batch 3: player, summary)', () => {
  const { issues, reports } = validateAll(messages);

  it('has the expected key counts per catalog (pilot 370 + batch 3: player 902, summary 167)', () => {
    const by = Object.fromEntries(reports.map((r) => [r.ns, r.enKeys]));
    expect(by).toEqual({ common: 186, pages: 17, home: 167, player: 902, summary: 167 });
  });

  it('passes every blocking check (V1-V10, V13-error, V14)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('home en holds only settings.* keys', () => {
    expect(Object.keys(PILOT_SCOPE)).toEqual(['common', 'pages', 'home', 'player', 'summary']);
    const rep = reports.find((r) => r.ns === 'home')!;
    expect(rep.enKeys).toBe(rep.scoped);
  });
});

describe('batch 3: player + summary', () => {
  const he = (ns: string) => JSON.parse(fs.readFileSync(path.join(messages, 'he', `${ns}.json`), 'utf8')) as Record<string, string>;
  const en = (ns: string) => JSON.parse(fs.readFileSync(path.join(messages, 'en', `${ns}.json`), 'utf8')) as Record<string, string>;
  const { issues } = validateAll(messages);

  it('translates every key except the language-neutral ones (identical in Hebrew), nothing extra', () => {
    for (const ns of ['player', 'summary'] as const) {
      const missing = Object.keys(he(ns)).filter((k) => !(k in en(ns)));
      expect(missing.sort()).toEqual(Array.from(LANGUAGE_NEUTRAL[ns]).sort());
      expect(Object.keys(en(ns)).filter((k) => !(k in he(ns)))).toEqual([]);
    }
  });

  it('every key parses as ICU, has no Hebrew, and keeps the Hebrew key order', () => {
    for (const ns of ['player', 'summary'] as const) {
      const keys = Object.keys(en(ns));
      expect(keys).toEqual(Object.keys(he(ns)).filter((k) => keys.includes(k)));
      for (const [k, v] of Object.entries(en(ns))) {
        expect(() => new IntlMessageFormat(v, 'en', undefined, { ignoreTag: false }), k).not.toThrow();
        expect(/[\u0590-\u05FF]/.test(v), k).toBe(false);
      }
    }
  });

  it('plural policy: no count placeholder next to a noun without an ICU plural (V15)', () => {
    expect(issues.filter((i) => i.check === 'V15' && ['player', 'summary'].includes(i.ns))).toEqual([]);
  });

  it('plural coverage: English never uses categories other than one/other and =N', () => {
    for (const ns of ['player', 'summary'] as const) {
      for (const [k, v] of Object.entries(en(ns))) {
        expect(/\b(zero|two|few|many)\s*\{/.test(v), `${ns}:${k} uses a non-English plural category`).toBe(false);
      }
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
  it('V16 English plural without one or other', () => {
    expect(run('{n, plural, one {א} other {ב}}', '{n, plural, other {a}}')).toContain('V16');
    expect(run('{n, plural, one {א} other {ב}}', '{n, plural, one {a} other {b}}')).not.toContain('V16');
    expect(run('{n, plural, =1 {א} other {ב}}', '{n, plural, =1 {a} other {b}}')).not.toContain('V16');
    expect(run('{n, plural, one {א} other {ב}}', '{n, plural, one {a}}')).toContain('V2'); // missing other fails to parse
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
