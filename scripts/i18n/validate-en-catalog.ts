// @ts-nocheck -- standalone tsx script (scripts/ is not compiled with the app tsconfig target)
/**
 * English catalog validator (docs/i18n/EN-PILOT-PLAN.md §4, checks V1-V14, V16).
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

/**
 * Batch 2 (onboarding): keys deliberately left Hebrew (they fall back per key). Reasons:
 * persona step (composed sentences needing articles; the component hard-codes English today; term pending),
 * identity.gender.* (the Hebrew asks "how should we address you", meaning changes in English),
 * hierarchy.* / unitDeclaration.* / personaDrawer.staleUnit (military unit picker, hidden by owner decision),
 * healthDeclaration.* and health.* (the whole health-declaration step stays Hebrew until a legal / medical translation, so one screen never mixes languages), goalNote examples about enlistment and reserve duty.
 */
export const ONBOARDING_SKIPPED = new RegExp(
  '^(steps\\.persona\\.(?!code\\.)|steps\\.processing\\.(persona|personaGendered|msg\\.building)$|identity\\.gender\\.|hierarchy\\.|unitDeclaration\\.|personaDrawer\\.staleUnit$|healthDeclaration\\.|health\\.|goalNote\\.example\\.(a18_29\\.(3|4)|a30_44\\.1)$)',
);

/** Pilot scope (EN-PILOT-PLAN §2): every key of common, pages, home (batch 4) and profile (batch 4). */
export const PILOT_SCOPE: Record<string, (key: string) => boolean> = {
  common: () => true,
  pages: () => true,
  home: () => true,
  onboarding: (k) => !ONBOARDING_SKIPPED.test(k),
  player: (k) => !LANGUAGE_NEUTRAL.player.has(k),
  summary: (k) => !LANGUAGE_NEUTRAL.summary.has(k),
  profile: () => true,
  social: () => true,
  together: () => true,
  community: (k) => !COMMUNITY_HIDDEN.has(k),
  map: () => true,
  library: () => true,
  coach: () => true,
  wide: () => true,
  push: () => true,
  schedule: () => true,
  legal: (k) => !LEGAL_LANGUAGE_NEUTRAL.has(k),
};

/** Batch 6 (community): military wording hidden from English users (owner decision 12); these 9 keys stay Hebrew via fallback. */
export const COMMUNITY_HIDDEN = new Set([
  'group.location.military', 'leagues.units.range.myBattalionCompanies', 'leagues.units.range.myBrigadeBattalions',
  'leagues.units.range.allCompanies', 'leagues.units.range.allBrigades', 'communityPage.leagues.v2.tab.units',
  'communityPage.reserve.scopeLabel', 'communityPage.cards.reserve', 'arenaCreate.card.military.label',
]);

/**
 * Batch 3 keys that are identical in Hebrew and English (protocol names, symbol-only joiners, brand tokens):
 * they stay out of the en catalogs on purpose (the Hebrew value is already correct for English).
 */
export const LANGUAGE_NEUTRAL: Record<'player' | 'summary', Set<string>> = {
  player: new Set([
    'strengthSummary.protocol.emom', 'strengthSummary.protocol.amrap', 'strengthPlayer.timed.list.queueSuffix',
    'timedLabels.title.minutes', 'timedLabels.target.text', 'timedLabels.eyebrow.prefixed',
    'timedLabels.ready.emomWithTarget', 'timedLabels.mini.line', 'timedLabels.playlist.doneDetail',
    'hybrid.v2.header.titleOf',
  ]),
  summary: new Set(['identity.xp']),
};


/** Legal: Hebrew-calendar years of Israeli statutes (the Hebrew writes them in letters: תשע"ה, תשע"ז, תשי"ח), digits in English. */
export const HEBREW_CALENDAR_YEARS = new Set(['5775', '5777', '5718']);

/** Legal: Hebrew value is already the English attribution string (stays out of en, falls back to the identical Hebrew). */
export const LEGAL_LANGUAGE_NEUTRAL = new Set(['credits.osm.attribution']);

