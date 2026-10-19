/**
 * Strength · "תמונה + נתונים" (SH-1a story, SH-3a square): the photo full
 * bleed, everything anchored to the bottom — chip, name (2 lines) + level
 * ring, three big numbers, the exercises with their set boxes.
 */
import { stackFromBottom, wrapLines } from '../layout';
import { drawChip, drawRing, drawSetRows, drawStatGrid, drawStreakLine, drawText, drawWrapped, hline, measureAt, ROW_H, statHeight } from '../draw/primitives';
import { drawHeader, SQUARE_BOTTOM_SCRIM, STORY_BOTTOM_SCRIM } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';

export function statValueSize(n: number, rows: number): number {
  if (rows > 0 || n >= 3) return 38;
  return n <= 1 ? 120 : 72;
}

function story(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  drawHeader(a);
  const pad = PAD.story;
  const left = pad;
  const right = frame.w - pad;
  const width = right - left;
  const ring = m.level ? 70 : 0;
  const nameW = width - (ring ? ring + 14 : 0);
  const nameLines = wrapLines(m.name, nameW, measureAt(ctx, 42, 900), 2).length;
  const nameH = Math.max(nameLines * 43, ring);
  const stats = m.stats.slice(0, 3);
  // Few facts → bigger numbers, so the image never looks empty.
  const vs = statValueSize(stats.length, m.rows.length);
  const statsH = stats.length ? 14 + statHeight(vs) + 14 : 0;
  const rowsH = m.rows.length * ROW_H;
  const foot = m.moreLine ? 'more' : m.streakDays ? 'streak' : null;
  const [chipY, nameY, statsY, rowsY, footY] = stackFromBottom(frame.h - 24, [
    { h: 30 },
    { h: nameH, gapAbove: 10 },
    { h: statsH, gapAbove: 16 },
    { h: rowsH, gapAbove: 10 },
    { h: foot ? 20 : 0, gapAbove: 8 },
  ]);
  drawChip(ctx, m.chip, right, chipY, p, width);
  const nameTop = nameY + (nameH - nameLines * 43) / 2;
  drawWrapped(ctx, m.name, right, nameTop, nameW, 2, { size: 42, weight: 900, color: p.fg, lineH: 43 });
  if (m.level) drawRing(ctx, left + ring / 2, nameY + nameH / 2, ring, m.level.frac, p, `${m.level.index}/${m.level.count}`, 'שלב');
  if (statsH) {
    hline(ctx, left, statsY, width, p.hairline);
    drawStatGrid(ctx, stats, left, width, statsY + 14, vs, p, { cols: stats.length });
    hline(ctx, left, statsY + statsH, width, p.hairline);
  }
  drawSetRows(ctx, m.rows, left, right, rowsY, p);
  if (foot === 'more') drawText(ctx, m.moreLine!, right, footY, { size: 15, weight: 800, color: p.accentText, lineH: 20 });
  if (foot === 'streak') drawStreakLine(ctx, m.streakDays!, right, footY, p.streakText);
}

function square(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const pad = PAD.square;
  const left = pad;
  const right = frame.w - pad;
  const width = right - left;
  drawHeader(a, { date: false });
  if (m.level) drawRing(ctx, left + 32, 20 + 32, 64, m.level.frac, p, `${m.level.index}/${m.level.count}`, 'שלב');
  const eyebrow = [m.name === 'אימון כוח' ? null : 'אימון כוח', m.dateLabel?.replace(' · ', ' ')].filter(Boolean).join(' · ');
  const nameLines = wrapLines(m.name, width, measureAt(ctx, 36, 900), 2).length;
  const stats = m.stats.slice(0, 3);
  const footer = m.exerciseNames ?? m.moreLine;
  const [eyeY, nameY, statsY, footY] = stackFromBottom(frame.h - 18, [
    { h: 20 },
    { h: nameLines * 38, gapAbove: 2 },
    { h: stats.length ? 12 + statHeight(32) : 0, gapAbove: 12 },
    { h: footer ? 18 : 0, gapAbove: 10 },
  ]);
  drawText(ctx, eyebrow, right, eyeY, { size: 15, weight: 800, color: p.accentText, lineH: 20, maxW: width });
  drawWrapped(ctx, m.name, right, nameY, width, 2, { size: 36, weight: 900, color: p.fg, lineH: 38 });
  if (stats.length) {
    hline(ctx, left, statsY, width, p.hairline);
    drawStatGrid(ctx, stats, left, width, statsY + 12, 32, p, { cols: 3 });
  }
  if (footer) drawText(ctx, footer, right, footY, { size: 14.5, weight: 800, color: p.sub, lineH: 18, maxW: width });
}

export const strengthPhoto: ShareTemplateDef = {
  id: 'strength-photo',
  kind: 'strength',
  label: 'תמונה + נתונים',
  formats: ['story', 'square'],
  brand: 'navy',
  naturalBackground: (hasPhoto) => (hasPhoto ? 'photo' : 'brand'),
  scrims: (f) => [f === 'story' ? STORY_BOTTOM_SCRIM : SQUARE_BOTTOM_SCRIM],
  focal: [0.5, 0.35],
  draw: (a) => (a.frame.format === 'square' ? square(a) : story(a)),
};
