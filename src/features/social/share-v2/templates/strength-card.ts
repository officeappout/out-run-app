/**
 * Strength · "כרטיס" (SH-1b story, SH-3b square): OUT-colours background
 * with the O watermark, the name on it, and a white card holding the
 * numbers (2×2 / 3 in a row), the level bar, the exercises and the streak.
 */
import { drawLogo, logoHeight } from '../draw/logo';
import {
  drawFlame,
  drawSetRows,
  drawText,
  drawWrapped,
  fillRound,
  measureAt,
  setFont,
} from '../draw/primitives';
import { stackHeight, wrapLines } from '../layout';
import { CYAN, paletteFor, type SharePalette } from '../palette';
import type { ShareStatV2 } from '../types';
import { drawHeader } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';

const TILE_BG = '#f1f9fd';

function tiles(ctx: CanvasRenderingContext2D, stats: ShareStatV2[], left: number, width: number, top: number, cols: number, vs: number, p: SharePalette, gap: number, padY: number): number {
  const tileH = padY * 2 + vs + 4 + 18;
  const w = (width - gap * (cols - 1)) / cols;
  stats.forEach((s, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = left + width - (c + 1) * w - c * gap;
    const y = top + r * (tileH + gap);
    fillRound(ctx, x, y, w, tileH, cols === 2 ? 18 : 14, TILE_BG);
    drawText(ctx, s.value, x + w - 14, y + padY, { size: vs, weight: 900, color: p.fg, lineH: vs, maxW: w - 20 });
    drawText(ctx, s.unit, x + w - 14, y + padY + vs + 4, { size: 15, weight: 700, color: p.sub, lineH: 18, maxW: w - 20 });
  });
  const rows = Math.ceil(stats.length / cols);
  return rows ? rows * tileH + (rows - 1) * gap : 0;
}

function levelBar(ctx: CanvasRenderingContext2D, index: number, count: number, frac: number, left: number, width: number, top: number) {
  drawText(ctx, `שלב ${index} מתוך ${count}`, left + width, top, { size: 15, weight: 800, color: '#0284c7', lineH: 20 });
  drawText(ctx, `${Math.round(frac * 100)}%`, left, top, { size: 15, weight: 800, color: '#4b5a66', align: 'left', lineH: 20 });
  fillRound(ctx, left, top + 26, width, 10, 5, '#e3f3fa');
  const fw = Math.max(10, width * frac);
  const g = ctx.createLinearGradient(left + width, 0, left + width - fw, 0);
  g.addColorStop(0, CYAN[0]);
  g.addColorStop(1, CYAN[1]);
  fillRound(ctx, left + width - fw, top + 26, fw, 10, 5, g);
}

function streakBox(ctx: CanvasRenderingContext2D, days: number, left: number, width: number, top: number) {
  fillRound(ctx, left, top, width, 52, 18, '#fff4e5');
  const ix = left + width - 12 - 36;
  const g = ctx.createLinearGradient(ix, top + 8, ix + 36, top + 44);
  g.addColorStop(0, '#fb923c');
  g.addColorStop(1, '#f97316');
  fillRound(ctx, ix, top + 8, 36, 36, 12, g);
  drawFlame(ctx, ix + 7, top + 15, 22, '#ffffff');
  drawText(ctx, `${days} ימים ברצף`, ix - 10, top, { size: 19, weight: 900, color: '#c2410c', lineH: 52 });
}

