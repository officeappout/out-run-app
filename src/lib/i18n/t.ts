/**
 * t() without React — for server code, API routes, services and tests
 * (PLAN §2.1 `getT`). Components use useT() (src/hooks/useT.ts), which builds
 * on the same makeT().
 *
 *   const t = await getT('en', common);
 *   t('actions.save');                                    // "Save"
 *   t('greeting.ready', { gender: 'female' });            // he: "מוכנה?"
 */
import { genderArg, lookupMessage, translate, type MessageValues } from './core/i18n-core';
import { formatIcu, formatIcuRich } from './core/icu';
import { ensureCatalog, getCatalog, type Namespace, type NamespaceKey } from './catalogs';
import type { Locale } from './locales';

export interface TFunction<K extends string> {
  (key: K, values?: MessageValues): string;
  /** Message with tags: t.rich('terms', { link: (chunks) => <a>{chunks}</a> }). */
  rich<T = unknown>(key: K, values?: MessageValues): Array<string | T>;
  readonly locale: Locale;
}

export interface MakeTOptions {
  /** Injected as `gender` when the caller does not pass one ('male' | 'female' | 'other'). */
  gender?: unknown;
}

/** A t() bound to one locale + namespace, over whatever catalogs are loaded now. */
export function makeT<N extends Namespace>(locale: Locale, ns: N, opts: MakeTOptions = {}): TFunction<NamespaceKey<N>> {
  const catalogFor = (loc: string) => getCatalog(loc, ns.name);
  const withGender = (values?: MessageValues): MessageValues => {
    const g = genderArg(values && 'gender' in values ? values.gender : opts.gender);
    return { ...values, gender: g };
  };
  const t = ((key: string, values?: MessageValues) =>
    translate(catalogFor, formatIcu, locale, key, withGender(values))) as unknown as TFunction<NamespaceKey<N>>;
  (t as { rich: unknown }).rich = <T,>(key: string, values?: MessageValues): Array<string | T> => {
    const hit = lookupMessage(catalogFor, locale, key);
    if (!hit.found) return [key];
    try {
      return formatIcuRich<T>(hit.message, hit.locale, withGender(values));
    } catch {
      return [hit.message];
    }
  };
  (t as { locale: Locale }).locale = locale;
  return t;
}

/** Loads the namespace for `locale` (and its fallbacks), then returns its t(). */
export async function getT<N extends Namespace>(locale: Locale, ns: N, opts?: MakeTOptions): Promise<TFunction<NamespaceKey<N>>> {
  await ensureCatalog(locale, ns.name);
  return makeT(locale, ns, opts);
}
