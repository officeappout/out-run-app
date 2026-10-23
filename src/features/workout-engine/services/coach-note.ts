/**
 * Coach Note ("דגשי האימון") — 2–4 short Hebrew sentences rendered from a
 * DecisionRecord (decision-record.ts):
 *
 *   1–2. why this combination (the top 1–2 ranked reasons)
 *   2–3. what to expect: exercises + minutes, plus ONE of sets × reps / rest
 *        (then an optional protocol line)
 *   opt. a calm line for evening / night / recovery
 *
 * Voice rules (brand): short, simple, no jargon, no English, no em-dashes, no
 * emoji, gender-neutral (impersonal / plural, "בנינו לך"). Every number in
 * the text comes from the record — templates never invent a fact.
 *
 * Phrases live in ONE table (DEFAULT_COACH_PHRASEBOOK) with 2–3 variants per
 * key, picked deterministically from the record's seed so the same workout
 * always reads the same way while different workouts read differently.
 * `renderCoachNote(record, { phrasebook })` accepts a partial override — the
 * seam for admin-editable rows later (load rows → pass them in); no admin UI
 * exists yet.
 */

import type { DecisionReason, DecisionRecord, NumRange } from './decision-record';
import { stableHash } from './decision-record';
import { getCatalog } from '@/lib/i18n/catalogs';
import { lookupMessage } from '@/lib/i18n/core/i18n-core';
import { formatIcu } from '@/lib/i18n/core/icu';
import { SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';
import { makeT } from '@/lib/i18n/t';
import { coach } from '@/messages/ns/coach';

// ============================================================================
// PHRASEBOOK
// ============================================================================
// The phrases live in the `coach` catalog (src/messages/he/coach.json): `note.phrase.<KEY>.<n>` (n = 1..variants),
// `note.domain.*` / `note.program.*` / `note.locIn.*` (names), `note.fmt.*` (numbers). No Hebrew in this file.
// The engine stays pure: no React, no Firebase. The catalog is read synchronously through the i18n core
// (Hebrew is bundled statically; another locale falls back to Hebrew until its catalog is loaded).

export const COACH_PHRASE_KEYS = [
  'RECOVERY_DAY',
  'RETURNING',
  'DELOAD_WEEK',
  'PEAK_WEEK',
  'BUILD_WEEK',
  'WEEKLY_GAP',
  'SKILL_FOCUS',
  'PROGRAM_FOCUS',
  'WEATHER_RAIN',
  'WEATHER_HEAT',
  'WEATHER_COLD',
  'WEATHER_UV',
  'LOCATION_bodyweight',
  'LOCATION_equipment',
  'TIME_morning',
  'TIME_evening',
  'TIME_night',
  'DIFFICULTY_easy',
  'DIFFICULTY_balanced',
  'DIFFICULTY_intense',
  'LEVEL_CEILING',
  'MUSCLES_RESTED',
  'EXPECT_volume',
  'EXPECT_rest',
  'EXPECT_short',
  'PROTOCOL_pyramid',
  'PROTOCOL_antagonist',
  'PROTOCOL_superset',
  'PROTOCOL_emom',
  'PROTOCOL_tabata',
  'CALM_evening',
  'CALM_night',
  'CALM_recovery',
] as const;

export type CoachPhraseKey = (typeof COACH_PHRASE_KEYS)[number];

/** Admin-editable later: same keys, same {placeholders}, any number of variants. */
export type CoachPhrasebook = Partial<Record<CoachPhraseKey, string[]>>;

const catalogFor = (locale: string) => getCatalog(locale, coach.name);

/** The raw catalog message for `key` along the locale fallback chain, or undefined when it exists nowhere. */
function rawMessage(locale: string, key: string): string | undefined {
  const hit = lookupMessage(catalogFor, locale, key);
  return hit.found ? hit.message : undefined;
}

/** The phrasebook of one locale: the catalog's `note.phrase.<KEY>.<n>` variants, in order. */
export function coachPhrasebookFor(locale: string = SOURCE_LOCALE): Record<CoachPhraseKey, string[]> {
  const book = {} as Record<CoachPhraseKey, string[]>;
  for (const key of COACH_PHRASE_KEYS) {
    const variants: string[] = [];
    for (let n = 1; ; n++) {
      const msg = rawMessage(locale, `note.phrase.${key}.${n}`);
      if (msg === undefined) break;
      variants.push(msg);
    }
    book[key] = variants;
  }
  return book;
}

export const DEFAULT_COACH_PHRASEBOOK: Record<CoachPhraseKey, string[]> = coachPhrasebookFor(SOURCE_LOCALE);

// ============================================================================
// NAMES (slug → display). Unknown slug ⇒ the sentence is dropped,
// never shown in English.
// ============================================================================

/** The Hebrew name rows of the catalog under `prefix` (`note.domain.` → { push: 'דחיפה', … }). */
function nameTable(prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(coach.he)) if (key.startsWith(prefix)) out[key.slice(prefix.length)] = text;
  return out;
}

