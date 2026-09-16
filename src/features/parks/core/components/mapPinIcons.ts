import mapboxgl from 'mapbox-gl';

export const PIN_W = 28;
export const PIN_H = 36;

export const MINOR_URBAN_TYPES = ['water_fountain', 'toilets', 'parking', 'bike_rack', 'bench'];

export function registerPinImage(
  map: mapboxgl.Map,
  id: string,
  bodyColor: string,
  drawIcon: (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void,
  pixelRatio: number,
) {
  const s = pixelRatio;
  const w = PIN_W * s;
  const h = PIN_H * s;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const cx = w / 2;
  const bodyR = 11 * s;
  const bodyCy = bodyR + 2 * s;
  const tailTipY = h - 1 * s;
  const tailHalf = 5 * s;

  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4 * s;
  ctx.shadowOffsetY = 2 * s;

  const angle = Math.asin(Math.min(tailHalf / bodyR, 1));
  ctx.beginPath();
  ctx.arc(cx, bodyCy, bodyR, Math.PI / 2 + angle, Math.PI * 2 + Math.PI / 2 - angle);
  ctx.lineTo(cx, tailTipY);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = 'white';
  ctx.stroke();

  drawIcon(ctx, cx, bodyCy, s);

  const imgData = ctx.getImageData(0, 0, w, h);
  map.addImage(id, { width: w, height: h, data: new Uint8Array(imgData.data.buffer) }, { pixelRatio: s });
}

export function drawPullUpBarIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 5 * s, cy - 2 * s); ctx.lineTo(cx - 5 * s, cy + 6 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5 * s, cy - 2 * s); ctx.lineTo(cx + 5 * s, cy + 6 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 6 * s, cy - 2 * s); ctx.lineTo(cx + 6 * s, cy - 2 * s); ctx.stroke();
}

export function drawDumbbellIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.strokeStyle = 'white';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath(); ctx.moveTo(cx - 4 * s, cy); ctx.lineTo(cx + 4 * s, cy); ctx.stroke();
  ctx.lineWidth = 3.2 * s;
  ctx.beginPath(); ctx.moveTo(cx - 5.5 * s, cy - 3 * s); ctx.lineTo(cx - 5.5 * s, cy + 3 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5.5 * s, cy - 3 * s); ctx.lineTo(cx + 5.5 * s, cy + 3 * s); ctx.stroke();
}

export function drawDotIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(cx, cy, 3 * s, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Registers a sleek, badge-less arrow TIP for the navigation ground arrow.
 *
 * Used at the END of a curve-following LineString that traces the upcoming
 * turn. The tip itself carries no circle / outline / shadow — just a clean
 * elongated white triangle that reads instantly on any map tile. The
 * caller rotates this image at render time via `icon-rotate` so the tip
 * always points along the LineString's last segment.
 *
 * Geometry (canvas-up):
 *   Tip at (cx, top); two flared shoulders flaring outward 35 % of width;
 *   base notched ~15 % up so the silhouette reads as an arrowhead, not a
 *   solid triangle. The notch makes the tip feel "pierced" rather than
 *   blocky at small sizes.
 */
export function registerArrowTipImage(
  map: mapboxgl.Map,
  id: string,
  pixelRatio: number,
) {
  const r = pixelRatio;
  const SIZE = Math.round(40 * r);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cx = SIZE / 2;
  const tipY    = SIZE * 0.10;
  const baseY   = SIZE * 0.78;
  const notchY  = SIZE * 0.62;
  const halfW   = SIZE * 0.32;

  // Drop-shadow that ONLY sits behind the tip silhouette so the arrow
  // reads against light and dark map tiles without any badge background.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur  = 3 * r;
  ctx.shadowOffsetY = 1 * r;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx,           tipY);
  ctx.lineTo(cx + halfW,   baseY);
  ctx.lineTo(cx,           notchY);
  ctx.lineTo(cx - halfW,   baseY);
  ctx.closePath();
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
  if (!map.hasImage(id)) {
    map.addImage(
      id,
      { width: SIZE, height: SIZE, data: new Uint8Array(imgData.data.buffer) },
      { pixelRatio: r },
    );
  }
}

/**
 * Maneuver glyph variants drawn into the circular turn-arrow badge.
 * Each variant produces a geometrically distinct white shape so the
 * runner can read the upcoming maneuver at a glance from the ground:
 *   • 'straight'     — chevron pointing up
 *   • 'slight-right' — chevron tilted ~30° clockwise
 *   • 'slight-left'  — chevron tilted ~30° counter-clockwise
 *   • 'sharp-right'  — L-shaped arrow turning right
 *   • 'sharp-left'   — L-shaped arrow turning left
 *   • 'destination'  — flag (arrival flag, no movement direction)
 */
export type ManeuverGlyph =
  | 'straight'
  | 'slight-right'
  | 'slight-left'
  | 'sharp-right'
  | 'sharp-left'
  | 'destination';

