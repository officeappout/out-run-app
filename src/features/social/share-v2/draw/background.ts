/**
 * The three backgrounds every template can sit on: the user's photo (cover,
 * centre-top focal point, plus the template's own scrim), OUT colours
 * (cyan / navy / night — per template) and clean.
 */
import { coverRectFocal } from '../layout';
import type { BrandStyle, ShareBackground, ShareFrame, ShareKind } from '../types';
import { drawLogoRing } from './logo';
import { cssGradient } from './primitives';

export type ShareImageSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

/** A scrim: vertical (deg 180) or horizontal stops over the photo. */
export interface Scrim {
  deg: number;
  stops: [number, string][];
}

export interface BackgroundSpec {
  bg: ShareBackground;
  brand: BrandStyle;
  kind: ShareKind;
  photo?: ShareImageSource | null;
  /** Photo focal point (0..1); default centre, 40% from the top. */
  focal?: [number, number];
  scrims?: Scrim[];
}

function size(img: ShareImageSource): [number, number] {
  if ('naturalWidth' in img) return [img.naturalWidth, img.naturalHeight];
  return [img.width, img.height];
}

export function drawBackground(ctx: CanvasRenderingContext2D, f: ShareFrame, s: BackgroundSpec) {
  const { w, h } = f;
  if (s.bg === 'none') return; // transparent sticker
  if (s.bg === 'photo' && s.photo) {
    const [iw, ih] = size(s.photo);
    const r = coverRectFocal(iw, ih, w, h, s.focal?.[0] ?? 0.5, s.focal?.[1] ?? 0.4);
    ctx.drawImage(s.photo, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    for (const sc of s.scrims ?? []) {
      ctx.fillStyle = cssGradient(ctx, 0, 0, w, h, sc.deg, sc.stops);
      ctx.fillRect(0, 0, w, h);
    }
    return;
  }
  if (s.bg === 'plain') {
    ctx.fillStyle = cssGradient(ctx, 0, 0, w, h, 180, s.kind === 'cardio' ? [[0, '#f2fae6'], [0.6, '#ffffff']] : [[0, '#eef8fc'], [0.6, '#ffffff']]);
    ctx.fillRect(0, 0, w, h);
    return;
  }
  // 'brand' (and 'photo' without a usable photo)
  if (s.brand === 'cyan') {
    ctx.fillStyle = cssGradient(ctx, 0, 0, w, h, 160, [[0, '#00baf7'], [1, '#0cf2e3']]);
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.16;
    const ring = f.format === 'story' ? 420 : 300;
    drawLogoRing(ctx, -150, -110, ring, '#ffffff');
    ctx.restore();
    return;
  }
  if (s.brand === 'navy') {
    const g = ctx.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#0d3446');
    g.addColorStop(0.55, '#0a1820');
    g.addColorStop(1, '#070e13');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  // night: dark blue-green + faint street lines
  ctx.fillStyle = cssGradient(ctx, 0, 0, w, h, 170, [[0, '#061620'], [0.55, '#0a2634'], [1, '#0c3a44']]);
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.lineCap = 'round';
  const line = (x1: number, y1: number, x2: number, y2: number, lw: number, a: number) => {
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1 * (h / 693));
    ctx.lineTo(x2, y2 * (h / 693));
    ctx.stroke();
  };
  [[-20, 140, 410, 110], [-20, 330, 410, 360], [-20, 520, 410, 490], [90, -10, 120, 700], [300, -10, 270, 700]].forEach(([a, b, c, d]) => line(a, b, c, d, 10, 0.06));
  [[-20, 230, 410, 240], [-20, 430, 410, 420], [200, -10, 205, 700], [30, -10, 50, 700], [360, -10, 350, 700]].forEach(([a, b, c, d]) => line(a, b, c, d, 4, 0.042));
  ctx.restore();
}