/** Hebrew skill / domain names. Data for other consumers (Kelly context, content matching) — source: coach catalog. */
export const DOMAIN_NAME_HE: Record<string, string> = nameTable('note.domain.');

/** Hebrew program names (the domains plus the full-body / upper / lower templates). */
export const PROGRAM_NAME_HE: Record<string, string> = {
  ...DOMAIN_NAME_HE,
  ...nameTable('note.program.'),
};

const domainName = (locale: string, slug: string) => rawMessage(locale, `note.domain.${slug}`);
const programName = (locale: string, slug: string) => rawMessage(locale, `note.program.${slug}`) ?? domainName(locale, slug);
const locationIn = (locale: string, loc: string) => rawMessage(locale, `note.locIn.${loc}`);

// ============================================================================
// FORMATTING
// ============================================================================

type CoachT = ReturnType<typeof makeT<typeof coach>>;
const defaultT = (): CoachT => makeT(SOURCE_LOCALE, coach);

function fmtRange(t: CoachT, r: NumRange): string {
  return r.min === r.max ? `${r.min}` : t('note.fmt.range', { min: String(r.min), max: String(r.max) });
}

/** One value when the range is narrow (spread ≤ `narrow`), else the range as is. */
function collapse(r: NumRange, narrow: number, step = 1): NumRange {
  if (r.max - r.min > narrow) return r;
  const v = Math.round((r.min + r.max) / 2 / step) * step;
  return { min: v, max: v };
}

function fmtSets(t: CoachT, range: NumRange): string {
  const r = collapse(range, 1);
  return r.max === 1 ? t('note.fmt.sets.one') : t('note.fmt.sets.many', { range: fmtRange(t, r) });
}

function fmtReps(t: CoachT, range: NumRange & { unit: 'reps' | 'seconds' }): string {
  if (range.unit === 'seconds') return t('note.fmt.seconds', { value: fmtRange(t, collapse(range, 5, 5)) });
  const r = collapse(range, 1);
  return r.max === 1 ? t('note.fmt.reps.one') : t('note.fmt.reps.many', { range: fmtRange(t, r) });
}

function fmtMinutes(t: CoachT, sec: number): string {
  const halves = Math.round(sec / 30);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0) return t('note.fmt.minutes.halfMinute');
  if (whole === 1) return half ? t('note.fmt.minutes.oneAndHalf') : t('note.fmt.minutes.one');
  return half ? t('note.fmt.minutes.nAndHalf', { n: String(whole) }) : t('note.fmt.minutes.n', { n: String(whole) });
}

function fmtRestValue(t: CoachT, sec: number): string {
  return sec >= 90 ? fmtMinutes(t, sec) : t('note.fmt.seconds', { value: String(Math.round(sec / 15) * 15) });
}

/**
 * Rest. A narrow range (spread ≤ 60s) becomes ONE rounded value ("2 דקות
 * וחצי", never "2 דקות עד 2 דקות וחצי"); a wide one stays a range.
 */
export function fmtRest(r: NumRange, t: CoachT = defaultT()): string {
  if (r.max - r.min <= 60) return fmtRestValue(t, (r.min + r.max) / 2);
  if (r.max < 120) return t('note.fmt.seconds', { value: fmtRange(t, r) });
  const lo = r.min >= 60 ? fmtMinutes(t, r.min) : t('note.fmt.seconds', { value: String(Math.round(r.min / 15) * 15) });
  const hi = fmtMinutes(t, r.max);
  if (lo === hi) return lo;
  const a = Math.round(r.min / 30) / 2;
  const b = Math.round(r.max / 30) / 2;
  // "2 עד 3 דקות" when both are whole minutes ≥ 2, otherwise spell both out.
  if (Number.isInteger(a) && Number.isInteger(b) && a >= 2) return t('note.fmt.minutesRange', { a: String(a), b: String(b) });
  return t('note.fmt.range', { min: lo, max: hi });
}

