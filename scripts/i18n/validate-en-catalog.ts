/**
 * English catalog validator (docs/i18n/EN-PILOT-PLAN.md §4, checks V1-V14).
 * Pure Node + the ICU parser the runtime uses (@formatjs/icu-messageformat-parser, the parser
 * inside intl-messageformat). No tsc, no network.
 *
 *   npx tsx scripts/i18n/validate-en-catalog.ts          # human report, exit 1 on errors
 *   npx tsx scripts/i18n/validate-en-catalog.ts --json   # machine report
 *
 * Errors (V1-V10, V14) block; warnings (V11-V13 and notes) are listed.
 */
import fs from 'fs';
import path from 'path';
import { IntlMessageFormat } from 'intl-messageformat';

// ICU AST node types (stable numeric enum of the parser bundled inside intl-messageformat, a declared dependency).
type MessageFormatElement = ReturnType<IntlMessageFormat['getAst']>[number];
const TYPE = { literal: 0, argument: 1, number: 2, date: 3, time: 4, select: 5, plural: 6, pound: 7, tag: 8 } as const;

export type Severity = 'error' | 'warn';
export interface Issue { ns: string; key: string; check: string; severity: Severity; message: string }

/** Pilot scope (EN-PILOT-PLAN §2): every key of common and pages, the settings.* keys of home. */
export const PILOT_SCOPE: Record<string, (key: string) => boolean> = {
  common: () => true,
  pages: () => true,
  home: (k) => k.startsWith('settings.'),
};

