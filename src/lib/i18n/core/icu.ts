/**
 * ICU formatter for the app — a thin cache over intl-messageformat (FormatJS).
 * Plugged into the pure core (i18n-core.ts) as its `format` function.
 *
 * Byte-identity: a message with no `{` and no `'` cannot change when formatted,
 * so it is returned as is without parsing (most Hebrew strings). Plain t() parses
 * with ignoreTag, so a stray `<` in copy is just text; rich() is the only path
 * that reads `<b>...</b>` tags.
 */
import { IntlMessageFormat } from 'intl-messageformat';
import type { MessageValues } from './i18n-core';

const cache = new Map<string, IntlMessageFormat>();
const MAX_CACHE = 2000;

function compiled(message: string, locale: string, tags: boolean): IntlMessageFormat {
  const id = `${tags ? 'r' : 'p'}|${locale}|${message}`;
  let fmt = cache.get(id);
  if (!fmt) {
    fmt = new IntlMessageFormat(message, locale, undefined, { ignoreTag: !tags });
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(id, fmt);
  }
  return fmt;
}

/** True when ICU formatting could change the text at all. */
function needsIcu(message: string): boolean {
  return message.includes('{') || message.includes("'");
}

/** Plain formatting → string. Throws on a malformed message (the core catches it). */
export function formatIcu(message: string, locale: string, values?: MessageValues): string {
  if (!needsIcu(message)) return message;
  const out = compiled(message, locale, false).format(values as Record<string, string | number> | undefined);
  return Array.isArray(out) ? out.join('') : String(out);
}

/**
 * Rich formatting: `<b>{name}</b>` with `{ b: (chunks) => <strong>{chunks}</strong> }`.
 * Returns the parts (strings and whatever the tag functions return).
 */
export function formatIcuRich<T>(message: string, locale: string, values?: MessageValues): Array<string | T> {
  if (!needsIcu(message) && !message.includes('<')) return [message];
  const out = compiled(message, locale, true).format<T>(values as Record<string, T>);
  return Array.isArray(out) ? (out as Array<string | T>) : [out as string | T];
}
