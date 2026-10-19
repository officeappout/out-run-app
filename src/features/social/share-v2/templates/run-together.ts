/**
 * Run · "יחד" (SH-5c): a live group / pair run — initials avatars, the
 * names, the joint distance, my time, and a bar per runner (distance +
 * pace) when their run is saved. Only offered when the model has `together`.
 */
import { drawRoute } from '../draw/route';
import { drawStatGrid, drawText, fillRound, hline, setFont, statHeight } from '../draw/primitives';
import { stackFromBottom } from '../layout';
import { CYAN, type SharePalette } from '../palette';
import type { ShareStatV2, ShareTogetherModel } from '../types';
import { drawHeader, STORY_BOTTOM_SCRIM } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';

const AV = 58;
const OVERLAP = 14;

function avatar(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, plain: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, AV / 2 + 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, AV / 2, 0, Math.PI * 2);
  if (plain) ctx.fillStyle = '#0b2230';
  else {
    const g = ctx.createLinearGradient(cx - AV / 2, cy - AV / 2, cx + AV / 2, cy + AV / 2);
    g.addColorStop(0, CYAN[0]);
    g.addColorStop(1, CYAN[1]);
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.restore();
  drawText(ctx, text, cx, cy - AV / 2, { size: 22, weight: 900, color: plain ? '#ffffff' : '#04222b', align: 'center', lineH: AV });
}

/** Avatars from the right edge, overlapping; returns the row's width. */
function avatarRow(ctx: CanvasRenderingContext2D, t: ShareTogetherModel, right: number, top: number): number {
  const items = [...t.avatars, ...(t.moreCount > 0 ? [`+${t.moreCount}`] : [])];
  // Draw from the last (left-most) so the first sits on top.
  for (let i = items.length - 1; i >= 0; i--) {
    const cx = right - AV / 2 - i * (AV - OVERLAP);
    avatar(ctx, cx, top + AV / 2, items[i], i >= t.avatars.length);
  }
  return items.length ? AV + (items.length - 1) * (AV - OVERLAP) : 0;
}

const PERSON_H = 30;

function personRows(ctx: CanvasRenderingContext2D, t: ShareTogetherModel, left: number, right: number, top: number, p: SharePalette) {
  t.people.forEach((person, i) => {
    const y = top + i * PERSON_H;
    const label = person.pace ? `${person.km} · ${person.pace}` : `${person.km ?? ''}`;
    drawText(ctx, person.name, right, y, { size: 15, weight: 800, color: p.fg, lineH: PERSON_H, maxW: 70 });
    setFont(ctx, 16, 900);
    const lw = ctx.measureText(label).width;
    drawText(ctx, label, left, y, { size: 16, weight: 900, color: p.fg, align: 'left', lineH: PERSON_H });
    const barRight = right - 80;
    const barLeft = left + lw + 12;
    const bw = Math.max(0, barRight - barLeft);
    if (bw > 20) {
      fillRound(ctx, barLeft, y + 10, bw, 10, 5, p.ringTrack);
      const fw = Math.max(10, bw * (person.frac ?? 0));
      const g = ctx.createLinearGradient(barRight, 0, barRight - fw, 0);
      g.addColorStop(0, CYAN[0]);
      g.addColorStop(1, CYAN[1]);
      fillRound(ctx, barRight - fw, y + 10, fw, 10, 5, g);
    }
  });
  return t.people.length * PERSON_H;
}

function draw(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const t = m.together;
  if (!t) return;
  const headerBottom = drawHeader(a);
  const pad = PAD.story;
  const left = pad;
  const right = frame.w - pad;
  const width = right - left;
  const big = t.jointKm ? { value: t.jointKm, unit: 'ק״מ ביחד' } : m.hero;
  const stats: ShareStatV2[] = [
    ...(t.jointKm && m.distance ? [{ value: m.distance, unit: 'ק״מ שלי' }] : []),
    m.duration,
    { value: String(t.participantCount), unit: 'רצים' },
  ].slice(0, 3);
  // More than two circles → the names go under the avatars instead of beside them.
  const crowded = t.avatars.length + (t.moreCount > 0 ? 1 : 0) > 2;
  const [avY, bigY, statsY, rowsY] = stackFromBottom(frame.h - 24, [
    { h: crowded ? AV + 6 + 44 : AV },
    { h: 80 * 0.95, gapAbove: 14 },
    { h: 14 + statHeight(38) + 14, gapAbove: 12 },
    { h: t.people.length * PERSON_H, gapAbove: 12 },
  ]);
  if (m.route) {
    const regionTop = headerBottom + 16;
    const regionH = avY - 16 - regionTop;
    const box = Math.min(frame.w - 40, regionH);
    if (box > 120) drawRoute(ctx, m.route, (frame.w - box) / 2, regionTop + (regionH - box) / 2, box, box, { ink: a.bg === 'photo' ? 'white' : p.routeInk, width: 5 });
  }
  const rowW = avatarRow(ctx, t, right, avY);
  const textRight = crowded ? right : right - rowW - 12;
  const textTop = crowded ? avY + AV + 6 : avY + 6;
  drawText(ctx, t.names, textRight, textTop, { size: 20, weight: 900, color: p.fg, lineH: 24, maxW: textRight - left });
  drawText(ctx, t.subline, textRight, textTop + 24, { size: 15, weight: 800, color: p.accentText, lineH: 20, maxW: textRight - left });
  const lineH = 80 * 0.95;
  const nw = drawText(ctx, big.value, right, bigY, { size: 80, weight: 900, color: p.fg, lineH });
  drawText(ctx, big.unit, right - nw - 10, bigY + lineH - 26 * 1.15 - 80 * 0.06, { size: 26, weight: 900, color: p.fg, lineH: 26 * 1.1 });
  hline(ctx, left, statsY, width, p.hairline);
  drawStatGrid(ctx, stats, left, width, statsY + 14, 38, p, { cols: stats.length });
  hline(ctx, left, statsY + 14 + statHeight(38) + 14, width, p.hairline);
  personRows(ctx, t, left, right, rowsY, p);
}

export const runTogether: ShareTemplateDef = {
  id: 'run-together',
  kind: 'cardio',
  label: 'יחד',
  formats: ['story'],
  brand: 'night',
  naturalBackground: (hasPhoto) => (hasPhoto ? 'photo' : 'brand'),
  scrims: () => [STORY_BOTTOM_SCRIM],
  available: (m) => !!m.together,
  draw,
};
