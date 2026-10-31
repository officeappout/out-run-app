/**
 * Five more transparent stickers (enable_workout_post_v1, board PostStickers), all in the
 * 300-unit sticker box with the chosen ink, the logo at the bottom:
 *   list      bullet rows of the workout's facts (every kind, up to 6)
 *   chips     the same facts as pills (every kind)
 *   day       the weekday and date big, the workout's name under it
 *   side      run / walk: the big number on one side, the facts on the other
 *   combined  combined workouts: the name, total time and one block per part
 */
import { drawLogo, logoHeight } from '../draw/logo';
import { drawText, roundRect, setFont } from '../draw/primitives';
import { centeredBigNumber, STICKER_BOX, withStickerBox } from './sticker-common';
import type { DrawArgs, ShareTemplateDef } from './template';
import type { ShareKind, ShareModel } from '../types';
import { shareT } from '../copy';

const LOGO_W = 64;
const B = STICKER_BOX;

function logoAtBottom(a: DrawArgs) {
  drawLogo(a.ctx, (B - LOGO_W) / 2, B - 6 - logoHeight(LOGO_W), LOGO_W, a.palette);
}

/** "4.1 ק״מ", "6:13 דק׳ לק״מ", "25:30 זמן", "רמה 4": the stats, the time, the level. */
export function stickerFacts(m: ShareModel, max = 6): string[] {
  const out = m.stats.map((s) => `${s.value} ${s.unit}`.trim());
  const time = `${m.duration.value} ${m.duration.unit}`.trim();
  if (!out.includes(time)) out.push(time);
  if (m.level) out.push(shareT('shareV2.stage.n', { index: m.level.index }));
  return out.filter(Boolean).slice(0, max);
}

function strokePill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawList(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const facts = stickerFacts(m);
    const rowH = 34;
    let y = (B - 40 - facts.length * rowH) / 2;
    for (const f of facts) {
      ctx.beginPath();
      ctx.arc(B - 34, y + rowH / 2, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.fg;
      ctx.fill();
      drawText(ctx, f, B - 48, y, { size: 21, weight: 900, color: p.fg, lineH: rowH, maxW: B - 80 });
      y += rowH;
    }
    logoAtBottom(a);
  });
}

function drawChips(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const facts = stickerFacts(m);
    const h = 36;
    const gap = 8;
    const lines: string[][] = [[]];
    let lineW = 0;
    setFont(ctx, 17, 900);
    for (const f of facts) {
      const w = ctx.measureText(f).width + 28;
      if (lineW + w > B - 24 && lines[lines.length - 1].length) { lines.push([]); lineW = 0; }
      lines[lines.length - 1].push(f);
      lineW += w + gap;
    }
    let y = (B - 40 - lines.length * (h + gap)) / 2;
    for (const line of lines) {
      setFont(ctx, 17, 900);
      const widths = line.map((f) => ctx.measureText(f).width + 28);
      const total = widths.reduce((s, w) => s + w, 0) + gap * (line.length - 1);
      let x = (B + total) / 2;
      line.forEach((f, i) => {
        x -= widths[i];
        strokePill(ctx, x, y, widths[i], h, p.fg);
        drawText(ctx, f, x + widths[i] / 2, y, { size: 17, weight: 900, color: p.fg, align: 'center', lineH: h });
        x -= gap;
      });
      y += h + gap;
    }
    logoAtBottom(a);
  });
}

function drawDay(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    const [day, rest] = (m.dateLabel ?? '').split(' · ');
    let y = 46;
    drawText(ctx, day || m.name, B / 2, y, { size: 58, weight: 900, color: p.fg, align: 'center', lineH: 62, maxW: B - 20 });
    y += 66;
    if (rest) { drawText(ctx, rest, B / 2, y, { size: 22, weight: 800, color: p.sub, align: 'center', lineH: 28 }); y += 34; }
    drawText(ctx, m.name, B / 2, y + 6, { size: 22, weight: 900, color: p.fg, align: 'center', lineH: 28, maxW: B - 30 });
    logoAtBottom(a);
  });
}

function drawSide(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    centeredBigNumber(a, B * 0.27, 70, 66, 20);
    const facts = stickerFacts(m, 4).filter((f) => !f.startsWith(m.hero.value));
    let y = 60;
    drawText(ctx, m.name, B - 16, y, { size: 19, weight: 900, color: p.fg, lineH: 24, maxW: B * 0.46 });
    y += 32;
    for (const f of facts) {
      drawText(ctx, f, B - 16, y, { size: 17, weight: 800, color: p.sub, lineH: 24, maxW: B * 0.46 });
      y += 26;
    }
    ctx.fillStyle = p.hairline;
    ctx.fillRect(B * 0.52, 58, 2, Math.max(60, y - 58));
    logoAtBottom(a);
  });
}

function drawCombined(a: DrawArgs) {
  withStickerBox(a, () => {
    const { ctx, model: m, palette: p } = a;
    drawText(ctx, `${m.name} · ${m.hero.value} ${m.hero.unit}`, B / 2, 50, { size: 21, weight: 900, color: p.fg, align: 'center', lineH: 28, maxW: B - 24 });
    const parts = m.stats.slice(0, 3);
    const gap = 6;
    const w = (B - 24 - gap * (parts.length - 1)) / Math.max(1, parts.length);
    parts.forEach((s, i) => {
      const x = B - 12 - (i + 1) * w - i * gap;
      strokePill(ctx, x, 100, w, 64, p.fg);
      drawText(ctx, s.value, x + w / 2, 104, { size: 26, weight: 900, color: p.fg, align: 'center', lineH: 30 });
      drawText(ctx, s.unit, x + w / 2, 134, { size: 14, weight: 800, color: p.sub, align: 'center', lineH: 22, maxW: w - 10 });
    });
    logoAtBottom(a);
  });
}

function sticker(kind: ShareKind, id: string, labelKey: Parameters<typeof shareT>[0], draw: (a: DrawArgs) => void, need: (m: ShareModel) => boolean): ShareTemplateDef {
  return {
    id: `${kind}-sticker-${id}`,
    kind,
    get label() { return shareT(labelKey); },
    formats: ['sticker'],
    brand: kind === 'cardio' ? 'night' : 'navy',
    naturalBackground: () => 'none',
    available: (m) => !!m.postV1 && need(m),
    draw,
  };
}

const any = () => true;
const isCombined = (m: ShareModel) => !!m.combined;
const notCombined = (m: ShareModel) => !m.combined;

export const STICKERS_STRENGTH: ShareTemplateDef[] = [
  sticker('strength', 'list', 'shareV2.template.list', drawList, any),
  sticker('strength', 'chips', 'shareV2.template.chips', drawChips, any),
  sticker('strength', 'day', 'shareV2.template.day', drawDay, any),
  sticker('strength', 'combined', 'shareV2.template.combined', drawCombined, isCombined),
];

export const STICKERS_CARDIO: ShareTemplateDef[] = [
  sticker('cardio', 'list', 'shareV2.template.list', drawList, any),
  sticker('cardio', 'chips', 'shareV2.template.chips', drawChips, any),
  sticker('cardio', 'day', 'shareV2.template.day', drawDay, any),
  sticker('cardio', 'side', 'shareV2.template.side', drawSide, notCombined),
  sticker('cardio', 'combined', 'shareV2.template.combined', drawCombined, isCombined),
];
