/**
 * t() for Cloud Functions — the server `getT` of docs/i18n/PLAN.md §2.1 / §2.6
 * (app twin: src/lib/i18n/t.ts). Same core (./i18n-core.ts, mirrored), same
 * ICU engine (./i18n-icu.ts), same catalogs (./i18n-catalogs.ts, mirrored from
 * src/messages/<locale>/<ns>.json).
 *
 *   const t = getT(locale, 'push', { gender: user.core?.gender });
 *   t('streak.title', { days });            // locale → en → he → the key itself
 *
 * Differences from the app's getT, on purpose:
 *   - synchronous: every mirrored catalog is compiled into the function, nothing to load;
 *   - namespaces are names ('common', 'push'), not handles — the mirror is keyed by name;
 *   - an unknown locale (bad profile value) is treated as Hebrew.
 *
 * Not used by any sender yet (wave 5 wires it in).
 */
import { genderArg, translate, type Catalog, type MessageValues } from './i18n-core';
import { formatIcu } from './i18n-icu';
import { FUNCTIONS_CATALOGS } from './i18n-catalogs';
import { isLocale, SOURCE_LOCALE, type Locale } from './locales';

export type FunctionsNamespace = keyof typeof FUNCTIONS_CATALOGS;

/** Keys of a mirrored namespace, typed from its Hebrew catalog (the source). */
export type FunctionsKey<N extends FunctionsNamespace> = Extract<keyof (typeof FUNCTIONS_CATALOGS)[N]['he'], string>;

export interface FunctionsT<K extends string> {
  (key: K, values?: MessageValues): string;
  readonly locale: Locale;
}

export interface GetTOptions {
  /** The recipient's gender (core.gender). Injected as `gender` unless the call passes its own. */
  gender?: unknown;
}

/** Catalogs registered at runtime (tests, or a namespace a function builds itself). Win over the mirror. */
const registered = new Map<string, Catalog>();
const id = (locale: string, ns: string) => `${locale}/${ns}`;

/** The catalog for one locale + namespace, or undefined when there is none. */
export function getCatalog(locale: string, ns: string): Catalog | undefined {
  const own = registered.get(id(locale, ns));
  if (own) return own;
  const byNs = (FUNCTIONS_CATALOGS as unknown as Record<string, Record<string, Catalog> | undefined>)[ns];
  return byNs?.[locale];
}

/** Puts a catalog in place (tests; same shape as src/messages/<locale>/<ns>.json). */
export function registerCatalog(locale: string, ns: string, catalog: Catalog): void {
  registered.set(id(locale, ns), catalog);
}

/** Test-only: forget registered catalogs (the mirror stays). */
export function __resetRegisteredCatalogsForTests(): void {
  registered.clear();
}

/** A bad / missing locale → Hebrew. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : SOURCE_LOCALE;
}

/** t() for any namespace name, untyped keys (registered catalogs, generic helpers). */
export function makeT(locale: unknown, ns: string, opts: GetTOptions = {}): FunctionsT<string> {
  const loc = toLocale(locale);
  const catalogFor = (l: string) => getCatalog(l, ns);
  const t = ((key: string, values?: MessageValues) => {
    const gender = genderArg(values && 'gender' in values ? values.gender : opts.gender);
    return translate(catalogFor, formatIcu, loc, key, { ...values, gender });
  }) as FunctionsT<string>;
  (t as { locale: Locale }).locale = loc;
  return t;
}

/** t() for a mirrored namespace, keys typed from its Hebrew catalog. */
export function getT<N extends FunctionsNamespace>(locale: unknown, ns: N, opts?: GetTOptions): FunctionsT<FunctionsKey<N>> {
  return makeT(locale, ns, opts) as FunctionsT<FunctionsKey<N>>;
}
