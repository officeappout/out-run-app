/**
 * Locale-aware values for the content @tags (branding.utils.ts).
 *
 * Tag NAMES stay the Hebrew tokens (they are keys inside stored content). Only the VALUES a tag
 * resolves to come from the `brandingTags` catalog. Hebrew output is byte-identical to the old
 * hard-coded values (pinned by __tests__/resolveDescription.he-parity.test.ts).
 *
 * The English catalog is registered here synchronously: the resolver is a plain sync function used
 * by services, admin pages and components, so it cannot wait for the lazy catalog loader.
 */
import { makeT } from '@/lib/i18n/t';
import { registerCatalog } from '@/lib/i18n/catalogs';
import { isLocale, type Locale } from '@/lib/i18n/locales';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import { brandingTags } from '@/messages/ns/brandingTags';
import enCatalog from '@/messages/en/brandingTags.json';

registerCatalog('en', brandingTags.name, enCatalog);

/** Catalog keys that are fallbacks / glue, never a value a context field can select. */
const RESERVED = new Set(['fallback', 'notificationFallback', 'nextFallback']);

const HEBREW_LETTER = new RegExp('[\u0590-\u05FF]'); // the Hebrew block, written as escapes

export type TagGender = 'male' | 'female' | 'other';

export interface TagLabels {
  readonly lang: Locale;
  readonly isHebrew: boolean;
  /** Message by key. */
  (key: string, values?: MessageValues): string;
  /** True when `group.key` exists in the catalog. */
  has(group: string, key: string): boolean;
  /** `group.key` label, or undefined when the key is not in the group. */
  label(group: string, key: string | number | undefined | null, values?: MessageValues): string | undefined;
  /** The key of `group` whose Hebrew label equals `hebrew` (callers hand Hebrew display names in). */
  keyOfHebrew(group: string, hebrew: string): string | undefined;
  /**
   * A caller-supplied display string. Hebrew: as is. Other languages: undefined when it contains Hebrew
   * letters (the caller then leaves the tag unresolved so the row is skipped, never a mixed-language line).
   */
  text(raw: string | undefined | null): string | undefined;
}

/** Content language to the locale the tag catalog is read in (unknown / legacy languages read English). */
export function normalizeTagLang(lang: string | undefined | null): Locale {
  if (!lang) return 'he';
  return isLocale(lang) ? lang : 'en';
}

export function tagLabels(lang?: string | null, gender?: TagGender): TagLabels {
  const locale = normalizeTagLang(lang);
  const t = makeT(locale, brandingTags, { gender }) as unknown as (key: string, values?: MessageValues) => string;
  const heCatalog = brandingTags.he as Readonly<Record<string, string>>;
  const has = (group: string, key: string) => !RESERVED.has(key) && Object.prototype.hasOwnProperty.call(heCatalog, `${group}.${key}`);
  const fn = ((key: string, values?: MessageValues) => t(key, values)) as TagLabels & { lang: Locale; isHebrew: boolean };
  Object.assign(fn, {
    lang: locale,
    isHebrew: locale === 'he',
    has,
    label: (group: string, key: string | number | undefined | null, values?: MessageValues) => {
      if (key === undefined || key === null) return undefined;
      const k = String(key);
      return has(group, k) ? t(`${group}.${k}`, values) : undefined;
    },
    keyOfHebrew: (group: string, hebrew: string) => {
      const prefix = `${group}.`;
      for (const k of Object.keys(heCatalog)) if (k.startsWith(prefix) && !RESERVED.has(k.slice(prefix.length)) && heCatalog[k] === hebrew) return k.slice(prefix.length);
      return undefined;
    },
    text: (raw: string | undefined | null) => {
      if (raw === undefined || raw === null) return undefined;
      if (locale === 'he') return raw;
      return HEBREW_LETTER.test(raw) ? undefined : raw;
    },
  });
  return fn;
}