/** Text outside any `{arg, plural, …}` block: nouns inside a plural branch are already governed by that plural. */
function outsidePlurals(msg: string): string {
  let out = '';
  let i = 0;
  while (i < msg.length) {
    const m = /\{\w+, plural,/y;
    m.lastIndex = i;
    if (m.test(msg)) {
      let depth = 0;
      let j = i;
      for (; j < msg.length; j++) {
        if (msg[j] === '{') depth++;
        else if (msg[j] === '}') { depth--; if (depth === 0) { j++; break; } }
      }
      out += '\u0000';
      i = j;
    } else {
      out += msg[i++];
    }
  }
  return out;
}

/** Select branch labels removed (`{kind, select, workout {Cycling} other {Run}}` -> `\u0000Cycling\u0000Run\u0000`), so a label is never read as a noun. */
function withoutSelectLabels(msg: string): string {
  const head = /\{\w+, select,/g;
  let out = '';
  let i = 0;
  for (let m = head.exec(msg); m; m = head.exec(msg)) {
    if (m.index < i) continue;
    out += msg.slice(i, m.index);
    let j = m.index + m[0].length;
    for (;;) {
      while (j < msg.length && /\s/.test(msg[j])) j++;
      if (msg[j] === '}') { j++; break; }
      const label = /^[=\w]+/.exec(msg.slice(j));
      if (!label) break;
      j += label[0].length;
      while (j < msg.length && /\s/.test(msg[j])) j++;
      if (msg[j] !== '{') break;
      let depth = 0;
      const start = j;
      for (; j < msg.length; j++) {
        if (msg[j] === '{') depth++;
        else if (msg[j] === '}') { depth--; if (depth === 0) { j++; break; } }
      }
      out += '\u0000' + withoutSelectLabels(msg.slice(start + 1, j - 1));
    }
    out += '\u0000';
    i = j;
    head.lastIndex = j;
  }
  return out + msg.slice(i);
}

/** Keys where a count noun sits inside a select branch that is only reached for n > 1 (select 1 / other). */
export { withoutSelectLabels };
export const COUNT_NOUN_EXEMPT = new Set(['timedLabels.info.amrap.line2']);

/** Strings that may equal the Hebrew (do-not-translate items). */
const SAME_AS_HEBREW_OK = /^[\s\d.,:;/\-–+·×%#A-Za-z{}]*$/u; // only latin/digits/punctuation (brand words, XP...)
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
  bare: string[]; // {arg} + countable noun outside any plural
}

const COUNTABLE = /^\s*(?:reps?|sets?|rounds?|exercises?|blocks?|laps?|minutes?|seconds?|steps?|stars?|people|persons?|calories|intervals?|items?|loops?|routes?|participants?)\b/i;

function walk(els: any[], w: Walked, inPlural = false): void {
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!inPlural && (el.type as number) === TYPE.argument) {
      const next = els[i + 1];
      if (next && next.type === TYPE.literal) {
        const m = (next.value as string).match(COUNTABLE);
        if (m) w.bare.push(`{${el.value}}${m[0]}`);
      }
    }
    switch (el.type as number) {
      case TYPE.literal: w.texts.push(el.value); break;
      case TYPE.argument: if (!w.args.has(el.value)) w.args.set(el.value, 'arg'); break;
      case TYPE.number: case TYPE.date: case TYPE.time: if (!w.args.has(el.value)) w.args.set(el.value, 'other'); break;
      case TYPE.select:
        w.args.set(el.value, 'select');
        w.selects.set(el.value, Object.keys(el.options));
        for (const o of Object.values(el.options)) walk(o.value, w, true); // a select with a count key (1 / other) is the Hebrew-style plural
        break;
      case TYPE.plural:
        w.args.set(el.value, 'plural');
        w.plurals.set(el.value, Object.keys(el.options));
        for (const o of Object.values(el.options)) walk(o.value, w, true);
        break;
      case TYPE.tag: w.tags.push(el.value); walk(el.children, w, inPlural); break;
      default: break;
    }
  }
}

