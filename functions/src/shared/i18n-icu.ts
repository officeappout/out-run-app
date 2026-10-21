/**
 * ICU formatter for Cloud Functions — the functions-side twin of the app's
 * src/lib/i18n/core/icu.ts (docs/i18n/PLAN.md §2.1). It is the `format`
 * function injected into the mirrored pure core (./i18n-core.ts), so pushes and
 * Kelly format messages with the same engine (intl-messageformat, same version
 * as the app) and the same rules as the app.
 *
 * Hand-written, not mirrored: the app's icu.ts also has formatIcuRich (React
 * tags), which server text never needs.
 *
 * Byte-identity: a message with no `{` and no `'` cannot change when formatted,
 * so it is returned as is without parsing (most Hebrew strings). Tags are
 * ignored, so a stray `<` in copy is just text.
 *
 * intl-messageformat is an ES module; functions compile to commonjs, so the
 * emitted require() relies on Node 22's built-in require(esm) (no top-level
 * await in the package). functions/src/__tests__/i18nFunctions.test.ts and the
 * compiled-lib smoke in the PR cover it.
 */
import { IntlMessageFormat } from 'intl-messageformat';
import type { MessageValues } from './i18n-core';

const cache = new Map<string, IntlMessageFormat>();
const MAX_CACHE = 2000;

function compiled(message: string, locale: string): IntlMessageFormat {
  const id = `${locale}|${message}`;
  let fmt = cache.get(id);
  if (!fmt) {
    fmt = new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(id, fmt);
  }
  return fmt;
}

/** True when ICU formatting could change the text at all. */
function needsIcu(message: string): boolean {
  return message.includes('{') || message.includes("'");
}

/** Plain formatting → string. Throws on a malformed message (the core's translate() catches it). */
export function formatIcu(message: string, locale: string, values?: MessageValues): string {
  if (!needsIcu(message)) return message;
  const out = compiled(message, locale).format(values as Record<string, string | number> | undefined);
  return Array.isArray(out) ? out.join('') : String(out);
}
