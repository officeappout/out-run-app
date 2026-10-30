/**
 * English pilot (docs/i18n/EN-PILOT-PLAN.md): the 14-check validator over the three en files,
 * plus proof that the validator itself catches each class of defect.
 */
import fs from 'fs';
import path from 'path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_NEUTRAL, LEGAL_LANGUAGE_NEUTRAL, ONBOARDING_SKIPPED, PILOT_SCOPE, validateAll, validateCatalog } from '../../../../scripts/i18n/validate-en-catalog';

const messages = path.resolve(__dirname, '../../../messages');

describe('en catalogs (pilot: common, pages; batch 3: player, summary; batch 4: home (all), profile; batch 5: map)', () => {
  const { issues, reports } = validateAll(messages);

  it('has the expected key counts per catalog (pilot 370 + onboarding 1069 + player 929 + summary 178 + home rest 581 + profile 576 + map 919 + library 448 + coach 349 + wide 155)', () => {
    const by = Object.fromEntries(reports.map((r) => [r.ns, r.enKeys]));
    expect(by).toEqual({ common: 221, pages: 17, home: 839, onboarding: 1139, player: 1154, summary: 181, profile: 597, social: 158, together: 132, community: 950, map: 1048, library: 489, coach: 349, wide: 155, push: 471, schedule: 258, legal: 359 });
  });

  it('passes every blocking check (V1-V10, V13-error, V14)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('home en holds every he key (batch 4)', () => {
    expect(Object.keys(PILOT_SCOPE)).toEqual(['common', 'pages', 'home', 'onboarding', 'player', 'summary', 'profile', 'social', 'together', 'community', 'map', 'library', 'coach', 'wide', 'push', 'schedule', 'legal']);
    const rep = reports.find((r) => r.ns === 'home')!;
    expect(rep.enKeys).toBe(rep.scoped);
  });
});

describe('en onboarding (batch 2)', () => {
  const { reports, issues } = validateAll(messages);
  const he = JSON.parse(fs.readFileSync(path.join(messages, 'he/onboarding.json'), 'utf8')) as Record<string, string>;
  const en = JSON.parse(fs.readFileSync(path.join(messages, 'en/onboarding.json'), 'utf8')) as Record<string, string>;

  it('translates every key except the 48 deliberately skipped ones', () => {
    const skipped = Object.keys(he).filter((k) => ONBOARDING_SKIPPED.test(k));
    expect(skipped.length).toBe(48);
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

  it('plural coverage: every plural has one and other; no stray digit-noun counts', () => {
    for (const [k, v] of Object.entries(en)) {
      if (/\{\w+, plural,/.test(v)) expect(v, k).toMatch(/other \{/);
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
    expect(run('{n, plural, =1 {אחד} other {{n} אימונים}}', '{n, plural, one {One} other {{n} workouts}}')).toEqual([]);
    expect(run('{n, plural, =1 {אחד} other {{n} אימונים}}', '{n, plural, =1 {One} other {{n} workouts}}')).toContain('V15');
    expect(run('{n, plural, one {א} other {ב}}', '{n, plural, other {# workouts}}')).toContain('V15');
  });
  it('V15 a plural needs a `one` branch, `=1` + `other` is an error', () => {
    expect(run('{n, plural, =1 {א} other {ב}}', '{n, plural, =1 {One day} other {# days}}')).toContain('V15');
    expect(run('{n, plural, =1 {א} other {ב}}', '{n, plural, one {One day} other {# days}}')).toEqual([]);
  });
  it('V18 a placeholder next to a count noun outside a plural', () => {
    expect(run('{perWeek} פעמים', '{perWeek, select, 2 {twice} other {{perWeek} times}} a week')).toContain('V18');
    expect(run('{n} פריטים', '{n} items')).toContain('V18');
    expect(run('{n} מסלולים', '{n, plural, one {# route} other {# routes}}')).toEqual([]);
  });
  it('V18 other words after a placeholder only warn', () => {
    const w = validateCatalog({ ns: 't', he: { k: 'א' }, en: { k: '{n} stuff' } }).filter((i) => i.check === 'V18');
    expect(w.map((i) => i.severity)).toEqual(['warn']);
  });
  it('V19 zero-width characters and NBSP', () => {
    expect(run('א', 'a\u200Bb')).toContain('V19');
    expect(run('א', 'a\u00A0b')).toContain('V19');
  });
  it('V13 "lighter week" also triggers on שבוע קל', () => {
    const w = validateCatalog({ ns: 't', he: { k: 'שבוע קל' }, en: { k: 'Easy week' } }).filter((i) => i.check === 'V13');
    expect(w.length).toBe(1);
  });
  it('V16 space inside a rich tag', () => expect(run('<b>א</b>', '<b> a </b>')).toContain('V16'));
  it('V17 "log in"', () => expect(run('התחברות', 'Log in')).toContain('V17'));
  it('V14 untranslated', () => expect(run('שלום', 'שלום')).toContain('V14'));
  it('accepts a good collapsed gender select', () => expect(run('{gender, select, male {א} other {ב}}', 'Try again')).toEqual([]));
});

describe('batch 8: schedule + legal (legal is a DRAFT for lawyer review, docs/i18n/EN-LEGAL-REVIEW.md)', () => {
  const rd = (l: string, ns: string) => JSON.parse(fs.readFileSync(path.join(messages, l, `${ns}.json`), 'utf8')) as Record<string, string>;
  const { issues } = validateAll(messages);

  it('schedule: every he key is translated, nothing extra', () => {
    expect(Object.keys(rd('en', 'schedule')).sort()).toEqual(Object.keys(rd('he', 'schedule')).sort());
    expect(Object.keys(rd('en', 'schedule')).length).toBe(258);
  });

  it('legal: every he key except the language-neutral attribution line', () => {
    const missing = Object.keys(rd('he', 'legal')).filter((k) => !(k in rd('en', 'legal')));
    expect(missing).toEqual(Array.from(LEGAL_LANGUAGE_NEUTRAL));
    expect(Object.keys(rd('en', 'legal')).length).toBe(359);
  });

  it('both have 0 errors, no em dashes, no ASCII apostrophes', () => {
    expect(issues.filter((i) => ['schedule', 'legal'].includes(i.ns) && i.severity === 'error')).toEqual([]);
    for (const ns of ['schedule', 'legal']) for (const [k, v] of Object.entries(rd('en', ns))) {
      expect(v.includes('—'), `${ns}.${k}`).toBe(false);
      expect(v.includes("'"), `${ns}.${k}`).toBe(false);
    }
  });

  it('legal keeps company number, email, address and statute years exactly', () => {
    const all = Object.values(rd('en', 'legal')).join('\n');
    for (const needle of ['516841806', 'office@appout.co.il', '39 Har Zion Boulevard, Tel Aviv', '5775-2015', '5777-2017', '5718-1958']) expect(all).toContain(needle);
  });

  it('legacy dictionary: onboarding.health.* and onboarding.terms.title are translated', () => {
    const en = rd('en', 'legacy-dictionary');
    const keys = Object.keys(rd('he', 'legacy-dictionary')).filter((k) => k.startsWith('onboarding.health.') || k === 'onboarding.terms.title');
    expect(keys.length).toBe(11);
    for (const k of keys) expect(en[k], k).toBeTruthy();
  });
});
