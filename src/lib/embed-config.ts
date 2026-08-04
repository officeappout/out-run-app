/**
 * Config for /embed/* routes rendered inside an external iframe.
 *
 * ALLOWED_EMBED_ORIGINS is the runtime-side allowlist (e.g. for validating
 * postMessage origins later). It is a separate literal from the
 * `frame-ancestors` value in next.config.mjs — next.config.mjs is loaded by
 * Node before the TS/webpack pipeline exists, so it can't import this file.
 * Keep the two in sync by hand when the marketing domain changes.
 */
export const ALLOWED_EMBED_ORIGINS: string[] = [
  // TODO: replace with the real marketing-site origin once confirmed.
  'http://localhost:3000',
];

export type EmbedLang = 'he' | 'en';

const VALID_LANGS: EmbedLang[] = ['he', 'en'];

export interface EmbedConfig {
  lang: EmbedLang;
}

/** Parses the small set of query params an embedding iframe may pass. */
export function parseEmbedConfig(
  searchParams: URLSearchParams | { get(key: string): string | null },
): EmbedConfig {
  const rawLang = searchParams.get('lang');
  const lang = VALID_LANGS.includes(rawLang as EmbedLang)
    ? (rawLang as EmbedLang)
    : 'he';
  return { lang };
}
