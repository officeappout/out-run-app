/**
 * Run · "מסלול על תמונה" (SH-2a story, SH-3c square): the photo full bleed,
 * the route line in white with a turquoise glow, a huge distance and
 * pace · time · fastest lap. Square: route on the left, numbers in a column
 * on the right (RTL).
 */
import { drawRoute } from '../draw/route';
import { drawChip, drawStatGrid, drawStreakLine, drawText, hline, statHeight } from '../draw/primitives';
import { drawLogo } from '../draw/logo';
import { stackFromBottom } from '../layout';
import { drawBigNumber, drawHeader } from './common';
import { PAD, type DrawArgs, type ShareTemplateDef } from './template';

const routeInk = (a: DrawArgs) => (a.bg === 'photo' ? 'white' : a.palette.routeInk);

function story(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  const headerBottom = drawHeader(a);
  const pad = PAD.story;
  const left = pad;
  const right = frame.w - pad;
  const width = right - left;
  const stats = m.stats.filter((s) => s.unit !== m.hero.unit).slice(0, 3);
  const [chipY, bigY, statsY, streakY] = stackFromBottom(frame.h - 24, [
    { h: 30 },
    { h: 112 * 0.95, gapAbove: 8 },
    { h: stats.length ? 14 + statHeight(34) : 0, gapAbove: 14 },
    { h: m.streakDays ? 20 : 0, gapAbove: 14 },
  ]);
  if (m.route) {
    const regionTop = headerBottom + 16;
    const regionH = chipY - 16 - regionTop;
    const box = Math.min(frame.w - 20, regionH);
    if (box > 120) drawRoute(ctx, m.route, (frame.w - box) / 2, regionTop + (regionH - box) / 2, box, box, { ink: routeInk(a), width: 5 });
  }
  drawChip(ctx, m.chip, right, chipY, p, width);
  drawBigNumber(a, right, bigY, 112, 30);
  if (stats.length) {
    hline(ctx, left, statsY, width, p.hairline);
    drawStatGrid(ctx, stats, left, width, statsY + 14, 34, p, { cols: 3 });
  }
  if (m.streakDays) drawStreakLine(ctx, m.streakDays, right, streakY, p.streakText);
}

function square(a: DrawArgs) {
  const { ctx, frame, model: m, palette: p } = a;
  if (m.route) drawRoute(ctx, m.route, -6, 60, 230, 236, { ink: routeInk(a), width: 6 });
  drawLogo(ctx, 20, 20, 62, p);
  const right = frame.w - 20;
  const colW = 170;
  drawText(ctx, m.name, right, 22, { size: 15, weight: 800, color: p.accentText, lineH: 20, maxW: colW });
  let y = 42;
  if (m.dateLabel) {
    drawText(ctx, m.dateLabel, right, y, { size: 14.5, weight: 700, color: p.sub, lineH: 18, maxW: colW });
    y += 18;
  }
  y += 16;
  drawBigNumber(a, right, y, 76, 22);
  y += 76 * 0.95 + 16;
  m.stats
    .filter((s) => s.unit !== m.hero.unit)
    .slice(0, 2)
    .forEach((s) => {
      drawStatGrid(ctx, [s], right - colW, colW, y, 30, p, { cols: 1 });
      y += statHeight(30) + 12;
    });
  if (m.streakDays && y + 20 < frame.h - 18) drawStreakLine(ctx, m.streakDays, right, frame.h - 18 - 20, p.streakText);
}

export const runPhotoRoute: ShareTemplateDef = {
  id: 'run-photo-route',
  kind: 'cardio',
  label: 'מסלול על תמונה',
  formats: ['story', 'square'],
  brand: 'night',
  naturalBackground: (hasPhoto) => (hasPhoto ? 'photo' : 'brand'),
  scrims: (f) =>
    f === 'story'
      ? [{ deg: 180, stops: [[0, 'rgba(4,12,18,0.6)'], [0.22, 'rgba(4,12,18,0.25)'], [0.5, 'rgba(4,12,18,0.3)'], [0.7, 'rgba(4,12,18,0.85)'], [1, 'rgba(4,12,18,0.96)']] }]
      : [
          { deg: 90, stops: [[0, 'rgba(4,12,18,0.35)'], [0.35, 'rgba(4,12,18,0.3)'], [0.68, 'rgba(4,12,18,0.85)'], [1, 'rgba(4,12,18,0.95)']] },
          { deg: 180, stops: [[0, 'rgba(4,12,18,0.3)'], [0.4, 'rgba(4,12,18,0)']] },
        ],
  draw: (a) => (a.frame.format === 'square' ? square(a) : story(a)),
};
