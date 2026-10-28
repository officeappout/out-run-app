// @ts-nocheck -- standalone tsx script (scripts/ is not compiled with the app tsconfig target)
/**
 * Generic catalog validator for ANY locale (docs/i18n/ADD-LANGUAGE.md, phase 2).
 *
 *   npx tsx scripts/i18n/validate-catalog.ts --locale es                 # human report, exit 1 on errors
 *   npx tsx scripts/i18n/validate-catalog.ts --locale es --partial       # missing keys are fine (batches in progress)
 *   npx tsx scripts/i18n/validate-catalog.ts --locale es --ns home,map   # only these namespaces
 *   npx tsx scripts/i18n/validate-catalog.ts --locale es --json
 *
 * Checks (codes G*, all blocking unless marked warn):
 *   G1  key parity (target keys exist in he, in scope; missing keys unless --partial)
 *   G2  ICU parses with the locale
 *   G3  placeholders: every he placeholder kept (gender selects may collapse), none invented
 *   G4  plural categories from Intl.PluralRules(locale): only valid ones, all reachable ones present (ru: one/few/many/other)
 *   G5  non-gender selects keep their branches; G6 gender selects stay within female/male/other + other
 *   G7  rich tags identical; G8 no Hebrew characters; G10 no invented digits; G14 not equal to Hebrew (untranslated)
 *   G12 banned long dash "—" (error, warn when Hebrew has it); G19 zero-width / no-break space (profile.allowNbsp)
 *   G20 push `@token` placeholders kept byte for byte; G13 per-locale glossary lint from docs/i18n/<LOCALE>-GLOSSARY.md
 *   he-only hidden keys (COMMUNITY_HIDDEN, ONBOARDING_SKIPPED) are out of scope and must not be translated.
 * For `en` the English-only checks (V1-V19 of validate-en-catalog.ts) run as well, unchanged.
 */
import fs from 'fs';
import path from 'path';
import { IntlMessageFormat } from 'intl-messageformat';
import {
  COMMUNITY_HIDDEN, LANGUAGE_NEUTRAL, ONBOARDING_SKIPPED, PILOT_SCOPE,
  validateCatalog as validateEnCatalog, type Issue, type Severity,
} from './validate-en-catalog';

export type { Issue, Severity };

