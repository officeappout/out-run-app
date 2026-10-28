/**
 * makeLiveT(ns) — a t() for pure modules that cannot call useT(): it reads the app's current locale (and,
 * outside Hebrew, the user's gender) from the locale store at CALL time, not at import time.
 *
 *   const t = makeLiveT(player);          // module scope is fine: nothing is resolved until t() runs
 *   export const label = () => t('timedLabels.now');
 *
 * Hebrew stays byte-identical to `makeT('he', ns)`: with locale 'he' no gender is injected (as before).
 * A namespace missing for the current locale is requested lazily; callers that render via useT() re-render when
 * it lands (catalogVersion). Server code: the store never leaves 'he' there, so server copy stays Hebrew.
 */
import { useLocaleStore } from '@/store/useLocaleStore';
import { ensureCatalog, getCatalog, type Namespace, type NamespaceKey } from './catalogs';
import { makeT, type TFunction } from './t';
import { SOURCE_LOCALE } from './locales';
import type { MessageValues } from './core/i18n-core';

export function makeLiveT<N extends Namespace>(ns: N): TFunction<NamespaceKey<N>> {
  let cached: { locale: string; gender: unknown; version: number; t: TFunction<NamespaceKey<N>> } | null = null;
  const current = (): TFunction<NamespaceKey<N>> => {
    const { locale, gender } = useLocaleStore.getState();
    const he = locale === SOURCE_LOCALE;
    if (!he && !getCatalog(locale, ns.name)) void ensureCatalog(locale, ns.name);
    const version = useLocaleStore.getState().catalogVersion;
    const g = he ? undefined : gender;
    if (!cached || cached.locale !== locale || cached.gender !== g || cached.version !== version) {
      cached = { locale, gender: g, version, t: makeT(locale, ns, he ? {} : { gender: g }) };
    }
    return cached.t;
  };
  const t = ((key: NamespaceKey<N>, values?: MessageValues) => current()(key, values)) as TFunction<NamespaceKey<N>>;
  (t as { rich: unknown }).rich = (key: NamespaceKey<N>, values?: MessageValues) => current().rich(key, values);
  Object.defineProperty(t, 'locale', { get: () => useLocaleStore.getState().locale });
  return t;
}
