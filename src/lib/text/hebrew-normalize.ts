/**
 * hebrew-normalize — Hebrew text normalization for keyword search. Pure, zero imports.
 * Shared by Kelly's app-help retrieval (src/lib/ai/coach/app-help/retrieve.ts) and the admin
 * assistant's local navigation (src/lib/admin-nav/fuzzy-search.ts) — moved here from
 * retrieve.ts (axiom §7: shared utilities live in src/lib/).
 */

const NIQQUD = /[֑-ׇ]/g;
/** One or two leading particles (ו/ה/ב/ל/מ/ש/כ) in front of a word of ≥2 letters. */
const PREFIXES = /^(?:ו|ה|ב|ל|מ|ש|כ){1,2}(?=[א-ת]{2,})/;

/** NFC, no niqqud / geresh / quotes, lower-case, only Hebrew + latin letters + digits, single spaces. */
export function normalizeHe(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(/[״"׳']/g, '')
    .toLowerCase()
    .replace(/[^א-תa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drops leading Hebrew particles ("וברשויות" → "רשויות"). Leaves short words alone. */
export function stemHe(word: string): string {
  return word.replace(PREFIXES, '');
}