const TYPE = { literal: 0, argument: 1, number: 2, date: 3, time: 4, select: 5, plural: 6, pound: 7, tag: 8 } as const;
const HEBREW = /[֐-׿־׳״]/u;
const GENDER_BRANCHES = new Set(['female', 'male', 'other']);
const SAME_AS_HEBREW_OK = /^[\s\d.,:;/\-–+·×%#A-Za-z{}]*$/u;
const ZERO_WIDTH = /[​-‍⁠﻿]/;
const BIDI_MARKS = /[‎‏؜]/;
const NBSP = /[  ]/;

/** Namespaces never validated by default: legal text is an owner-only gate; legacy-* is the old dictionary. */
export const DEFAULT_SKIPPED_NS = (ns: string) => ns === 'legal' || ns.startsWith('legacy-');

export interface LocaleOptions {
  locale: string;
  /** Missing keys are not errors (batches in progress). */
  partial?: boolean;
  allowNbsp?: boolean;
  /** Directions: RTL locales may use bidi marks. */
  rtl?: boolean;
  /** Glossary lint rules (see parseGlossaryLint). */
  glossary?: GlossaryRules;
  /** Namespaces to validate. Default: every he namespace except legal / legacy-*; for `en` the pilot's PILOT_SCOPE namespaces. */
  namespaces?: string[];
}

export interface GlossaryRules {
  /** Hebrew trigger -> required target regex (warn when missing). */
  required: Array<{ he: RegExp; target: RegExp; label: string }>;
  /** Forbidden target regex (error). */
  forbidden: Array<{ target: RegExp; message: string }>;
}

interface Walked {
  args: Map<string, 'arg' | 'select' | 'plural' | 'other'>;
  selects: Map<string, string[]>;
  plurals: Map<string, { branches: string[]; ordinal: boolean }>;
  tags: string[];
  texts: string[];
}

function walk(els: any[], w: Walked): void {
  for (const el of els) {
    switch (el.type as number) {
      case TYPE.literal: w.texts.push(el.value); break;
      case TYPE.argument: if (!w.args.has(el.value)) w.args.set(el.value, 'arg'); break;
      case TYPE.number: case TYPE.date: case TYPE.time: if (!w.args.has(el.value)) w.args.set(el.value, 'other'); break;
      case TYPE.select:
        w.args.set(el.value, 'select');
        w.selects.set(el.value, Object.keys(el.options));
        for (const o of Object.values(el.options) as any[]) walk(o.value, w);
        break;
      case TYPE.plural:
        w.args.set(el.value, 'plural');
        w.plurals.set(el.value, { branches: Object.keys(el.options), ordinal: el.pluralType === 'ordinal' });
        for (const o of Object.values(el.options) as any[]) walk(o.value, w);
        break;
      case TYPE.tag: w.tags.push(el.value); walk(el.children, w); break;
      default: break;
    }
  }
}

function analyze(message: string, locale: string): Walked | Error {
  try {
    const ast = new IntlMessageFormat(message, locale, undefined, { ignoreTag: false }).getAst();
    const w: Walked = { args: new Map(), selects: new Map(), plurals: new Map(), tags: [], texts: [] };
    walk(ast, w);
    return w;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

const isGenderSelect = (name: string, branches: string[]) =>
  name === 'gender' || (branches.length > 0 && branches.every((b) => GENDER_BRANCHES.has(b)));
const numbers = (w: Walked) => (w.texts.join(' ').match(/\d+(?:[.,]\d+)*/g) ?? []).sort();

/**
 * Plural categories of a locale, split into the ones real integers reach (required) and the ones only
 * compact/decimal numbers reach (es/fr/pt "many": optional, warning when missing).
 */
export function pluralCategories(locale: string): { all: string[]; reachable: string[] } {
  const pr = new Intl.PluralRules(locale);
  const all = pr.resolvedOptions().pluralCategories as string[];
  const reachable = new Set<string>(['other']); // ICU always requires `other` (fractions in ru, pl, ...)
  for (let n = 0; n <= 1000; n++) reachable.add(pr.select(n));
  return { all, reachable: all.filter((c) => reachable.has(c)) };
}

/** Parses the fenced ```lint block of docs/i18n/<LOCALE>-GLOSSARY.md. Lines: `he-regex => target-regex => label`, `!! target-regex => message`, `#` comments. */
export function parseGlossaryLint(markdown: string): GlossaryRules {
  const rules: GlossaryRules = { required: [], forbidden: [] };
  const block = /```lint\n([\s\S]*?)```/g;
  for (let m = block.exec(markdown); m; m = block.exec(markdown)) {
    for (const raw of m[1]!.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('!!')) {
        const [target, message] = line.slice(2).split('=>').map((s) => s.trim());
        if (target) rules.forbidden.push({ target: new RegExp(target, 'iu'), message: message || target });
      } else {
        const [he, target, label] = line.split('=>').map((s) => s.trim());
        if (he && target) rules.required.push({ he: new RegExp(he, 'u'), target: new RegExp(target, 'iu'), label: label || target });
      }
    }
  }
  return rules;
}

export function loadGlossary(docsDir: string, locale: string): GlossaryRules | undefined {
  const file = path.join(docsDir, `${locale.toUpperCase()}-GLOSSARY.md`);
  return fs.existsSync(file) ? parseGlossaryLint(fs.readFileSync(file, 'utf8')) : undefined;
}

export interface ValidateInput {
  ns: string;
  he: Record<string, string>;
  target: Record<string, string>;
  inScope?: (key: string) => boolean;
  options: LocaleOptions;
}

export function validateLocaleCatalog({ ns, he, target, inScope = () => true, options }: ValidateInput): Issue[] {
  const { locale } = options;
  const issues: Issue[] = [];
  const add = (key: string, check: string, severity: Severity, message: string) => issues.push({ ns, key, check, severity, message });
  const cats = pluralCategories(locale);

  // G1 parity
  if (!options.partial) for (const k of Object.keys(he)) if (inScope(k) && !(k in target)) add(k, 'G1', 'error', `missing in ${locale}`);
  for (const k of Object.keys(target)) {
    if (!(k in he)) add(k, 'G1', 'error', 'key does not exist in he');
    else if (!inScope(k)) add(k, 'G1', 'error', 'key is out of scope (he-only surface or language-neutral): it must stay Hebrew via fallback');
  }

  for (const [key, msg] of Object.entries(target)) {
    const heMsg = he[key];
    if (typeof heMsg !== 'string') continue;
    if (typeof msg !== 'string' || msg === '') { add(key, 'G1', 'error', 'empty or non-string'); continue; }

    if (HEBREW.test(msg)) add(key, 'G8', 'error', 'Hebrew characters in the target');
    if (msg.includes('—')) add(key, 'G12', heMsg.includes('—') ? 'warn' : 'error', 'long dash "—" (owner rule: no long dash in copy)');
    if (ZERO_WIDTH.test(msg) || (!options.rtl && BIDI_MARKS.test(msg))) add(key, 'G19', 'error', 'zero-width or bidi mark character');
    if (NBSP.test(msg) && !options.allowNbsp) add(key, 'G19', 'error', 'no-break space (set allowNbsp in locale-profiles.ts if this language needs it)');
    if (msg === heMsg && !SAME_AS_HEBREW_OK.test(msg)) add(key, 'G14', 'error', 'identical to Hebrew (untranslated)');

    // G20 push @tokens
    for (const tok of heMsg.match(/@[\p{L}\p{N}_]+/gu) ?? []) if (!msg.includes(tok)) add(key, 'G20', 'error', `placeholder token ${tok} must be kept byte for byte`);

    const t = analyze(msg, locale);
    if (t instanceof Error) { add(key, 'G2', 'error', `does not parse: ${t.message}`); continue; }
    const h = analyze(heMsg, 'he');
    if (h instanceof Error) { add(key, 'G2', 'warn', 'Hebrew source does not parse; structural checks skipped'); continue; }

    // G3 placeholders
    const hGender = new Set([...h.selects].filter(([n, b]) => isGenderSelect(n, b)).map(([n]) => n));
    for (const n of h.args.keys()) if (!t.args.has(n) && !hGender.has(n)) add(key, 'G3', 'error', `placeholder {${n}} missing`);
    for (const n of t.args.keys()) if (!h.args.has(n)) add(key, 'G3', 'error', `placeholder {${n}} not in Hebrew`);

    // G4 plural categories (cardinal only)
    for (const [n, p] of t.plurals) {
      if (p.ordinal) continue;
      for (const b of p.branches) if (!b.startsWith('=') && !cats.all.includes(b)) add(key, 'G4', 'error', `plural {${n}} has category "${b}" which ${locale} does not use (uses ${cats.all.join('/')})`);
      for (const c of cats.all) {
        if (p.branches.includes(c)) continue;
        if (c === 'one' && p.branches.includes('=1')) { add(key, 'G4', 'warn', `plural {${n}} uses =1 instead of "one"`); continue; }
        add(key, 'G4', cats.reachable.includes(c) ? 'error' : 'warn', `plural {${n}} lacks "${c}" (${locale} needs ${cats.all.join('/')})`);
      }
    }
    for (const [n, hp] of h.plurals) {
      const tp = t.plurals.get(n);
      if (!tp) { add(key, 'G4', 'error', `plural {${n}} is not a plural in the target`); continue; }
      for (const b of hp.branches) if (b.startsWith('=') && !tp.branches.includes(b) && !(b === '=1' && tp.branches.includes('one'))) add(key, 'G4', 'error', `explicit branch ${b} dropped`);
    }

    // G5 / G6 selects
    for (const [n, hb] of h.selects) {
      if (isGenderSelect(n, hb)) continue;
      const tb = t.selects.get(n);
      if (!tb) { add(key, 'G5', 'error', `select {${n}} dropped (branches must be kept)`); continue; }
      if ([...hb].sort().join('|') !== [...tb].sort().join('|')) add(key, 'G5', 'error', `select {${n}} branches differ: he [${hb}] target [${tb}]`);
    }
    for (const [n, tb] of t.selects) {
      if (!h.selects.has(n)) { add(key, 'G5', 'error', `select {${n}} not in Hebrew`); continue; }
      if (isGenderSelect(n, h.selects.get(n)!) && (!tb.includes('other') || tb.some((b) => !GENDER_BRANCHES.has(b)))) add(key, 'G6', 'error', `gender select {${n}} must use female/male/other with other`);
    }

    // G7 tags, G10 digits
    if ([...new Set(h.tags)].sort().join(',') !== [...new Set(t.tags)].sort().join(',')) add(key, 'G7', 'error', `tags differ: he [${h.tags}] target [${t.tags}]`);
    if (/<(\w+)>\s|\s<\/\w+>/.test(msg)) add(key, 'G7', 'error', 'space just inside a rich tag');
    const hn = numbers(h);
    for (const d of numbers(t)) if (!hn.includes(d)) add(key, 'G10', 'error', `number ${d} not in Hebrew`);

    // G13 glossary
    for (const r of options.glossary?.required ?? []) if (r.he.test(heMsg) && !r.target.test(msg)) add(key, 'G13', 'warn', `Hebrew trigger ${r.he} but target lacks "${r.label}"`);
    for (const r of options.glossary?.forbidden ?? []) if (r.target.test(msg)) add(key, 'G13', 'error', r.message);
  }
  return issues;
}

export interface NsReport { ns: string; heKeys: number; targetKeys: number; scoped: number; errors: number; warnings: number }

const readJson = (file: string): Record<string, string> => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});

