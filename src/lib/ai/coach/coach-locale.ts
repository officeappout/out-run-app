/**
 * Kelly server locale (flag ai_coach_locale_v1). Pure + one async catalog loader.
 *
 * The reply language of a turn is decided ONCE per request by resolveCoachLocale() and then passed
 * explicitly (system prompt, safety reply, paused reply, fixed texts, proactive templates). Nothing
 * here reads the client locale store, and there is no module-level "current locale": two concurrent
 * requests in different languages cannot see each other.
 *
 * Hebrew is the default and the source of truth: flag off, enable_i18n off, no stored locale, or a
 * locale Kelly has no copy for → 'he', and every Hebrew output is byte-identical to before.
 */
import { effectiveLocaleFlags, pickAppLocale, type LocaleFlags } from '@/lib/i18n/locale-resolution';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { makeT, type TFunction } from '@/lib/i18n/t';
import { coach } from '@/messages/ns/coach';
import type { NamespaceKey } from '@/lib/i18n/catalogs';

/** Languages Kelly can answer in. A locale joins this list only once its coach catalog and prompt rules exist. */
export const COACH_LOCALES = ['he', 'en'] as const;
export type CoachLocale = (typeof COACH_LOCALES)[number];

export const DEFAULT_COACH_LOCALE: CoachLocale = 'he';

export function isCoachLocale(v: unknown): v is CoachLocale {
  return typeof v === 'string' && (COACH_LOCALES as readonly string[]).includes(v);
}

/** The server flags this resolution reads (ServerFeatureFlags keys). */
export interface CoachLocaleFlags {
  aiCoachLocaleV1?: boolean;
  enableI18n?: boolean;
  enableLocaleEn?: boolean;
  enableLocaleRu?: boolean;
  enableLocaleDe?: boolean;
}

/** The slice of users/{uid} it reads: core.locale (the source of truth LocaleSync writes) and core.isSuperAdmin. */
export interface CoachLocaleUser {
  core?: { locale?: unknown; isSuperAdmin?: unknown } | null;
}

/**
 * The language Kelly speaks to this user: 'he' unless ai_coach_locale_v1 AND enable_i18n are on AND the
 * user's stored locale is a non-Hebrew locale the app allows (same allow-list and super-admin override as
 * the app's own language setting, locale-resolution.ts) AND Kelly has copy for it (COACH_LOCALES).
 */
export function resolveCoachLocale(user: CoachLocaleUser | null | undefined, flags: CoachLocaleFlags | null | undefined): CoachLocale {
  if (flags?.aiCoachLocaleV1 !== true || flags.enableI18n !== true) return DEFAULT_COACH_LOCALE;
  const lf: LocaleFlags = {
    enableI18n: true,
    enableLocaleEn: flags.enableLocaleEn === true,
    enableLocaleRu: flags.enableLocaleRu === true,
    enableLocaleDe: flags.enableLocaleDe === true,
  };
  const loc = pickAppLocale(effectiveLocaleFlags(lf, user?.core?.isSuperAdmin === true), { profileLocale: user?.core?.locale });
  return isCoachLocale(loc) ? loc : DEFAULT_COACH_LOCALE;
}

/** A coach-namespace t() for one request's locale. Hebrew is exactly makeT('he', coach). */
export function coachT(locale: CoachLocale = DEFAULT_COACH_LOCALE): TFunction<NamespaceKey<typeof coach>> {
  return makeT(locale, coach);
}

/** Loads the coach catalog for a non-Hebrew locale (Hebrew is bundled). Call once per request before coachT(). */
export async function ensureCoachCatalog(locale: CoachLocale): Promise<void> {
  if (locale !== DEFAULT_COACH_LOCALE) await ensureCatalog(locale, coach.name);
}

/**
 * The locale for one request, with its catalog loaded: resolveCoachLocale(), and 'he' when the catalog can't be
 * loaded (Kelly never answers in a language she has no fixed copy for).
 */
export async function coachLocaleForRequest(user: CoachLocaleUser | null | undefined, flags: CoachLocaleFlags | null | undefined): Promise<CoachLocale> {
  const locale = resolveCoachLocale(user, flags);
  if (locale === DEFAULT_COACH_LOCALE) return locale;
  try {
    await ensureCoachCatalog(locale);
    return locale;
  } catch (err) {
    console.warn('[ai-coach] coach catalog failed to load, answering in Hebrew', locale, err);
    return DEFAULT_COACH_LOCALE;
  }
}