// ============================================================================
// RENDERER
// ============================================================================

type Vars = Record<string, string | number | undefined>;

/** What a render needs: the locale, its translator, the phrasebook and which rows are admin overrides. */
interface RenderCtx {
  locale: string;
  t: CoachT;
  book: Record<CoachPhraseKey, string[]>;
  /** Keys whose variants came from `opts.phrasebook` (plain `{name}` templates), not from the catalog (ICU). */
  overridden: ReadonlySet<string>;
}

function fill(template: string, vars: Vars, icu?: { locale: string }): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === '') {
      missing = true;
      return '';
    }
    return String(v);
  });
  if (missing) return null;
  if (!icu) return out;
  // Catalog rows are ICU messages (a translator may add plural / select); values go in as strings.
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) values[k] = String(v);
  try {
    return formatIcu(template, icu.locale, values);
  } catch {
    return out;
  }
}

/** Voice guard — anything that slips through is dropped, never shown. */
export function violatesVoice(sentence: string): boolean {
  return (
    /[A-Za-z]/.test(sentence) || // no English (also catches unresolved slugs)
    /[—–]/.test(sentence) || // no em/en dashes
    /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/.test(sentence) // no emoji
  );
}

function pick(ctx: RenderCtx, key: CoachPhraseKey, seed: number, vars: Vars): string | null {
  const variants = ctx.book[key] ?? [];
  if (variants.length === 0) return null;
  const icu = ctx.overridden.has(key) ? undefined : { locale: ctx.locale };
  const start = (seed + stableHash(key)) % variants.length;
  // Try the picked variant first, then the others, until one fills cleanly.
  for (let i = 0; i < variants.length; i++) {
    const s = fill(variants[(start + i) % variants.length], vars, icu);
    if (s && !violatesVoice(s)) return s;
  }
  return null;
}

function reasonSentence(ctx: RenderCtx, r: DecisionReason, seed: number): string | null {
  switch (r.code) {
    case 'RECOVERY_DAY':
    case 'DELOAD_WEEK':
    case 'PEAK_WEEK':
    case 'LEVEL_CEILING':
    case 'MUSCLES_RESTED':
    case 'WEATHER_RAIN':
    case 'WEATHER_HEAT':
    case 'WEATHER_COLD':
    case 'WEATHER_UV':
      return pick(ctx, r.code, seed, {});
    case 'RETURNING':
      return pick(ctx, 'RETURNING', seed, { days: r.days });
    case 'BUILD_WEEK':
      return pick(ctx, 'BUILD_WEEK', seed, { week: r.week });
    case 'WEEKLY_GAP':
      return pick(ctx, 'WEEKLY_GAP', seed, { domain: domainName(ctx.locale, r.domain), pct: r.pct });
    case 'SKILL_FOCUS':
      return pick(ctx, 'SKILL_FOCUS', seed, { skill: domainName(ctx.locale, r.skill) });
    case 'PROGRAM_FOCUS':
      return pick(ctx, 'PROGRAM_FOCUS', seed, { program: programName(ctx.locale, r.program), level: r.level });
    case 'LOCATION':
      return pick(ctx, `LOCATION_${r.gearSummary}`, seed, { locIn: locationIn(ctx.locale, r.loc) });
    case 'TIME':
      return pick(ctx, `TIME_${r.slot}`, seed, {});
    case 'DIFFICULTY':
      return pick(ctx, `DIFFICULTY_${r.level}`, seed, {});
    default:
      return null;
  }
}

export interface RenderCoachNoteOptions {
  /** Partial override of DEFAULT_COACH_PHRASEBOOK (future admin rows). */
  phrasebook?: CoachPhrasebook;
  /** Output locale (default Hebrew). A catalog that is not loaded yet falls back to Hebrew, never to a key. */
  locale?: Locale;
}

