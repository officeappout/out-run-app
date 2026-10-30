/**
 * Request → legal page language + its `legal` t(). Server only: reads the out_locale cookie and, only when a
 * non-Hebrew language is requested, the stored feature flags (so Hebrew requests never touch Firestore).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { LOCALE_COOKIE, parseLocaleCookie } from '@/lib/i18n/locale-cookie';
import { SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';
import { getT } from '@/lib/i18n/t';
import { legal } from '@/messages/ns/legal';
import { pickLegalLocale, requestedLegalLocale } from './legal-locale';

/** Next 14 page searchParams. */
export type LegalSearchParams = Record<string, string | string[] | undefined> | undefined;

function cookieLocale(): Locale | null {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  return parseLocaleCookie(raw ? `${LOCALE_COOKIE}=${raw}` : null);
}

export async function resolveLegalLocale(searchParams: LegalSearchParams): Promise<Locale> {
  const requested = requestedLegalLocale(searchParams?.lang, cookieLocale());
  if (!requested || requested === SOURCE_LOCALE) return SOURCE_LOCALE;
  const f = await getServerFeatureFlags();
  return pickLegalLocale(requested, {
    enableI18n: f.enableI18n,
    enableLocaleEn: f.enableLocaleEn,
    enableLocaleRu: f.enableLocaleRu,
    enableLocaleDe: f.enableLocaleDe,
  });
}

/** The page's locale and its loaded `legal` translator. */
export async function legalT(searchParams: LegalSearchParams) {
  const locale = await resolveLegalLocale(searchParams);
  return { locale, t: await getT(locale, legal) };
}
