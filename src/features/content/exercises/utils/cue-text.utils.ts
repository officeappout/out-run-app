/**
 * cue-text.utils — one place that turns stored cue / highlight / prep-note
 * values into display text.
 *
 * WHY THIS EXISTS
 *   Cue data reaches the client in several shapes: legacy plain strings,
 *   GenderedText `{ male, female }`, and (since the Phase 5.5 i18n normalizer —
 *   exercise-mapping.utils `sanitizeExecutionMethod`) LocalizedText `{ he, en }`.
 *   The player's plan builders only understood strings + `{ male, female }`, so
 *   every normalized `{ he, en }` cue resolved to '' and the live player showed
 *   no דגשים at all. Separately, admins often paste a whole list into ONE cue
 *   ("- עמדו… - התחילו…", newlines, "1." numbering), which rendered as a single
 *   bullet. Both are display concerns — the stored data is left untouched.
 *
 * Pure TS (no React, no Firebase, no barrel imports) — node-env unit-testable.
 */
import { g, type AppGender } from '@/lib/utils/gendered-text';

/** `profile.core.gender` — 'other' / missing resolve to the male form (see g()). */
export type CueGender = AppGender;

/** Zero-width / bidi control characters that sneak in from copy-paste. */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * A list marker: start-of-line or whitespace before it, and whitespace or a
 * Hebrew letter after it. That excludes hyphenated words ("push-up"), ranges
 * ("10-12", "10 – 15") and prefixed numbers ("ב-30°").
 *   group 1 — leading whitespace (or '')
 *   group 2 — the marker itself
 */
const MARKER_RE = /(^|\s)([-–—]|[•●▪·]|\d{1,2}[.)])(?=\s|[\u0590-\u05FF])/g;

type MarkerFamily = 'dash' | 'number' | 'dot';
function markerFamily(marker: string): MarkerFamily {
  if (/^[•●▪·]$/.test(marker)) return 'dot';
  return /^\d/.test(marker) ? 'number' : 'dash';
}

/** Leading bullet / dash residue left on a piece ("•• x", "- x"). */
const LEADING_BULLET_RE = /^(?:[•●▪·]+\s*|[-–—]+(?=\s|[\u0590-\u05FF])\s*)+/;

/** A piece is kept only if it has a letter/digit (Latin, Hebrew, Arabic) — not bare punctuation. */
const HAS_CONTENT_RE = /[A-Za-z0-9\u00C0-\u024F\u0590-\u05FF\u0600-\u06FF]/;

function cleanPiece(s: string): string {
  return s
    .replace(INVISIBLE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_BULLET_RE, '')
    .trim();
}

/**
 * Pick the display string out of one stored value.
 * string → itself; `{ he, en }` → he, else en; `{ male, female }` → by the
 * user's gender via g() (female → female; male / other / unknown → male),
 * falling back to the other form when one is empty.
 */
export function pickCueText(item: unknown, gender?: CueGender | string | null): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const o = item as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const localized = str(o.he) || str(o.en);
  if (localized) return localized;
  const male = str(o.male);
  const female = str(o.female);
  return g(gender as AppGender | null | undefined, male || female, female || male);
}

/**
 * Split ONE cue string into list items: newlines, bullet markers
 * ("- ", "– ", "• ") and "1." / "1)" numbering.
 *
 * Dashes and numbers are also normal sentence punctuation ("גב ישר - זה חשוב",
 * "עד 3. "), so a dash/number marker only splits when its OWN family is
 * clearly a list on that line: the line starts with one, or carries at least
 * two mid-line. Dot bullets always split.
 */
export function splitCueText(text: string): string[] {
  const out: string[] = [];
  const lines = text.replace(INVISIBLE_RE, '').split(/\r?\n|\u2028|\u2029/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const markers: Array<{ start: number; end: number; family: MarkerFamily }> = [];
    // exec loop, not matchAll — tsconfig targets below ES2015.
    const re = new RegExp(MARKER_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const start = m.index + m[1].length;
      markers.push({ start, end: start + m[2].length, family: markerFamily(m[2]) });
    }
    const isList = (family: MarkerFamily) => {
      if (family === 'dot') return true;
      const own = markers.filter((m) => m.family === family);
      return own.some((m) => m.start === 0) || own.filter((m) => m.start > 0).length >= 2;
    };
    const cuts = markers.filter((m) => isList(m.family));

    let cursor = 0;
    for (const cut of cuts) {
      out.push(line.slice(cursor, cut.start));
      cursor = cut.end;
    }
    out.push(line.slice(cursor));
  }
  return out.map(cleanPiece).filter((s) => HAS_CONTENT_RE.test(s));
}

/**
 * Any stored cue value → clean display list.
 * Accepts a single value or an array of string | `{ he, en }` | `{ male, female }`.
 * Every item is split (see splitCueText), cleaned and de-duplicated in order.
 */
export function toCueList(raw: unknown, gender?: CueGender | string | null): string[] {
  const items = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    for (const piece of splitCueText(pickCueText(item, gender))) {
      if (!seen.has(piece)) {
        seen.add(piece);
        out.push(piece);
      }
    }
  }
  return out;
}

/**
 * One stored text value (string | `{ he, en }` | `{ male, female }`) → a single
 * clean display string, NOT split. Used for the rest-screen prep note
 * (execution method `notificationText`). '' when empty.
 */
export function resolveGenderedText(raw: unknown, gender?: CueGender | string | null): string {
  return pickCueText(raw, gender).replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
}

/** Minimal structural view of what resolveExerciseCues reads (Firestore doc shapes vary). */
interface CueSourceMethod {
  specificCues?: unknown;
  highlights?: unknown;
}
interface CueSourceExercise {
  content?: { specificCues?: unknown; highlights?: unknown } | null;
}

/**
 * The player's "דגשים" for one exercise, read off the ENGINE-SELECTED method:
 *   highlights — method specificCues → else method highlights → else the
 *                exercise-level content.specificCues → content.highlights.
 *   tips       — the method highlights, when the cues came from specificCues
 *                (minus duplicates); [] otherwise.
 * No `content.instructions` sentence-splitting fallback — that produced
 * fragments, not cues.
 */
export function resolveExerciseCues(
  exercise: CueSourceExercise | null | undefined,
  method: CueSourceMethod | null | undefined,
  gender?: CueGender | string | null,
): { highlights: string[]; tips: string[] } {
  const methodCues = toCueList(method?.specificCues, gender);
  const methodHighlights = toCueList(method?.highlights, gender);
  if (methodCues.length > 0) {
    const cueSet = new Set(methodCues);
    return { highlights: methodCues, tips: methodHighlights.filter((t) => !cueSet.has(t)) };
  }
  if (methodHighlights.length > 0) return { highlights: methodHighlights, tips: [] };
  const contentCues = toCueList(exercise?.content?.specificCues, gender);
  if (contentCues.length > 0) return { highlights: contentCues, tips: [] };
  return { highlights: toCueList(exercise?.content?.highlights, gender), tips: [] };
}
