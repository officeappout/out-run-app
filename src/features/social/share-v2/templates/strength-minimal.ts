/**
 * Strength · "מינימל" (SH-1c): one huge number (reps → sets → minutes) in
 * the brand gradient, centred between the logo and three small numbers.
 */
import { drawGradientText, drawStatGrid, drawText, hline, measureAt, statHeight } from '../draw/primitives';
import { fitFontSize } from '../layout';
import { CYAN } from '../palette';
import { drawHeader } from './common';
import type { DrawArgs, ShareTemplateDef } from './template';

export function minimalHero(a: DrawArgs, opts: { eyebrow: string; heroMax: number; unitSize: number; bottomPad: number; side: number }) {
  const { ctx, frame, model: m, palette: p } = a;
  const headerBottom = drawHeader(a, { centered: true, logoW: frame.format === 'story' ? 78 : 66 });
  const rest = m.stats.filter((s) => s.unit !== m.hero.unit).slice(0, 3);
  const left = opts.side;
  const width = frame.w - opts.side * 2;
  const statsH = rest.length ? 18 + statHeight(26) : 0;
  const statsTop = frame.h - opts.bottomPad - statsH;
  if (rest.length) {
    hline(ctx, left, statsTop, width, p.hairline);
    drawStatGrid(ctx, rest, left, width, statsTop + 18, 26, p, { align: 'center', cols: rest.length });
  }
  const heroSize = fitFontSize(m.hero.value, frame.w - 40, opts.heroMax, 72, (s) => measureAt(ctx, s, 900)(m.hero.value));
  const heroLine = heroSize * 0.9;
  const groupH = 22 + 10 + heroLine + 6 + opts.unitSize * 1.1;
  const top = headerBottom + (statsTop - headerBottom - groupH) / 2;
  const cx = frame.w / 2;
  drawText(ctx, opts.eyebrow, cx, top, { size: 17, weight: 800, color: p.accentText, align: 'center', lineH: 22, maxW: frame.w - 48 });
  if (p.tone === 'cyan') drawText(ctx, m.hero.value, cx, top + 32, { size: heroSize, weight: 900, color: p.fg, align: 'center', lineH: heroLine });
  else drawGradientText(ctx, m.hero.value, cx, top + 32, heroSize, 900, CYAN, 'center');
  drawText(ctx, m.hero.unit, cx, top + 32 + heroLine + 6, { size: opts.unitSize, weight: 900, color: p.fg, align: 'center', lineH: opts.unitSize * 1.1 });
}

export const strengthMinimal: ShareTemplateDef = {
  id: 'strength-minimal',
  kind: 'strength',
  label: 'מינימל',
  formats: ['story', 'square'],
  brand: 'navy',
  naturalBackground: () => 'brand',
  scrims: () => [{ deg: 180, stops: [[0, 'rgba(4,12,18,0.55)'], [1, 'rgba(4,12,18,0.75)']] }],
  draw: (a) => {
    const m = a.model;
    const eyebrow = [m.name, m.level && `שלב ${m.level.index}`].filter(Boolean).join(' · ');
    const story = a.frame.format === 'story';
    minimalHero(a, { eyebrow, heroMax: story ? 168 : 120, unitSize: story ? 30 : 24, bottomPad: story ? 40 : 24, side: 40 });
  },
};
