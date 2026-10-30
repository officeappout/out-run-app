/**
 * Display of engine-generated workout titles in the UI language. The stored title stays Hebrew (it is data the app matches on);
 * this maps it to the catalog text for display only. Pure: `tr` is a catalog lookup (`workoutTitle.*` keys in the home namespace).
 *
 * Order for a title shown in a non-Hebrew UI: the English pair of the content row it came from, else the catalog text of an
 * engine-generated title (the Hebrew string is looked up in the index built from the same tables the generator uses), else the Hebrew as saved.
 */
import { composeEngineTitle, ENGINE_TITLE_LEXICON_HE, type EngineTitleLexicon } from './engine-title';
import { DAY_FOCUS_HE, type DayFocus } from '../services/split-decision/day-focus.utils';
import type { LocalizedText } from '@/features/content/shared/localized-text.types';

export type TitleKeyLookup = (key: string, values?: Record<string, string>) => string;

const FOCUS_KEYS = ['upper', 'lower', 'push', 'pull', 'legs'] as const;
const STRENGTH_TITLE_HE = 'אימון כוח'; // i18n-allow-hebrew: data (generator fallback title)

/** The catalog-backed lexicon: same keys as the Hebrew tables, English values. */
export function engineTitleLexicon(tr: TitleKeyLookup): EngineTitleLexicon {
  const he = ENGINE_TITLE_LEXICON_HE;
  // Brand English titles ("Gym Blast 🔥") have no Hebrew letters: they are shown as they are, no catalog key.
  const hasHebrew = (v: string) => /[\u0590-\u05ff]/.test(v);
  const mapKeys = (group: string, rec: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v && hasHebrew(v) ? tr(`workoutTitle.${group}.${k}`) : v]));
  return {
    templates: Object.fromEntries(Object.entries(he.templates).map(([mode, rec]) => [mode, mapKeys(mode, rec)])),
    prefixes: Object.fromEntries(Object.entries(he.prefixes).map(([k, v]) => [k, v ? tr(`workoutTitle.prefix.${k}`) : ''])) as Record<number, string>,
    personas: mapKeys('persona', he.personas),
    locations: mapKeys('location', he.locations),
    forPersona: (label) => tr('workoutTitle.forPersona', { label }),
  };
}

const INTENT_MODES = Object.keys(ENGINE_TITLE_LEXICON_HE.templates);
const LOCATIONS = ['', ...Object.keys(ENGINE_TITLE_LEXICON_HE.locations)];
const PERSONAS = ['', ...Object.keys(ENGINE_TITLE_LEXICON_HE.personas)];

/** Hebrew engine title -> catalog title, for every combination the generator can produce. */
export function buildEngineTitleIndex(tr: TitleKeyLookup): Map<string, string> {
  const lex = engineTitleLexicon(tr);
  const index = new Map<string, string>();
  for (const intentMode of INTENT_MODES) {
    for (const difficulty of [1, 2, 3]) {
      for (const location of LOCATIONS) {
        for (const persona of PERSONAS) {
          const input = { intentMode, difficulty, location: location || undefined, persona: persona || undefined };
          const heTitle = composeEngineTitle(ENGINE_TITLE_LEXICON_HE, input);
          if (!index.has(heTitle)) index.set(heTitle, composeEngineTitle(lex, input));
        }
      }
    }
  }
  index.set(STRENGTH_TITLE_HE, tr('workoutTitle.strength'));
  return index;
}

export interface WorkoutTitleParts {
  /** The Hebrew title as saved on the workout (without the day-focus suffix). */
  title: string;
  /** The {he, en} pair of the content row the title came from, when the row has one. */
  titleLocalized?: LocalizedText;
  dayFocus?: DayFocus | null;
}

/**
 * The title to show. `contentLang` resolves the content-row pair (flag-gated), `uiIsEnglish` the catalog mapping of engine titles.
 * Hebrew UI: exactly titleWithFocusHe (callers use that path unchanged).
 */
export function displayWorkoutTitle(
  p: WorkoutTitleParts,
  opts: { contentLang: string; uiLang: string; tr: TitleKeyLookup; index?: Map<string, string>; heWithFocus: string },
): string {
  const pairEn = opts.contentLang === 'en' ? (p.titleLocalized?.en ?? '').trim() : '';
  const engineEn = opts.uiLang === 'en' && !pairEn ? (opts.index ?? buildEngineTitleIndex(opts.tr)).get(p.title) ?? '' : '';
  const baseEn = pairEn || engineEn;
  const focus = p.dayFocus;
  if (!focus || focus === 'full') return baseEn || p.title;
  if (opts.uiLang !== 'en') return opts.heWithFocus;
  const he = DAY_FOCUS_HE[focus];
  if (!p.title || p.title === STRENGTH_TITLE_HE) return opts.tr(`workoutTitle.focusWorkout.${focus}`);
  if (p.title.includes(he) || p.title.includes(DAY_FOCUS_HE.full)) return baseEn || opts.heWithFocus;
  if (!baseEn) return opts.heWithFocus; // unknown English base: stay all-Hebrew rather than mix languages
  return `${baseEn} · ${opts.tr(`workoutTitle.focusShort.${focus}`)}`;
}

export const ENGINE_TITLE_CATALOG_KEYS: readonly string[] = (() => {
  const he = ENGINE_TITLE_LEXICON_HE;
  const keys: string[] = ['workoutTitle.forPersona', 'workoutTitle.strength'];
  for (const [mode, rec] of Object.entries(he.templates)) for (const [k, v] of Object.entries(rec)) if (/[\u0590-\u05ff]/.test(v)) keys.push(`workoutTitle.${mode}.${k}`);
  for (const [k, v] of Object.entries(he.prefixes)) if (v) keys.push(`workoutTitle.prefix.${k}`);
  for (const [k, v] of Object.entries(he.personas)) if (v) keys.push(`workoutTitle.persona.${k}`);
  for (const [k, v] of Object.entries(he.locations)) if (v) keys.push(`workoutTitle.location.${k}`);
  for (const f of FOCUS_KEYS) { keys.push(`workoutTitle.focusWorkout.${f}`, `workoutTitle.focusShort.${f}`); }
  return keys;
})();
