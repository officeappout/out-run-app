/**
 * The real OUT logotype on the canvas — the three paths of
 * public/assets/logo/Kind=logotype.svg (164×61): the O ring, U and T.
 * Never the text "OUT".
 */
import type { SharePalette } from '../palette';

export const LOGO_VIEW = { w: 164, h: 61 };

export const LOGO_PATHS = {
  o: 'M30 60C46.56 60 60 46.56 60 30C60 13.44 46.56 0 30 0C13.44 0 0 13.44 0 30C0 46.56 13.44 60 30 60ZM30 15C38.28 15 45 21.72 45 30C45 38.28 38.28 45 30 45C21.72 45 15 38.28 15 30C15 21.72 21.72 15 30 15Z',
  t: 'M135.935 59.6736H150.47V15.4164H164V2.33301H122.405V15.4164H135.935V59.6736Z',
  u: 'M81.9285 2.33301H67.395V37.8827C67.395 44.8768 69.7318 50.6337 73.8508 54.6417C77.9662 58.6461 83.7734 60.8202 90.5618 60.8202C97.7092 60.8202 103.784 58.4072 108.075 54.1265C112.366 49.8455 114.799 43.77 114.799 36.5832V2.33301H100.265L100.187 37.1925V37.1947C100.187 40.3733 99.2853 42.8634 97.7526 44.5476C96.2302 46.2206 93.9921 47.2017 91.0969 47.2017C88.1957 47.2017 85.9541 46.2354 84.4327 44.6052C82.9035 42.9668 82.0072 40.5557 82.0072 37.5005L81.9285 2.33301Z',
};

let cache: { o: Path2D; t: Path2D; u: Path2D } | null = null;
function paths() {
  return (cache ??= { o: new Path2D(LOGO_PATHS.o), t: new Path2D(LOGO_PATHS.t), u: new Path2D(LOGO_PATHS.u) });
}

export const logoHeight = (w: number) => (w * LOGO_VIEW.h) / LOGO_VIEW.w;

/** Draw the logotype with its top-left at (x, y), `w` wide. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, p: Pick<SharePalette, 'logoO' | 'logoInk'>) {
  const k = w / LOGO_VIEW.w;
  const { o, t, u } = paths();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (p.logoO === 'grad') {
    const g = ctx.createLinearGradient(0, 60, 60, 0);
    g.addColorStop(0, '#00b9f7');
    g.addColorStop(1, '#0cf2e2');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = p.logoO;
  }
  ctx.fill(o);
  ctx.fillStyle = p.logoInk;
  ctx.fill(t, 'evenodd');
  ctx.fill(u, 'evenodd');
  ctx.restore();
}

/** Just the O ring (the card template's watermark). */
export function drawLogoRing(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 60, size / 60);
  ctx.fillStyle = color;
  ctx.fill(paths().o);
  ctx.restore();
}