function analyze(message: string): Walked | Error {
  try {
    const ast = new IntlMessageFormat(message, 'en', undefined, { ignoreTag: false }).getAst();
    const w: Walked = { args: new Map(), selects: new Map(), plurals: new Map(), tags: [], texts: [], bare: [] };
    walk(ast, w);
    return w;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

const isGenderSelect = (name: string, branches: string[]) =>
  name === 'gender' || (branches.length > 0 && branches.every((b) => GENDER_BRANCHES.has(b)));

const capFor = (key: string, ns = ''): number | null => {
  if (ns === 'push') return /\.title$/.test(key) ? 40 : /\.body$/.test(key) ? 110 : null; // push titles <= ~40, bodies <= ~110
  if (/\.(cta|button)$|^actions\./.test(key)) return 24;
  if (/\.(chip|tab)\./.test(key)) return 16;
  if (/\.title$/.test(key)) return 32;
  if (/(Sub|\.sub|\.hint|\.helper)$/.test(key)) return 60;
  if (/(toast|error)\./.test(key)) return 90;
  return null;
};

const numbers = (w: Walked) => (w.texts.join(' ').match(/\d+(?:[.,]\d+)*/g) ?? []).sort();

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
    // push copy keeps the Hebrew @tags (@שם, @שעה ...): they are variable keys the senders substitute, not words
    const forHebrewCheck = ns === 'push' ? enMsg.replace(/@[\u0590-\u05FF_]+/g, '') : enMsg;
    if (HEBREW.test(forHebrewCheck)) add(key, 'V8', 'error', 'Hebrew characters in English');
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
      for (const b of hb) if (b.startsWith('=') && !eb.includes(b) && !(b === '=1' && eb.includes('one'))) add(key, 'V4', 'error', `explicit branch ${b} dropped`);
    }
    // V16 every English plural has one (or =1) and other
    for (const [n, eb] of e.plurals) {
      if (!eb.includes('one') && !eb.includes('=1')) add(key, 'V16', 'error', `English plural {${n}} lacks "one" (or =1)`);
      if (!eb.includes('other')) add(key, 'V16', 'error', `English plural {${n}} lacks "other"`);
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
    if ([...new Set(h.tags)].sort().join(',') !== [...new Set(e.tags)].sort().join(',')) add(key, 'V7', 'error', `tags differ: he [${h.tags}] en [${e.tags}]`);

    // V10 stray digits
    const hn = numbers(h);
    for (const d of numbers(e)) if (!hn.includes(d) && !(ns === 'legal' && HEBREW_CALENDAR_YEARS.has(d))) add(key, 'V10', 'error', `number ${d} not in Hebrew`);

    // V11 length (warning)
    const cap = capFor(key, ns);
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
      [/הורדת עומס|שבוע קל/, /lighter week/i, 'lighter week'],
      [/מבדק/, /quick test/i, 'quick test'],
      [/אווטיר/, /avatar/i, 'avatar'],
      [/(^|[\s"(])[הבלמו]?(עירייה|רשות)(?![א-ת])/, /municipalit|city hall/i, 'municipality'],
      [/מגן/, /shield/i, 'shield'],
    ];
    for (const [he_, en_, term] of GLOSS) if (he_.test(heMsg) && !en_.test(enMsg)) add(key, 'V13', 'warn', `Hebrew trigger ${he_} but English lacks "${term}"`);
    if (/fitness park/i.test(enMsg)) add(key, 'V13', 'error', '"fitness park" is not the approved term (outdoor gym / calisthenics park)');

    // V15 a count/number interpolated next to a noun must be an ICU plural (one/other), not "{n} workouts"
    const flat = outsidePlurals(enMsg);
    const COUNT_NOUN = /\{\w+(?:, number)?\}\s+(minutes?|weeks?|days?|hours?|runs?|walks?|steps?|workouts?|exercises?|stations?|stops?|members?|sessions?|questions?|reps|sets|users|people|friends|points?|kudos)\b/i;
    const flatNoLabels = withoutSelectLabels(flat);
    const cm = COUNT_NOUN.exec(flatNoLabels);
    const cmArg = cm && /^\{(\w+)/.exec(cm[0])![1];
    if (cm && !e.plurals.has(cmArg!) && !COUNT_NOUN_EXEMPT.has(key)) add(key, 'V15', 'error', `count next to a noun without an ICU plural: ${cm[0]}`);
    for (const [n, eb] of e.plurals) {
      if (!eb.includes('other')) add(key, 'V15', 'error', `plural {${n}} has no "other"`);
      // English needs a real `one` branch: `=1` + `other` is not accepted (no allowlist; the former =1 keys were converted)
      if (!eb.includes('one')) add(key, 'V15', 'error', `plural {${n}} has no "one" branch (use one/other, not =1)`);
    }
    // V18 a {placeholder} followed by a plain word, outside a plural: error for count nouns, warning for any other lowercase word
    const AFTER = /\{(\w+)(?:, number)?\}\s+([a-z]+)/g;
    const UNIT_OK = new Set(['min', 'km', 'kg', 'm', 'sec', 'cal', 'kcal', 'xp', 'and', 'or', 'of', 'to', 'in', 'at', 'on', 'for', 'a', 'the', 'is', 'are', 'has', 'have', 'was', 'will', 'you', 'your', 'per', 'by', 'from', 'with', 'out', 'more', 'left', 'ago', 'later', 'today', 'tomorrow']);
    const COUNT_NOUNS = /^(times|routes?|items?|days?|minutes?|hours?|weeks?|runs?|walks?|steps?|workouts?|exercises?|sets?|reps?|people|members?|users?|friends?)$/;
    const noLabels = /, select,/.test(flat) ? flat.replace(/\}\s+\w+\s+\{/g, '}{') : flat; // drop select branch labels: `{push} pull {pull}`
    for (const m of noLabels.matchAll(AFTER)) {
      const [, arg, word] = m;
      const w = word!;
      if (e.plurals.has(arg!) || UNIT_OK.has(w) || COUNT_NOUN_EXEMPT.has(key)) continue;
      if (COUNT_NOUNS.test(w)) add(key, 'V18', 'error', `{${arg}} ${w}: count next to a noun without a plural`);
      else add(key, 'V18', 'warn', `{${arg}} ${w}: placeholder next to a word, check it needs a plural`);
    }
    // V19 no zero-width characters and no non-breaking space
    if (/[\u200B-\u200F\u2060\uFEFF\u00A0\u202F]/.test(enMsg)) add(key, 'V19', 'error', 'zero-width character or non-breaking space');
    // V16 no spaces just inside a rich tag
    if (/<(\w+)>\s|\s<\/\w+>/.test(enMsg)) add(key, 'V16', 'error', 'space inside a rich tag (<b> text </b>)');
    // V17 Sign in / Sign out, never "log"
    if (/\blog(ged)?[ -]?(in|out|into)\b/i.test(enMsg)) add(key, 'V17', 'error', 'use "Sign in" / "Sign out", never "log in/out"');

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
