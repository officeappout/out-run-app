/**
 * English for the code's static Hebrew name maps (program slugs, equipment keys), from the `common` catalog
 * (`program.label`, `equipment.label`). Display only, and English only: in Hebrew these return undefined so
 * every caller keeps its existing Hebrew chain, byte-identical. Keyed on the content language, like the
 * program / gear docs these maps stand in for.
 */
import { makeLiveT } from '@/lib/i18n/live-t';
import { common } from '@/messages/ns/common';
import { getContentLanguage } from '@/features/content/shared/useContentLanguage';

const tCommon = makeLiveT(common);

/** Aliases and Firestore program ids -> the catalog slug. */
const PROGRAM_ALIAS: Readonly<Record<string, string>> = {
  fullbody: 'full_body',
  pushing: 'push',
  pulling: 'pull',
  abs: 'core',
  leg: 'legs',
  pullup: 'pull_up',
  shoe: 'running',
  heart: 'health',
  upper_calisthenics: 'calisthenics_upper',
  hspu: 'handstand_pushup',
  oapu: 'one_arm_pullup',
  // progression-map-config leaf programs (Firestore ids).
  mFcuYlNgKXLqWVUFo0zt: 'front_lever',
  pCI5NHXpowu2ySucqDn8: 'planche',
  cC0BOmm6KIqYAyQynEIo: 'one_arm_pullup',
  IOfBZFeorTTDkcz3tOA6: 'handstand',
  PAxprHuT7HjqrWU4wl0T: 'handstand_pushup',
  EtY8YCol0qpF6DzgcTx1: 'human_flag',
  fTLWzjP9gH2VNpamyCZF: 'muscle_up',
  UPDBtTdCvX748dtBlWYj: 'pull',
  J0fLpmJhG0KDN2tQouxh: 'push',
  kDMpobbKsuVTByTIKUpe: 'core',
  OrAmOH3F375dVio5yGdU: 'legs',
};

function programSlug(idOrSlug: string): string {
  if (PROGRAM_ALIAS[idOrSlug]) return PROGRAM_ALIAS[idOrSlug];
  const s = idOrSlug.toLowerCase().replace(/-/g, '_');
  return PROGRAM_ALIAS[s] ?? s;
}

/** English label for a program id / slug, or undefined (Hebrew mode, or a slug the catalog does not know). */
export function programLabelEn(idOrSlug: string | null | undefined, lang: string = getContentLanguage()): string | undefined {
  if (lang !== 'en' || !idOrSlug) return undefined;
  return tCommon('program.label', { slug: programSlug(idOrSlug) }) || undefined;
}

/** English label for a canonical equipment key, or undefined (Hebrew mode, or an unknown key). */
export function equipmentLabelEn(key: string | null | undefined, lang: string = getContentLanguage()): string | undefined {
  if (lang !== 'en' || !key) return undefined;
  return tCommon('equipment.label', { key: key.toLowerCase().replace(/-/g, '_') }) || undefined;
}