function story(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const pad = PAD.story;
  drawHeader(a);
  const right = frame.w - pad;
  const eyebrow = [m.name === 'אימון כוח' ? null : 'אימון כוח', m.level && `שלב ${m.level.index} מתוך ${m.level.count}`].filter(Boolean).join(' · ');
  const nameLines = wrapLines(m.name, frame.w - pad * 2, measureAt(ctx, 44, 900), 2).length;
  const headH = 22 + nameLines * 46;

  const card = { left: 18, w: frame.w - 36, padX: 16, padY: 14 };
  const inW = card.w - card.padX * 2;
  const stats = m.stats.slice(0, 4);
  const lp = paletteFor('light', 'strength');
  const cols = stats.length === 1 ? 1 : 2;
  const tileVs = m.rows.length || stats.length > 2 ? 32 : 64;
  const tileRows = Math.ceil(stats.length / cols);
  const parts = [
    { h: tileRows ? tileRows * (10 * 2 + tileVs + 4 + 18) + (tileRows - 1) * 8 : 0 },
    { h: m.level ? 36 : 0, gapAbove: 12 },
    { h: m.rows.length * 36, gapAbove: 10 },
    { h: m.moreLine ? 20 : 0, gapAbove: 4 },
    { h: m.streakDays ? 52 : 0, gapAbove: 8 },
  ];
  const cardH = stackHeight(parts) + card.padY * 2;
  const total = headH + 18 + cardH;
  // Centre the whole block in the space under the header (never above y=84).
  const top = Math.max(84, (frame.h - total) / 2 + 20);
  drawText(ctx, eyebrow, right, top, { size: 16, weight: 800, color: p.sub, lineH: 20, maxW: frame.w - pad * 2 });
  drawWrapped(ctx, m.name, right, top + 22, frame.w - pad * 2, 2, { size: 44, weight: 900, color: p.fg, lineH: 46 });

  const cy = top + headH + 18;
  ctx.save();
  ctx.shadowColor = 'rgba(2,60,90,0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  fillRound(ctx, card.left, cy, card.w, cardH, 28, '#ffffff');
  ctx.restore();
  const l = card.left + card.padX;
  let y = cy + card.padY;
  y += tiles(ctx, stats, l, inW, y, cols, tileVs, lp, 8, 10);
  if (m.level) {
    y += 12;
    levelBar(ctx, m.level.index, m.level.count, m.level.frac, l, inW, y);
    y += 36;
  }
  if (m.rows.length) {
    y += 10;
    y += drawSetRows(ctx, m.rows, l, l + inW, y, lp, { rowH: 36, nameSize: 16.5, dividers: '#edf3f7' });
  }
  if (m.moreLine) {
    y += 4;
    drawText(ctx, m.moreLine, l + inW, y, { size: 15, weight: 800, color: '#0284c7', lineH: 20 });
    y += 20;
  }
  if (m.streakDays) streakBox(ctx, m.streakDays, l - 4, inW + 8, y + 8);
}

function square(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const pad = 18;
  const lw = 60;
  drawLogo(ctx, pad, 18 + (48 - logoHeight(lw)) / 2, lw, p);
  const textW = frame.w - pad * 2 - lw - 14;
  const eyebrow = [m.name === 'אימון כוח' ? null : 'אימון כוח', m.level ? `שלב ${m.level.index} מתוך ${m.level.count}` : m.dateLabel].filter(Boolean).join(' · ');
  drawText(ctx, eyebrow, frame.w - pad, 18, { size: 14.5, weight: 800, color: p.sub, lineH: 18, maxW: textW });
  drawText(ctx, m.name, frame.w - pad, 37, { size: 30, weight: 900, color: p.fg, lineH: 32, maxW: textW });

  const lp = paletteFor('light', 'strength');
  const card = { x: 14, y: 100, w: frame.w - 28, h: frame.h - 114 };
  ctx.save();
  ctx.shadowColor = 'rgba(2,60,90,0.35)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  fillRound(ctx, card.x, card.y, card.w, card.h, 24, '#ffffff');
  ctx.restore();
  const l = card.x + 14;
  const inW = card.w - 28;
  let y = card.y + 12;
  y += tiles(ctx, m.stats.slice(0, 3), l, inW, y, 3, 28, lp, 6, 8);
  const bottomRow = m.streakDays ? 28 : 0;
  const room = card.y + card.h - 12 - bottomRow - (bottomRow ? 6 : 0) - (y + 6);
  const rows = m.rows.slice(0, Math.max(0, Math.floor(room / 32)));
  if (rows.length) drawSetRows(ctx, rows, l, l + inW, y + 6, lp, { rowH: 32, box: 24, nameSize: 15, dividers: '#edf3f7' });
  else if (m.exerciseNames) drawText(ctx, m.exerciseNames, l + inW, y + 12, { size: 14.5, weight: 800, color: lp.sub, lineH: 18, maxW: inW });
  if (m.streakDays) {
    const by = card.y + card.h - 12 - 28;
    const label = `${m.streakDays} ימים ברצף`;
    setFont(ctx, 14.5, 900);
    const w = ctx.measureText(label).width + 42;
    fillRound(ctx, l + inW - w, by, w, 28, 14, '#fff4e5');
    drawFlame(ctx, l + inW - 25, by + 6.5, 15, '#f97316');
    drawText(ctx, label, l + inW - 31, by, { size: 14.5, weight: 900, color: '#c2410c', lineH: 28 });
  }
}

export const strengthCard: ShareTemplateDef = {
  id: 'strength-card',
  kind: 'strength',
  label: 'כרטיס',
  formats: ['story', 'square'],
  brand: 'cyan',
  naturalBackground: () => 'brand',
  scrims: () => [{ deg: 180, stops: [[0, 'rgba(4,12,18,0.6)'], [0.4, 'rgba(4,12,18,0.35)'], [1, 'rgba(4,12,18,0.55)']] }],
  draw: (a) => (a.frame.format === 'square' ? square(a) : story(a)),
};
