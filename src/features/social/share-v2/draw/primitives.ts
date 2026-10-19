/**
 * Canvas drawing helpers shared by every share template (design units; the
 * renderer has already scaled the context). Text is drawn with
 * textBaseline 'middle' from a TOP y + line box, like the boards' CSS.
 */
import { ellipsize, wrapLines } from '../layout';
import type { SharePalette } from '../palette';
import type { ShareSetRow, ShareStatV2 } from '../types';

export const FONT = "'Simpler Pro', 'Heebo', system-ui, sans-serif";
type Ctx = CanvasRenderingContext2D;

export function setFont(ctx: Ctx, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

export function measureAt(ctx: Ctx, size: number, weight: number) {
  return (s: string) => {
    setFont(ctx, size, weight);
    return ctx.measureText(s).width;
  };
}

const HEBREW = /[֐-׿]/;

export interface TextOpts {
  size: number;
  weight: number;
  color: string | CanvasGradient;
  align?: CanvasTextAlign;
  maxW?: number;
  /** Line box (CSS line-height × size); default size × 1.1. */
  lineH?: number;
}

/** One line, top-anchored; ellipsized to maxW. Numbers draw LTR. Returns its width. */
export function drawText(ctx: Ctx, text: string, x: number, top: number, o: TextOpts): number {
  setFont(ctx, o.size, o.weight);
  const s = o.maxW ? ellipsize(text, o.maxW, (t) => ctx.measureText(t).width) : text;
  ctx.save();
  ctx.direction = HEBREW.test(s) ? 'rtl' : 'ltr';
  ctx.textAlign = o.align ?? 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color;
  const lh = o.lineH ?? o.size * 1.1;
  ctx.fillText(s, x, top + lh / 2 + o.size * 0.04);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** Up to `maxLines` wrapped lines; returns the block height. */
export function drawWrapped(ctx: Ctx, text: string, x: number, top: number, maxW: number, maxLines: number, o: TextOpts): number {
  const lines = wrapLines(text, maxW, measureAt(ctx, o.size, o.weight), maxLines);
  const lh = o.lineH ?? o.size * 1.05;
  lines.forEach((l, i) => drawText(ctx, l, x, top + i * lh, { ...o, lineH: lh }));
  return lines.length * lh;
}

export function wrappedHeight(ctx: Ctx, text: string, maxW: number, maxLines: number, size: number, weight: number, lineH = size * 1.05) {
  return wrapLines(text, maxW, measureAt(ctx, size, weight), maxLines).length * lineH;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRound(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A CSS-like linear-gradient(deg) across a box. */
export function cssGradient(ctx: Ctx, x: number, y: number, w: number, h: number, deg: number, stops: [number, string][]) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function hline(ctx: Ctx, x: number, y: number, w: number, color: string, lw = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - lw / 2, w, lw);
}

/** Text filled with a gradient (the minimal templates' hero number). */
export function drawGradientText(ctx: Ctx, text: string, x: number, top: number, size: number, weight: number, colors: [string, string], align: CanvasTextAlign = 'center') {
  setFont(ctx, size, weight);
  const w = ctx.measureText(text).width;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const g = ctx.createLinearGradient(left, top, left + w, top + size);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  drawText(ctx, text, x, top, { size, weight, color: g, align, lineH: size * 0.9 });
}

/** Level ring: track + gradient arc from 12 o'clock + "4/12" / "שלב". */
export function drawRing(ctx: Ctx, cx: number, cy: number, size: number, frac: number, p: SharePalette, label: string, unit: string) {
  const r = size / 2 - 3;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = p.ringTrack;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (frac > 0) {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#00baf7');
    g.addColorStop(1, '#0cf2e3');
    ctx.strokeStyle = p.tone === 'cyan' ? '#ffffff' : g;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
    ctx.stroke();
  }
  ctx.restore();
  const vs = size * 0.27;
  drawText(ctx, label, cx, cy - vs * 0.95, { size: vs, weight: 900, color: p.fg, align: 'center', lineH: vs });
  drawText(ctx, unit, cx, cy + vs * 0.15, { size: 14.5, weight: 800, color: p.sub, align: 'center', lineH: 16 });
}

/** One row of per-set boxes, RTL from `right`; centred text in each. Returns its width. */
export function drawSetBoxes(ctx: Ctx, boxes: (string | null)[], right: number, top: number, size: number, p: SharePalette): number {
  const gap = 5;
  boxes.forEach((b, i) => {
    const x = right - (i + 1) * size - i * gap;
    if (b !== null) {
      const g = ctx.createLinearGradient(x, top, x + size, top + size);
      g.addColorStop(0, p.boxFill[0]);
      g.addColorStop(1, p.boxFill[1]);
      fillRound(ctx, x, top, size, size, size * 0.3, g);
    } else {
      roundRect(ctx, x + 1, top + 1, size - 2, size - 2, size * 0.28);
      ctx.strokeStyle = p.emptyRing;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawText(ctx, b ?? '–', x + size / 2, top, { size: 14.5, weight: 900, color: b !== null ? p.boxText : p.emptyText, align: 'center', lineH: size });
  });
  return boxes.length ? boxes.length * size + (boxes.length - 1) * gap : 0;
}

export const ROW_H = 34;

/** Exercise rows: name on the right, boxes on the left. Returns the height. */
export function drawSetRows(ctx: Ctx, rows: ShareSetRow[], left: number, right: number, top: number, p: SharePalette, opts: { rowH?: number; box?: number; nameSize?: number; dividers?: string } = {}): number {
  const rowH = opts.rowH ?? ROW_H;
  const box = opts.box ?? 26;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i > 0 && opts.dividers) hline(ctx, left, y, right - left, opts.dividers);
    const boxesW = (r.boxes.length ? r.boxes.length * box + (r.boxes.length - 1) * 5 : 0);
    drawSetBoxes(ctx, r.boxes, left + boxesW, y + (rowH - box) / 2, box, p);
    drawText(ctx, r.name, right, y, { size: opts.nameSize ?? 16, weight: 800, color: p.fg, lineH: rowH, maxW: right - left - boxesW - 10 });
  });
  return rows.length * rowH;
}

/** Stat grid (RTL columns): big value + small unit under it. Returns its height. */
export function drawStatGrid(ctx: Ctx, stats: ShareStatV2[], left: number, width: number, top: number, valueSize: number, p: SharePalette, opts: { align?: 'right' | 'center'; cols?: number } = {}): number {
  const n = opts.cols ?? stats.length;
  const w = width / Math.max(1, n);
  stats.slice(0, n).forEach((s, i) => {
    const colRight = left + width - i * w;
    const x = opts.align === 'center' ? colRight - w / 2 : colRight;
    drawText(ctx, s.value, x, top, { size: valueSize, weight: 900, color: p.fg, align: opts.align ?? 'right', lineH: valueSize, maxW: w - 8 });
    drawText(ctx, s.unit, x, top + valueSize + 5, { size: 15, weight: 700, color: p.sub, align: opts.align ?? 'right', lineH: 18, maxW: w - 8 });
  });
  return statHeight(valueSize);
}

export const statHeight = (valueSize: number) => valueSize + 5 + 18;

/** Pill chip ("אימון כוח · גינת מאיר"), right-anchored. Returns its height. */
export function drawChip(ctx: Ctx, text: string, right: number, top: number, p: SharePalette, maxW: number): number {
  const h = 30;
  setFont(ctx, 15, 800);
  const label = ellipsize(text, maxW - 24, (t) => ctx.measureText(t).width);
  const w = ctx.measureText(label).width + 24;
  fillRound(ctx, right - w, top, w, h, h / 2, p.chipBg);
  roundRect(ctx, right - w + 0.75, top + 0.75, w - 1.5, h - 1.5, h / 2);
  ctx.strokeStyle = p.chipRing;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawText(ctx, label, right - 12, top, { size: 15, weight: 800, color: p.fg, lineH: h });
  return h;
}

/** A small pill (the date on photo templates). */
export function drawPill(ctx: Ctx, text: string, x: number, top: number, align: 'left' | 'right', fill: string, color: string): void {
  setFont(ctx, 14.5, 800);
  const w = ctx.measureText(text).width + 24;
  const left = align === 'left' ? x : x - w;
  fillRound(ctx, left, top, w, 30, 15, fill);
  drawText(ctx, text, left + w / 2, top, { size: 14.5, weight: 800, color, align: 'center', lineH: 30 });
}

const FLAME = lazyPath('M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z');

/** The streak flame (24-unit icon) at (x, y) top-left, `size` wide. */
export function drawFlame(ctx: Ctx, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(FLAME.get());
  ctx.restore();
}

/** "🔥 6 ימים ברצף" line, right-anchored. Returns the height. */
export function drawStreakLine(ctx: Ctx, days: number, right: number, top: number, color: string): number {
  const label = `${days} ימים ברצף`;
  drawFlame(ctx, right - 17, top + 1, 17, '#fb923c');
  drawText(ctx, label, right - 23, top, { size: 15, weight: 800, color, lineH: 20 });
  return 20;
}

/** Pace bars (faster = taller), the fastest one in turquoise with its time. Returns height. */
export function drawPaceBars(ctx: Ctx, heights: number[], fastest: number, fastestLabel: string, left: number, width: number, top: number, barsH: number, p: SharePalette): number {
  const n = heights.length;
  const gap = n > 7 ? 5 : 8;
  const bw = (width - gap * (n - 1)) / n;
  const labelH = 20;
  const base = top + barsH;
  heights.forEach((hgt, i) => {
    const x = left + width - (i + 1) * bw - i * gap;
    const bh = Math.max(10, (barsH - 20) * hgt);
    const g = ctx.createLinearGradient(0, base - bh, 0, base);
    const fast = i === fastest;
    g.addColorStop(0, fast ? '#0cf2e3' : '#a3e635');
    g.addColorStop(1, fast ? '#00baf7' : '#65a30d');
    fillRound(ctx, x, base - bh, bw, bh, Math.min(8, bw / 2), g);
    if (fast) drawText(ctx, fastestLabel, x + bw / 2, base - bh - 20, { size: 14.5, weight: 900, color: p.tone === 'dark' ? '#0cf2e3' : '#0284c7', align: 'center', lineH: 17 });
    drawText(ctx, String(i + 1), x + bw / 2, base + 4, { size: 14.5, weight: 800, color: p.sub, align: 'center', lineH: 16 });
  });
  return barsH + labelH;
}

/** Path2D built on first use (tests import this module without a DOM). */
function lazyPath(d: string) {
  let p: Path2D | null = null;
  return { get: () => (p ??= new Path2D(d)) };
}
