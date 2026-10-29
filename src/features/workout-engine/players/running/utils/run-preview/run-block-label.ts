/**
 * Display text for a run block's label in the content language (pure).
 *
 * `block.label` is ALWAYS the Hebrew string: isStrideBlock, isGenericLabel, the rep-suffix regexes and the walking
 * detection all match on it, so none of that logic changes. English is display only: the template's
 * `labelLocalized` (see core/services/running-template-localized) or, for labels the engine itself injects
 * (warm-up, cool-down, rests, strides), the fixed table below. Hebrew or no English available returns the block's own
 * label untouched.
 */
import { getLocalizedText, type AppLanguage } from '@/features/content/shared/localized-text.types';
import type { RunBlock } from '../../types/run-block.type';
import { cleanBlockLabel } from './run-title';

const REP_SUFFIX = /\s*\(\d+\/\d+\)\s*$/;

/** The engine's own Hebrew labels (running-engine.service) -> English. Keyed by the cleaned Hebrew label. */
const ENGINE_LABELS_EN: Record<string, string> = {
  'חימום': 'Warm-up', // i18n-allow-hebrew: lookup key, the engine's stored label
  'שחרור': 'Cool-down', // i18n-allow-hebrew: lookup key, the engine's stored label
  'סטריידס': 'Strides', // i18n-allow-hebrew: lookup key, the engine's stored label
  'מנוחה': 'Rest', // i18n-allow-hebrew: lookup key, the engine's stored label
  'הליכה': 'Walk', // i18n-allow-hebrew: lookup key, the engine's stored label
  'הליכת התאוששות': 'Recovery walk', // i18n-allow-hebrew: lookup key, the engine's stored label
  'ריצת התאוששות': 'Recovery jog', // i18n-allow-hebrew: lookup key, the engine's stored label
  'התאוששות': 'Recovery', // i18n-allow-hebrew: lookup key, the engine's stored label
  'ריצה': 'Run', // i18n-allow-hebrew: lookup key, the engine's stored label
  'ריצה רציפה': 'Continuous run', // i18n-allow-hebrew: lookup key, the engine's stored label
};

/** The English words for a block with the "(2/6)" suffix removed, or null when there are none. */
function englishWords(b: Pick<RunBlock, 'label' | 'labelLocalized'>, lang: AppLanguage): string | null {
  if (lang === 'he') return null;
  const hebrew = cleanBlockLabel(b.label);
  // The pair only applies while the block still carries its template's Hebrew (the main-set swap rewrites labels to sizes).
  const pair = b.labelLocalized && cleanBlockLabel(b.labelLocalized.he) === hebrew ? b.labelLocalized : null;
  const fromTemplate = pair ? getLocalizedText(pair, lang) : '';
  const words = fromTemplate && fromTemplate !== hebrew ? cleanBlockLabel(fromTemplate) : ENGINE_LABELS_EN[hebrew];
  return words || null;
}

/** The label to show, rep suffix kept ("Hill repeats (2/6)"). Hebrew label when there is no English. */
export function runBlockLabel(b: Pick<RunBlock, 'label' | 'labelLocalized'>, lang: AppLanguage): string {
  const words = englishWords(b, lang);
  if (!words) return b.label;
  const suffix = REP_SUFFIX.exec(b.label)?.[0] ?? '';
  return `${words}${suffix}`;
}

/** The label to show without the rep suffix (cleanBlockLabel's display twin). */
export function cleanRunBlockLabel(b: Pick<RunBlock, 'label' | 'labelLocalized'>, lang: AppLanguage): string {
  return englishWords(b, lang) ?? cleanBlockLabel(b.label);
}
