/**
 * The run's route line: a soft turquoise glow (shadowBlur) under a white or
 * lime→turquoise gradient stroke, start/end dots, and numbered km markers
 * when the model has them.
 */
import { fitRoutePoints, pointAtFraction, type KmMark, type Pt } from '../route-geometry';
import { drawText } from './primitives';

export interface RouteStyle {
  ink: 'white' | 'gradient' | 'dark';
  /** Stroke width in design units. */
  width: number;
  glow?: number;
  kmMarks?: KmMark[];
  /** Marker disc fill (dark backgrounds) — light backgrounds use white. */
  markerFill?: string;
}

export function drawRoute(ctx: CanvasRenderingContext2D, shape: number[], x: number, y: number, w: number, h: number, s: RouteStyle): boolean {
  const pts = fitRoutePoints(shape, w, h, Math.max(14, s.width * 2.5)).map(([px, py]) => [x + px, y + py] as Pt);
  if (pts.length < 2) return false;
  const path = new Path2D();
  pts.forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Glow
  ctx.shadowColor = 'rgba(12,242,227,0.9)';
  ctx.shadowBlur = s.glow ?? s.width * 2.6;
  ctx.strokeStyle = 'rgba(12,242,227,0.75)';
  ctx.lineWidth = s.width * 2.4;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  // Line
  if (s.ink === 'gradient') {
    const g = ctx.createLinearGradient(x, y + h, x + w, y);
    g.addColorStop(0, '#84cc16');
    g.addColorStop(1, '#0cf2e3');
    ctx.strokeStyle = g;
  } else {
    ctx.strokeStyle = s.ink === 'dark' ? '#0e1419' : '#ffffff';
  }
  ctx.lineWidth = s.width;
  ctx.stroke(path);
  // Start (white, lime ring) / end (turquoise, white ring)
  const dot = (p: Pt, r: number, fill: string, ring: string, rw: number) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = rw;
    ctx.strokeStyle = ring;
    ctx.stroke();
  };
  dot(pts[0], s.width * 1.6, '#ffffff', '#84cc16', s.width * 0.8);
  dot(pts[pts.length - 1], s.width * 1.8, '#0cf2e3', '#ffffff', s.width * 0.7);
  ctx.restore();
  // Km markers
  (s.kmMarks ?? []).forEach((m) => {
    const p = pointAtFraction(pts, m.f);
    if (!p) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p[0], p[1], 12, 0, Math.PI * 2);
    ctx.fillStyle = s.markerFill ?? '#0b2230';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
    const label = String(m.km);
    drawText(ctx, label, p[0], p[1] - 12, { size: label.length > 1 ? 12 : 14.5, weight: 900, color: s.markerFill === '#ffffff' ? '#0b2230' : '#ffffff', align: 'center', lineH: 24 });
  });
  return true;
}