/** Default scope: the English pilot's (he-only surfaces hidden), every other namespace fully in scope. */
export function scopeFor(ns: string): (key: string) => boolean {
  return PILOT_SCOPE[ns] ?? (() => true);
}

export function validateLocale(messagesDir: string, options: LocaleOptions, only?: string[]): { issues: Issue[]; reports: NsReport[] } {
  const issues: Issue[] = [];
  const reports: NsReport[] = [];
  const names = fs.readdirSync(path.join(messagesDir, 'he')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).filter((n) => !DEFAULT_SKIPPED_NS(n)).sort();
  for (const ns of names) {
    if (only && !only.includes(ns)) continue;
    if (options.namespaces ? !options.namespaces.includes(ns) : options.locale === 'en' && !(ns in PILOT_SCOPE)) continue;
    const he = readJson(path.join(messagesDir, 'he', `${ns}.json`));
    const target = readJson(path.join(messagesDir, options.locale, `${ns}.json`));
    const inScope = scopeFor(ns);
    const found = validateLocaleCatalog({ ns, he, target, inScope, options });
    if (options.locale === 'en' && PILOT_SCOPE[ns]) found.push(...validateEnCatalog({ ns, he, en: target, inScope }));
    issues.push(...found);
    reports.push({
      ns, heKeys: Object.keys(he).length, targetKeys: Object.keys(target).length,
      scoped: Object.keys(he).filter(inScope).length,
      errors: found.filter((i) => i.severity === 'error').length,
      warnings: found.filter((i) => i.severity === 'warn').length,
    });
  }
  return { issues, reports };
}