/** 2–4 Hebrew sentences, or [] when nothing trustworthy can be said. */
export function renderCoachNoteSentences(
  record: DecisionRecord | null | undefined,
  opts: RenderCoachNoteOptions = {},
): string[] {
  if (!record || record.v !== 1) return [];
  const locale = opts.locale ?? SOURCE_LOCALE;
  const ctx: RenderCtx = {
    locale,
    t: makeT(locale, coach),
    book: { ...coachPhrasebookFor(locale), ...(opts.phrasebook ?? {}) } as Record<CoachPhraseKey, string[]>,
    overridden: new Set(Object.keys(opts.phrasebook ?? {})),
  };
  const { t } = ctx;
  const seed = record.seed >>> 0;
  const { expect } = record;
  const isRecovery = record.reasons.some((r) => r.code === 'RECOVERY_DAY');
  const timeSlot = (record.reasons.find((r) => r.code === 'TIME') as { slot?: string } | undefined)?.slot;

  // ── Why (top 1–2 renderable reasons). Evening/night TIME is saved for the
  //    calm line instead of spending a "why" slot on it.
  const why: string[] = [];
  const hasLevelNews = record.reasons.some((r) => r.code === 'LEVEL_CEILING');
  const hasRainHome = record.reasons.some((r) => r.code === 'WEATHER_RAIN');
  for (const r of record.reasons) {
    if (why.length >= 2) break;
    if (r.code === 'TIME' && r.slot !== 'morning') continue;
    // "Built around level X in program Y" is true of EVERY workout, so it says
    // nothing — only worth a slot when the level itself is news (the content
    // ceiling clamped it).
    if (r.code === 'PROGRAM_FOCUS' && !hasLevelNews) continue;
    // Rain already said "a home workout" — LOCATION would repeat it.
    if (r.code === 'LOCATION' && hasRainHome) continue;
    const s = reasonSentence(ctx, r, seed);
    if (s) why.push(s);
  }

  // ── What to expect: exercises + minutes, plus the single most useful
  //    extra fact (sets × reps; rest only when there are no reps to quote).
  const n = expect.exercisesCount;
  const vars: Vars = {
    n: n > 0 ? t('note.fmt.exercises', { n }) : undefined,
    sets: expect.setsRange ? fmtSets(t, expect.setsRange) : undefined,
    reps: expect.repRange ? fmtReps(t, expect.repRange) : undefined,
    rest: expect.restRange ? fmtRest(expect.restRange, t) : undefined,
    dur: expect.durationMin > 0 ? expect.durationMin : undefined,
  };
  const expectSentence =
    (!isRecovery ? pick(ctx, 'EXPECT_volume', seed, vars) ?? pick(ctx, 'EXPECT_rest', seed, vars) : null) ??
    pick(ctx, 'EXPECT_short', seed, vars);

  let protocolSentence: string | null = null;
  if (expect.protocol !== 'straight') {
    protocolSentence = pick(ctx, `PROTOCOL_${expect.protocol}`, seed, {
      workSec: expect.tabata?.workSec,
      restSec: expect.tabata?.restSec,
      rounds: expect.tabata?.rounds,
    });
  }

  // ── Optional calm line.
  let calm: string | null = null;
  if (isRecovery) calm = pick(ctx, 'CALM_recovery', seed, {});
  else if (timeSlot === 'evening') calm = pick(ctx, 'CALM_evening', seed, {});
  else if (timeSlot === 'night') calm = pick(ctx, 'CALM_night', seed, {});

  // ── Assemble: 2–4 sentences. Drop order when over 4: calm, protocol, why #2.
  const why2 = why[1] ?? null;
  const parts: Array<string | null> = [why[0] ?? null, why2, expectSentence, protocolSentence, calm];
  for (const dropMe of [calm, protocolSentence, why2]) {
    if (parts.filter(Boolean).length <= 4) break;
    if (dropMe) parts[parts.indexOf(dropMe)] = null;
  }
  const out = parts.filter((x): x is string => !!x);
  return out.length >= 2 ? out : [];
}

/** Convenience: the note as one paragraph ('' when nothing to say). */
export function renderCoachNote(
  record: DecisionRecord | null | undefined,
  opts: RenderCoachNoteOptions = {},
): string {
  return renderCoachNoteSentences(record, opts).join(' ');
}
