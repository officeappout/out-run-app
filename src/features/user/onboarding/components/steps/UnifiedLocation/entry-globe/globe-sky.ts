/**
 * Entry globe — the sky (Mapbox fog) as a pure function of t ∈ [0, 1]:
 * 0 = the light page sky behind the resting half-Earth (#f4f7fa, matches the
 * screen background so the canvas edge is invisible), 1 = deep space for the
 * dive (same end colours as the website hero).
 */

type RGB = [number, number, number];

const SKY = {
  space: { from: [244, 247, 250] as RGB, to: [6, 10, 20] as RGB },
  color: { from: [255, 255, 255] as RGB, to: [196, 226, 240] as RGB },
  high: { from: [170, 226, 246] as RGB, to: [0, 150, 220] as RGB },
};

export interface SkyFog {
  color: string;
  'high-color': string;
  'space-color': string;
  'horizon-blend': number;
  'star-intensity': number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number) =>
  `rgb(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(lerp(a[2], b[2], t))})`;

export function skyFog(t: number): SkyFog {
  const q = clamp01(t);
  return {
    color: mix(SKY.color.from, SKY.color.to, q),
    'high-color': mix(SKY.high.from, SKY.high.to, q),
    'space-color': mix(SKY.space.from, SKY.space.to, q),
    'horizon-blend': lerp(0.12, 0.03, q),
    'star-intensity': lerp(0, 0.45, q),
  };
}

/** The page sky colour (CSS) behind the canvas — equals skyFog(0)['space-color']. */
export const PAGE_SKY = '#f4f7fa';
