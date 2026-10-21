/**
 * Catalogs: src/messages/{locale}/{namespace}.json (PLAN §2.1).
 *
 * Each namespace is declared once, in its own small file
 * src/messages/ns/{namespace}.ts:
 *
 *   import he from '../he/home.json';
 *   export const home = defineNamespace('home', he);
 *
 * - Hebrew is imported statically by that file, so it is there on the first
 *   render (no flash, flag off = no async work at all) and only lands in the
 *   chunks of screens that use the namespace.
 * - en / ru / de are loaded lazily the first time a user on that locale needs them.
 * - Keys are typed from the Hebrew file: t('home.titel') is a type error.
 * - No central registry, so two agents adding two namespaces never touch the same file.
 */
import type { Catalog } from './core/i18n-core';
import { SOURCE_LOCALE, type Locale } from './locales';

export interface Namespace<K extends string = string> {
  readonly name: string;
  /** The Hebrew catalog (source of truth). */
  readonly he: Readonly<Record<K, string>>;
}

export type NamespaceKey<N> = N extends Namespace<infer K> ? K : never;

const cache = new Map<string, Catalog>();
const pending = new Map<string, Promise<Catalog>>();
const listeners = new Set<() => void>();

const id = (locale: string, ns: string) => `${locale}/${ns}`;

export function defineNamespace<C extends Record<string, string>>(
  name: string,
  he: C,
): Namespace<Extract<keyof C, string>> {
  cache.set(id(SOURCE_LOCALE, name), he);
  return { name, he: he as Readonly<Record<Extract<keyof C, string>, string>> };
}

/** A loaded catalog, or undefined when not loaded (yet). */
export function getCatalog(locale: string, ns: string): Catalog | undefined {
  return cache.get(id(locale, ns));
}

/** Puts a catalog in the cache (loader, server code that bundles its own JSON, tests). */
export function registerCatalog(locale: string, ns: string, catalog: Catalog): void {
  cache.set(id(locale, ns), catalog);
  listeners.forEach((fn) => fn());
}

/** Called after any catalog lands (the locale store bumps a version so useT re-renders). */
export function onCatalogLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function importCatalog(locale: string, ns: string): Promise<Catalog> {
  // Template import → one lazy chunk per JSON file (webpack context / vite glob).
  const mod = (await import(
    /* webpackInclude: /(en|ru|de)[\\/][^\\/]+\.json$/ */
    /* webpackChunkName: "i18n-[request]" */
    `../../messages/${locale}/${ns}.json`
  )) as { default?: Catalog } & Catalog;
  return (mod.default ?? mod) as Catalog;
}

/**
 * Makes sure a namespace (plus its fallback locales) is loaded for `locale`.
 * Hebrew never loads (it is static). A missing file or failed load resolves to an
 * empty catalog: t() then falls back to en → he, never throws.
 */
export function ensureCatalog(locale: Locale, ns: string): Promise<void> {
  const locales = locale === SOURCE_LOCALE ? [] : locale === 'en' ? ['en'] : [locale, 'en'];
  return Promise.all(
    locales.map((loc) => {
      const key = id(loc, ns);
      if (cache.has(key)) return Promise.resolve();
      let p = pending.get(key);
      if (!p) {
        p = importCatalog(loc, ns).catch(() => ({}) as Catalog);
        pending.set(key, p);
      }
      return p.then((catalog) => {
        pending.delete(key);
        if (!cache.has(key)) registerCatalog(loc, ns, catalog);
      });
    }),
  ).then(() => undefined);
}

/** Test-only: forget every non-Hebrew catalog. */
export function __resetCatalogsForTests(): void {
  for (const key of Array.from(cache.keys())) if (!key.startsWith(`${SOURCE_LOCALE}/`)) cache.delete(key);
  pending.clear();
}
