/**
 * i18n wave 4 — physical -> logical Tailwind class mapping (pure, unit-tested).
 *
 * The app renders under `<html dir="rtl">` in Hebrew, so a physical class like
 * `ml-2` (margin-LEFT) must become the logical class whose RTL meaning is
 * margin-left, i.e. `me-2` (margin-inline-END). A naive ml->ms swap would flip
 * the Hebrew layout. English (dir=ltr) then mirrors automatically.
 *
 * Only call this for class strings known to render under dir=rtl (or inherited
 * from <html>). Never for a dir="ltr" subtree.
 */

/** Simple prefix swaps: `<physical>-<rest>` -> `<logical>-<rest>` (rest required). */
const PREFIX_MAP: Record<string, string> = {
  ml: 'me',
  mr: 'ms',
  pl: 'pe',
  pr: 'ps',
  left: 'end',
  right: 'start',
  'scroll-ml': 'scroll-me',
  'scroll-mr': 'scroll-ms',
  'scroll-pl': 'scroll-pe',
  'scroll-pr': 'scroll-ps',
};

/** Utilities that may appear bare or with a suffix (`rounded-l`, `rounded-l-lg`, `border-r-2`). */
const OPTIONAL_SUFFIX_MAP: Record<string, string> = {
  'rounded-l': 'rounded-e',
  'rounded-r': 'rounded-s',
  // RTL: top-left = block-start + inline-end = "start-end" (se); top-right = "start-start" (ss).
  'rounded-tl': 'rounded-se',
  'rounded-tr': 'rounded-ss',
  'rounded-bl': 'rounded-ee',
  'rounded-br': 'rounded-es',
  'border-l': 'border-e',
  'border-r': 'border-s',
};

/** Exact class names. */
const EXACT_MAP: Record<string, string> = {
  'text-left': 'text-end',
  'text-right': 'text-start',
  'float-left': 'float-end',
  'float-right': 'float-start',
  'clear-left': 'clear-end',
  'clear-right': 'clear-start',
};

/** Split `a:b:[&:hover]:ml-2` into variants + base, respecting [] brackets. */
export function splitVariants(token: string): { variants: string; base: string } {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ':' && depth === 0) last = i;
  }
  return { variants: token.slice(0, last + 1), base: token.slice(last + 1) };
}

/** Returns the RTL-pixel-identical logical token, or null when not a mapped physical class. */
export function mapClassToken(token: string): string | null {
  const { variants, base } = splitVariants(token);
  // Already direction-aware by hand: leave alone.
  if (/(^|:)(rtl|ltr):/.test(variants)) return null;
  let rest = base;
  let important = '';
  if (rest.startsWith('!')) {
    important = '!';
    rest = rest.slice(1);
  }
  let neg = '';
  if (rest.startsWith('-')) {
    neg = '-';
    rest = rest.slice(1);
  }
  const out = (b: string) => `${variants}${important}${neg}${b}`;

  if (EXACT_MAP[rest] && !neg) return out(EXACT_MAP[rest]);

  for (const [phys, logical] of Object.entries(PREFIX_MAP)) {
    if (rest.startsWith(`${phys}-`) && rest.length > phys.length + 1) {
      return out(`${logical}${rest.slice(phys.length)}`);
    }
  }
  if (!neg) {
    for (const [phys, logical] of Object.entries(OPTIONAL_SUFFIX_MAP)) {
      if (rest === phys || rest.startsWith(`${phys}-`)) {
        return out(`${logical}${rest.slice(phys.length)}`);
      }
    }
  }
  return null;
}

/** Map every token of a class string; returns the new string + count of changed tokens. */
export function mapClassString(
  s: string,
  opts: { skipFirst?: boolean; skipLast?: boolean } = {},
): { text: string; changed: number } {
  const parts = s.split(/(\s+)/); // keeps whitespace separators
  let changed = 0;
  const tokenIdx = parts.map((p, i) => (i % 2 === 0 && p !== '' ? i : -1)).filter((i) => i >= 0);
  const firstTok = tokenIdx[0];
  const lastTok = tokenIdx[tokenIdx.length - 1];
  const startsAtEdge = s.length > 0 && !/^\s/.test(s);
  const endsAtEdge = s.length > 0 && !/\s$/.test(s);
  // `left-1/2 -translate-x-1/2` centering is direction-agnostic while both stay physical;
  // mapping only left/right would break centering in LTR. Keep the inset physical there.
  const hasTranslateX = tokenIdx.some((i) => /(^|:)-?translate-x-/.test(parts[i]));
  for (const i of tokenIdx) {
    if (hasTranslateX && /(^|:)!?-?(left|right)-/.test(parts[i])) continue;
    if (opts.skipFirst && i === firstTok && startsAtEdge) continue;
    if (opts.skipLast && i === lastTok && endsAtEdge) continue;
    const m = mapClassToken(parts[i]);
    if (m && m !== parts[i]) {
      parts[i] = m;
      changed++;
    }
  }
  return { text: parts.join(''), changed };
}

/** Tailwind classes that stay physical on purpose (reported, never rewritten). */
export const MANUAL_REVIEW_PATTERNS: RegExp[] = [
  /(^|:)-?space-x-/, // sibling margin-left; needs space-x-reverse logic
  /(^|:)divide-x/,
  /(^|:)origin-(left|right|top-left|top-right|bottom-left|bottom-right)/,
  /(^|:)-?translate-x-/, // pairs with left/right centering, direction-sensitive in LTR
  /(^|:)(from|to)-(left|right)/,
];

/** Lucide icons whose pointing direction should mirror in LTR. */
export const DIRECTIONAL_ICONS = new Set([
  'ChevronLeft',
  'ChevronRight',
  'ChevronsLeft',
  'ChevronsRight',
  'ArrowLeft',
  'ArrowRight',
  'MoveLeft',
  'MoveRight',
  'ArrowBigLeft',
  'ArrowBigRight',
  'CircleChevronLeft',
  'CircleChevronRight',
  'ArrowLeftCircle',
  'ArrowRightCircle',
]);

/** Class appended to directional icons: no-op under dir=rtl, mirrors under dir=ltr. */
export const ICON_MIRROR_CLASS = 'ltr:-scale-x-100';
