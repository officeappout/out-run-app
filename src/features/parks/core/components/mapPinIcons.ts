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
