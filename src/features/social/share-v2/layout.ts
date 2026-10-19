/**
 * Layout maths for the share templates — measured, bottom-up, never a fixed
 * y. Pure (text is measured through a callback), unit-tested.
 */

export type Measure = (text: string) => number;

export interface Block {
  h: number;
  /** Space above this block (ignored for the first one). */
  gapAbove?: number;
}

/**
 * Stack blocks (listed top → bottom) so the last one ends at `bottom`.
 * Returns each block's top y, in the same order. Zero-height blocks take no
 * gap — a dropped section leaves no hole.
 */
export function stackFromBottom(bottom: number, blocks: Block[]): number[] {
  const tops = new Array<number>(blocks.length);
  let y = bottom;
  let lower: Block | null = null;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.h <= 0) {
      tops[i] = y;
      continue;
    }
    if (lower) y -= lower.gapAbove ?? 0;
    y -= b.h;
    tops[i] = y;
    lower = b;
  }
  return tops;
}

/** Same, top → down from `top`. */
export function stackFromTop(top: number, blocks: Block[]): number[] {
  const tops: number[] = [];
  let y = top;
  let above = false;
  for (const b of blocks) {
    if (b.h <= 0) {
      tops.push(y);
      continue;
    }
    if (above) y += b.gapAbove ?? 0;
    tops.push(y);
    y += b.h;
    above = true;
  }
  return tops;
}

/** Total height of a stack (gaps between non-empty blocks only). */
export function stackHeight(blocks: Block[]): number {
  let h = 0;
  let any = false;
  for (const b of blocks) {
    if (b.h <= 0) continue;
    h += b.h + (any ? b.gapAbove ?? 0 : 0);
    any = true;
  }
  return h;
}

/**
 * Word-wrap into at most `maxLines`; the last line gets "…" when text is
 * left over. A single over-long word is cut by characters.
 */
export function wrapLines(text: string, maxW: number, measure: Measure, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (measure(next) <= maxW) {
      cur = next;
      continue;
    }
    if (!cur) {
      cur = ellipsize(words[i], maxW, measure);
      if (lines.length + 1 === maxLines) break;
      lines.push(cur);
      cur = '';
      continue;
    }
    if (lines.length + 1 === maxLines) break;
    lines.push(cur);
    cur = measure(words[i]) <= maxW ? words[i] : ellipsize(words[i], maxW, measure);
  }
  if (cur) {
    const rest = i < words.length;
    lines.push(rest ? ellipsize(`${cur}…`, maxW, measure, true) : cur);
  }
  return lines.slice(0, maxLines);
}

/** Cut characters until it fits, ending with "…". */
export function ellipsize(text: string, maxW: number, measure: Measure, force = false): string {
  if (!force && measure(text) <= maxW) return text;
  let base = text.endsWith('…') ? text.slice(0, -1) : text;
  if (measure(`${base}…`) <= maxW) return `${base}…`;
  while (base.length > 1 && measure(`${base}…`) > maxW) base = base.slice(0, -1);
  return `${base.trimEnd()}…`;
}

/** Largest font size in [min, start] (step 2) at which `text` fits `maxW`. */
export function fitFontSize(text: string, maxW: number, start: number, min: number, measureAt: (size: number) => number): number {
  for (let s = start; s > min; s -= 2) if (measureAt(s) <= maxW) return s;
  return min;
}

/** Right edges of `n` equal RTL columns across [left, left + width]. */
export function rtlColumns(left: number, width: number, n: number): { right: number; w: number }[] {
  const w = width / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({ right: left + width - i * w, w }));
}

/**
 * Source rect for drawing an image "cover" into a box, with a focal point
 * (fx, fy as 0..1 of the image) kept in view — default centre-top 40% so a
 * person's head isn't cut.
 */
export function coverRectFocal(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  fx = 0.5,
  fy = 0.4,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const sw = boxW / scale;
  const sh = boxH / scale;
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));
  return { sx: clamp(imgW * fx - sw / 2, imgW - sw), sy: clamp(imgH * fy - sh / 2, imgH - sh), sw, sh };
}