/** Strings that may equal the Hebrew (do-not-translate items). */
const SAME_AS_HEBREW_OK = /^[\s\d.,:;/\-+·×%#A-Za-z]*$/u; // only latin/digits/punctuation (brand words, XP...)
const HEBREW = /[֐-׿־׳״]/u;
const GENDER_BRANCHES = new Set(['female', 'male', 'other']);
const BANNED = [
  'amazing', 'awesome', 'epic', 'crush it', 'smash', 'beast mode', 'unleash', 'supercharge', 'game-changer',
  'transform your body', 'revolutionary', 'no excuses', 'lazy', 'simply', 'easily', 'basically', 'please note',
  'yalla', 'sababa', 'deload', 'rpe', 'hypertrophy', 'ai-powered',
];

interface Walked {
  args: Map<string, 'arg' | 'select' | 'plural' | 'other'>;
  selects: Map<string, string[]>; // arg -> branch keys
  plurals: Map<string, string[]>;
  tags: string[];
  texts: string[];
}

function walk(els: any[], w: Walked): void {
  for (const el of els as any[]) {
    switch (el.type as number) {
      case TYPE.literal: w.texts.push(el.value); break;
      case TYPE.argument: if (!w.args.has(el.value)) w.args.set(el.value, 'arg'); break;
      case TYPE.number: case TYPE.date: case TYPE.time: if (!w.args.has(el.value)) w.args.set(el.value, 'other'); break;
      case TYPE.select:
        w.args.set(el.value, 'select');
        w.selects.set(el.value, Object.keys(el.options));
        for (const o of Object.values(el.options)) walk(o.value, w);
        break;
      case TYPE.plural:
        w.args.set(el.value, 'plural');
        w.plurals.set(el.value, Object.keys(el.options));
        for (const o of Object.values(el.options)) walk(o.value, w);
        break;
      case TYPE.tag: w.tags.push(el.value); walk(el.children, w); break;
      default: break;
    }
  }
}

function analyze(message: string): Walked | Error {
  try {
    const ast = new IntlMessageFormat(message, 'en', undefined, { ignoreTag: false }).getAst();
    const w: Walked = { args: new Map(), selects: new Map(), plurals: new Map(), tags: [], texts: [] };
    walk(ast, w);
    return w;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

const isGenderSelect = (name: string, branches: string[]) =>
  name === 'gender' || (branches.length > 0 && branches.every((b) => GENDER_BRANCHES.has(b)));

const capFor = (key: string): number | null => {
  if (/\.(cta|button)$|^actions\./.test(key)) return 24;
  if (/\.(chip|tab)\./.test(key)) return 16;
  if (/\.title$/.test(key)) return 32;
  if (/(Sub|\.sub|\.hint|\.helper)$/.test(key)) return 60;
  if (/(toast|error)\./.test(key)) return 90;
  return null;
};

const numbers = (s: string) => (s.replace(/\{[^}]*\}/g, '').match(/\d+(?:[.,]\d+)*/g) ?? []).sort();

export interface ValidateInput {
  ns: string;
  he: Record<string, string>;
  en: Record<string, string>;
  inScope?: (key: string) => boolean;
}

export function validateCatalog({ ns, he, en, inScope = () => true }: ValidateInput): Issue[] {
  const issues: Issue[] = [];
  const add = (key: string, check: string, severity: Severity, message: string) =>
    issues.push({ ns, key, check, severity, message });

  // V1 key parity (en must be exactly the in-scope Hebrew keys)
  for (const k of Object.keys(he)) if (inScope(k) && !(k in en)) add(k, 'V1', 'error', 'missing in en');
  for (const k of Object.keys(en)) {
    if (!(k in he)) add(k, 'V1', 'error', 'key does not exist in he');
    else if (!inScope(k)) add(k, 'V1', 'error', 'key is outside the pilot scope (must stay Hebrew via fallback)');
  }

  for (const [key, enMsg] of Object.entries(en)) {
    const heMsg = he[key];
    if (typeof heMsg !== 'string') continue;
    if (typeof enMsg !== 'string' || enMsg === '') { add(key, 'V1', 'error', 'empty or non-string'); continue; }

    // V8 no Hebrew, V9 apostrophes
    if (HEBREW.test(enMsg)) add(key, 'V8', 'error', 'Hebrew characters in English');
    if (enMsg.includes("'")) add(key, 'V9', 'error', "ASCII apostrophe ' (use the typographic ’)");

    // V2 parseable
    const e = analyze(enMsg);
    if (e instanceof Error) { add(key, 'V2', 'error', `does not parse: ${e.message}`); continue; }
    const h = analyze(heMsg);
    if (h instanceof Error) { add(key, 'V2', 'warn', 'Hebrew source does not parse; skipped structural checks'); continue; }

    // V3 placeholders
    const hGender = new Set([...h.selects].filter(([n, b]) => isGenderSelect(n, b)).map(([n]) => n));
    for (const n of h.args.keys()) if (!e.args.has(n) && !hGender.has(n)) add(key, 'V3', 'error', `placeholder {${n}} missing in en`);
    for (const n of e.args.keys()) if (!h.args.has(n)) add(key, 'V3', 'error', `placeholder {${n}} not in Hebrew`);

    // V4 plurals
    for (const [n, hb] of h.plurals) {
      const eb = e.plurals.get(n);
      if (!eb) { add(key, 'V4', 'error', `plural {${n}} is not a plural in en`); continue; }
      for (const b of eb) if (['zero', 'two', 'few', 'many'].includes(b)) add(key, 'V4', 'error', `English plural has category "${b}"`);
      for (const b of hb) if (b.startsWith('=') && !eb.includes(b)) add(key, 'V4', 'error', `explicit branch ${b} dropped`);
    }
    for (const n of e.plurals.keys()) if (!h.plurals.has(n)) add(key, 'V4', 'warn', `plural {${n}} added in en (Hebrew has none)`);

    // V5 non-gender selects
    for (const [n, hb] of h.selects) {
      if (isGenderSelect(n, hb)) continue;
      const eb = e.selects.get(n);
      if (!eb) { add(key, 'V5', 'error', `select {${n}} dropped in en (branches must be kept)`); continue; }
      if ([...hb].sort().join('|') !== [...eb].sort().join('|')) add(key, 'V5', 'error', `select {${n}} branches differ: he [${hb}] en [${eb}]`);
    }
    for (const [n, eb] of e.selects) if (!h.selects.has(n)) add(key, 'V5', 'error', `select {${n}} not in Hebrew (${eb})`);

    // V6 gender selects kept in en
    for (const [n, eb] of e.selects) {
      if (!isGenderSelect(n, h.selects.get(n) ?? eb)) continue;
      if (!eb.includes('other') || eb.some((b) => !GENDER_BRANCHES.has(b))) add(key, 'V6', 'error', `gender select {${n}} branches must be within female/male/other with other`);
      else add(key, 'V6', 'warn', `gender select {${n}} kept in English: confirm English really differs`);
    }
    if (/\b(he\/she|she\/he|s\/he|\(s\)he|his\/her|him\/her)\b/i.test(enMsg)) add(key, 'V6', 'error', 'gendered slash form');

    // V7 rich tags
    if ([...h.tags].sort().join(',') !== [...e.tags].sort().join(',')) add(key, 'V7', 'error', `tags differ: he [${h.tags}] en [${e.tags}]`);

    // V10 stray digits
    const hn = numbers(heMsg);
    for (const d of numbers(enMsg)) if (!hn.includes(d)) add(key, 'V10', 'error', `number ${d} not in Hebrew`);

    // V11 length (warning)
    const cap = capFor(key);
    const visible = enMsg.replace(/\{[^}]*\}|<[^>]*>/g, '');
    if (cap && visible.length > cap) add(key, 'V11', 'warn', `${visible.length} chars > cap ${cap}`);

    // V12 policy lint
    if ((enMsg.match(/!/g) ?? []).length > 1) add(key, 'V12', 'warn', 'more than one "!"');
    if (enMsg.includes('—') && !heMsg.includes('—') ) add(key, 'V12', 'warn', 'em dash');
    else if (enMsg.includes('—')) add(key, 'V12', 'warn', 'em dash (kept from hand-written / source)');
    if (/ {2,}/.test(enMsg)) add(key, 'V12', 'warn', 'double space');
    if (/^\s/.test(heMsg) !== /^\s/.test(enMsg) || /\s$/.test(heMsg) !== /\s$/.test(enMsg)) add(key, 'V12', 'warn', 'leading/trailing space differs from Hebrew');
    const lower = enMsg.toLowerCase();
    for (const b of BANNED) if (new RegExp(`\\b${b.replace(/[-]/g, '\\-')}\\b`).test(lower)) add(key, 'V12', 'warn', `banned word "${b}"`);

    // V13 glossary lint (Hebrew trigger -> required English term)
    const GLOSS: Array<[RegExp, RegExp, string]> = [
      [/גינ(ת|ות) כושר/, /outdoor gym|calisthenics park/i, 'outdoor gym / calisthenics park'],
      [/רצף/, /streak/i, 'streak'],
      [/הורדת עומס/, /lighter week/i, 'lighter week'],
      [/מבדק/, /quick test/i, 'quick test'],
      [/אווטיר/, /avatar/i, 'avatar'],
      [/(^|[\s"(])[הבלמו]?(עירייה|רשות)(?![א-ת])/, /municipalit|city hall/i, 'municipality'],
      [/מגן/, /shield/i, 'shield'],
    ];
    for (const [he_, en_, term] of GLOSS) if (he_.test(heMsg) && !en_.test(enMsg)) add(key, 'V13', 'warn', `Hebrew trigger ${he_} but English lacks "${term}"`);
    if (/fitness park/i.test(enMsg)) add(key, 'V13', 'error', '"fitness park" is not the approved term (outdoor gym / calisthenics park)');

    // V14 untranslated
    if (enMsg === heMsg && !SAME_AS_HEBREW_OK.test(enMsg)) add(key, 'V14', 'error', 'English equals Hebrew');
  }
  return issues;
}

export interface NsReport { ns: string; heKeys: number; enKeys: number; scoped: number; errors: number; warnings: number }

export function validateAll(messagesDir: string): { issues: Issue[]; reports: NsReport[] } {
  const issues: Issue[] = [];
  const reports: NsReport[] = [];
  for (const [ns, inScope] of Object.entries(PILOT_SCOPE)) {
    const he = JSON.parse(fs.readFileSync(path.join(messagesDir, 'he', `${ns}.json`), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.join(messagesDir, 'en', `${ns}.json`), 'utf8'));
    const found = validateCatalog({ ns, he, en, inScope });
    issues.push(...found);
    reports.push({
      ns, heKeys: Object.keys(he).length, enKeys: Object.keys(en).length,
      scoped: Object.keys(he).filter(inScope).length,
      errors: found.filter((i) => i.severity === 'error').length,
      warnings: found.filter((i) => i.severity === 'warn').length,
    });
  }
  return { issues, reports };
}

if (process.argv[1] && /validate-en-catalog\.ts$/.test(process.argv[1])) {
  const { issues, reports } = validateAll(path.resolve(__dirname, '../../src/messages'));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ reports, issues }, null, 2));
  else {
    for (const r of reports) console.log(`${r.ns}: en ${r.enKeys}/${r.scoped} pilot keys (he ${r.heKeys}) errors=${r.errors} warnings=${r.warnings}`);
    for (const i of issues) console.log(`${i.severity.toUpperCase()} ${i.check} ${i.ns}:${i.key}  ${i.message}`);
    const total = reports.reduce((a, r) => a + r.enKeys, 0);
    const errs = issues.filter((i) => i.severity === 'error').length;
    console.log(`TOTAL ${total} keys, ${errs} errors, ${issues.length - errs} warnings`);
  }
  process.exit(issues.some((i) => i.severity === 'error') ? 1 : 0);
}