export { COMMUNITY_HIDDEN, LANGUAGE_NEUTRAL, ONBOARDING_SKIPPED };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /validate-catalog\.ts$/.test(process.argv[1])) {
  const locale = arg('--locale');
  if (!locale) { console.error('usage: validate-catalog.ts --locale <xx> [--partial] [--ns a,b] [--json]'); process.exit(2); }
  const root = path.resolve(__dirname, '../..');
  const rtl = ['he', 'ar', 'fa', 'ur'].includes(locale);
  const { issues, reports } = validateLocale(
    path.join(root, 'src/messages'),
    { locale, partial: process.argv.includes('--partial'), allowNbsp: process.argv.includes('--allow-nbsp'), rtl, glossary: loadGlossary(path.join(root, 'docs/i18n'), locale) },
    arg('--ns')?.split(','),
  );
  if (process.argv.includes('--json')) console.log(JSON.stringify({ reports, issues }, null, 2));
  else {
    for (const r of reports) console.log(`${r.ns}: ${locale} ${r.targetKeys}/${r.scoped} in-scope keys (he ${r.heKeys}) errors=${r.errors} warnings=${r.warnings}`);
    for (const i of issues) console.log(`${i.severity.toUpperCase()} ${i.check} ${i.ns}:${i.key}  ${i.message}`);
    const errs = issues.filter((i) => i.severity === 'error').length;
    console.log(`TOTAL ${reports.reduce((a, r) => a + r.targetKeys, 0)} keys, ${errs} errors, ${issues.length - errs} warnings`);
  }
  process.exit(issues.some((i) => i.severity === 'error') ? 1 : 0);
}
