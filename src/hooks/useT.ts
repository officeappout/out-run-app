'use client';

/**
 * useT(namespace) — translations in client components (docs/i18n/HOW-TO.md).
 *
 *   import { home } from '@/messages/ns/home';
 *   const t = useT(home);
 *   <h1>{t('hero.title', { name })}</h1>
 *   <p>{t('hero.ready')}</p>                 // {gender, select, ...}: the user's gender is injected
 *   <p>{t.rich('terms', { link: (c) => <a href="/terms">{c}</a> })}</p>
 *
 * Flags off → locale is always 'he' and t() returns the Hebrew catalog text exactly.
 */
import { createElement, Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { useLocaleStore } from '@/store/useLocaleStore';
import { ensureCatalog, type Namespace, type NamespaceKey } from '@/lib/i18n/catalogs';
import { makeT, type TFunction } from '@/lib/i18n/t';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';

export interface ReactTFunction<K extends string> extends Omit<TFunction<K>, 'rich'> {
  (key: K, values?: MessageValues): string;
  rich(key: K, values?: MessageValues): ReactNode;
}

export function useT<N extends Namespace>(ns: N): ReactTFunction<NamespaceKey<N>> {
  const locale = useLocaleStore((s) => s.locale);
  const gender = useLocaleStore((s) => s.gender);
  const catalogVersion = useLocaleStore((s) => s.catalogVersion);

  useEffect(() => {
    if (locale !== SOURCE_LOCALE) void ensureCatalog(locale, ns.name);
  }, [locale, ns.name]);

  return useMemo(() => {
    const base = makeT(locale, ns, { gender });
    const t = ((key: NamespaceKey<N>, values?: MessageValues) => base(key, values)) as ReactTFunction<NamespaceKey<N>>;
    (t as { rich: unknown }).rich = (key: NamespaceKey<N>, values?: MessageValues): ReactNode =>
      createElement(Fragment, null, ...base.rich<ReactNode>(key, values));
    (t as { locale: unknown }).locale = locale;
    return t;
    // catalogVersion: a lazily loaded catalog changes what makeT() finds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, ns, gender, catalogVersion]);
}