/**
 * Draws a chevron arrow pointing toward (cx, tipY). Used by both the
 * 'straight' and 'slight-*' glyphs (slight variants pre-rotate the
 * canvas before calling).
 */
function drawChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const tipY   = cy - size * 0.34;
  const midY   = cy + size * 0.04;
  const baseY  = cy + size * 0.24;
  const halfW  = size * 0.22;
  const stemHW = size * 0.095;

  ctx.beginPath();
  ctx.moveTo(cx,          tipY);
  ctx.lineTo(cx + halfW,  midY);
  ctx.lineTo(cx + stemHW, midY);
  ctx.lineTo(cx + stemHW, baseY);
  ctx.lineTo(cx - stemHW, baseY);
  ctx.lineTo(cx - stemHW, midY);
  ctx.lineTo(cx - halfW,  midY);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws an L-shaped sharp-turn arrow. `direction = 1` → right, `-1` → left.
 * The vertical stem starts at the bottom of the badge, hooks 90° at the
 * centre, and the arrowhead points horizontally outward.
 */
function drawSharpTurn(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  direction: 1 | -1,
) {
  const stemHW = size * 0.085;
  const baseY  = cy + size * 0.30;
  const hookY  = cy - size * 0.05;
  const tipX   = cx + direction * size * 0.34;
  const headHalf = size * 0.16;

  ctx.beginPath();
  // vertical stem (going up)
  ctx.moveTo(cx - stemHW, baseY);
  ctx.lineTo(cx - stemHW, hookY + stemHW);
  // outer arc into horizontal segment
  ctx.lineTo(cx + direction * (size * 0.10), hookY + stemHW);
  // arrowhead base (outer)
  ctx.lineTo(cx + direction * (size * 0.10), hookY + stemHW + headHalf);
  // arrowhead tip
  ctx.lineTo(tipX, hookY);
  // arrowhead base (inner)
  ctx.lineTo(cx + direction * (size * 0.10), hookY - headHalf);
  ctx.lineTo(cx + direction * (size * 0.10), hookY - stemHW);
  // back to stem
  ctx.lineTo(cx + stemHW, hookY - stemHW);
  ctx.lineTo(cx + stemHW, baseY);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws a flag glyph used for the destination marker.
 */
function drawFlag(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const poleX  = cx - size * 0.20;
  const poleW  = size * 0.07;
  const flagW  = size * 0.40;
  const flagH  = size * 0.28;
  const top    = cy - size * 0.32;

  // pole
  ctx.fillRect(poleX, top, poleW, size * 0.62);
  // triangular flag
  ctx.beginPath();
  ctx.moveTo(poleX + poleW,         top);
  ctx.lineTo(poleX + poleW + flagW, top + flagH * 0.5);
  ctx.lineTo(poleX + poleW,         top + flagH);
  ctx.closePath();
  ctx.fill();
}

/**
 * Registers a circular turn-arrow badge with Mapbox.
 *
 * The arrow's *direction* is encoded by the chosen `glyph`. Callers also
 * apply `icon-rotate` at render time to align the badge with the road
 * bearing, so the badge respects BOTH the maneuver type AND the
 * geographic heading at that point on the ground.
 *
 * Visual design:
 *   • Filled circle (bgColor) with a white outline ring for legibility
 *     on both light and dark map tiles.
 *   • White maneuver glyph centred in the badge.
 */
export function registerArrowImage(
  map: mapboxgl.Map,
  id: string,
  bgColor: string,
  pixelRatio: number,
  glyph: ManeuverGlyph = 'straight',
) {
  const r = pixelRatio;
  const SIZE = Math.round(48 * r);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = SIZE / 2 - 1 * r;

  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 4 * r;
  ctx.shadowOffsetY = 2 * r;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = 'transparent';

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2 * r;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 1 * r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';

  if (glyph === 'straight') {
    drawChevron(ctx, cx, cy, SIZE);
  } else if (glyph === 'slight-right') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((30 * Math.PI) / 180);
    drawChevron(ctx, 0, 0, SIZE);
    ctx.restore();
  } else if (glyph === 'slight-left') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-30 * Math.PI) / 180);
    drawChevron(ctx, 0, 0, SIZE);
    ctx.restore();
  } else if (glyph === 'sharp-right') {
    drawSharpTurn(ctx, cx, cy, SIZE, 1);
  } else if (glyph === 'sharp-left') {
    drawSharpTurn(ctx, cx, cy, SIZE, -1);
  } else if (glyph === 'destination') {
    drawFlag(ctx, cx, cy, SIZE);
  }

  const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
  if (!map.hasImage(id)) {
    map.addImage(
      id,
      { width: SIZE, height: SIZE, data: new Uint8Array(imgData.data.buffer) },
      { pixelRatio: r },
    );
  }
}
