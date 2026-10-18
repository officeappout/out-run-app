/**
 * Draws a share image (share-image.ts template data) on an offscreen canvas
 * and hands it to the OS share sheet. No new dependency: plain Canvas 2D +
 * Path2D for the route line.
 *
 * Share: navigator.share({ files }) when the WebView/browser supports file
 * sharing; otherwise the PNG is downloaded. (@capacitor/share isn't
 * installed — see the PR notes.)
 *
 * A photo from Firebase Storage can only be drawn when the bucket sends CORS
 * headers; otherwise the canvas would be tainted, so loadShareImage rejects
 * and the caller falls back to the template without the photo.
 */
import { routeShapeToSvg } from './feed-route';
import { SHARE_SIZES, coverRect, type ShareSize, type ShareTemplateData } from './share-image';

const INK = '#0e1419';
const DEEP = '#0284c7';
const FONT = "'Simpler Pro', 'Heebo', system-ui, sans-serif";

export function loadShareImage(src: string, crossOrigin = true): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin && !src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`900 64px ${FONT}`)]);
  } catch {
    /* system font fallback */
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, color: string, maxW?: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  let out = s;
  if (maxW) {
    while (out.length > 1 && ctx.measureText(out).width > maxW) out = out.slice(0, -1);
    if (out !== s) out = `${out.slice(0, -1)}…`;
  }
  ctx.fillText(out, x, y);
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawRoute(ctx: CanvasRenderingContext2D, shape: number[], x: number, y: number, w: number, h: number, color: string, onDark: boolean) {
  const svg = routeShapeToSvg(shape, w, h, Math.round(Math.min(w, h) * 0.08));
  if (!svg) return;
  ctx.save();
  ctx.translate(x, y);
  const p = new Path2D(svg.d);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = Math.max(6, Math.round(Math.min(w, h) * 0.025));
  ctx.strokeStyle = onDark ? 'rgba(255,255,255,0.9)' : '#ffffff';
  ctx.lineWidth = lw * 2.4;
  ctx.stroke(p);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke(p);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(svg.start[0], svg.start[1], lw * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(svg.end[0], svg.end[1], lw * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface RenderShareOptions {
  data: ShareTemplateData;
  size: ShareSize;
  /** Background photo (already loaded). null → the template's own tint. */
  photo?: HTMLImageElement | ImageBitmap | null;
  logo?: HTMLImageElement | null;
}

export async function renderShareImage({ data, size, photo, logo }: RenderShareOptions): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const { width: W, height: H } = SHARE_SIZES[size];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  const dark = !!photo;
  const story = size === 'story';
  const pad = 84;
  const right = W - pad;
  const fg = dark ? '#ffffff' : INK;
  const sub = dark ? 'rgba(255,255,255,0.82)' : '#4b5a66';
  const accentText = dark ? '#ffffff' : data.kind === 'cardio' ? '#4d7c0f' : DEEP;

  // Background
  if (photo) {
    const iw = 'naturalWidth' in photo ? photo.naturalWidth : photo.width;
    const ih = 'naturalHeight' in photo ? photo.naturalHeight : photo.height;
    const r = coverRect(iw, ih, W, H);
    ctx.drawImage(photo, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,16,24,0.55)');
    g.addColorStop(0.35, 'rgba(8,16,24,0.15)');
    g.addColorStop(0.6, 'rgba(8,16,24,0.45)');
    g.addColorStop(1, 'rgba(8,16,24,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    if (data.kind === 'cardio') {
      g.addColorStop(0, '#f3fbe6');
      g.addColorStop(1, '#dcefbf');
    } else {
      g.addColorStop(0, '#eef8fc');
      g.addColorStop(1, '#d3eef9');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (data.templateId.endsWith('clean')) {
      ctx.fillStyle = hexA(data.accent, 0.12);
      ctx.beginPath();
      ctx.arc(W * 0.15, H * 0.2, W * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = 'right';

  // Brand (top)
  const top = story ? 150 : 96;
  if (logo) ctx.drawImage(logo, right - 72, top - 58, 72, 72);
  text(ctx, 'OUT', right - (logo ? 92 : 0), top, 52, 900, fg);

  // Hero route (cardio, route template)
  let y = story ? H * 0.2 : top + 70;
  if (data.route && data.routeStyle === 'hero') {
    const rh = story ? 760 : 420;
    if (!dark) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      roundRect(ctx, pad, y, W - pad * 2, rh, 48);
      ctx.fill();
    }
    drawRoute(ctx, data.route, pad, y, W - pad * 2, rh, data.kind === 'cardio' ? '#65a30d' : data.accent, dark);
    y += rh + (story ? 90 : 60);
  } else {
    y = story ? H * 0.5 : top + 150;
    if (data.templateId === 'strength-list' && story) y = H * 0.36;
  }

  // Eyebrow + headline
  if (data.eyebrow) {
    text(ctx, data.eyebrow, right, y, story ? 44 : 38, 800, accentText, W - pad * 2);
    y += story ? 120 : 100;
  }
  const headSize = data.templateId.endsWith('clean') ? (story ? 150 : 120) : story ? 128 : 104;
  text(ctx, data.headline, right, y, headSize, 900, fg, W - pad * 2);
  y += story ? 60 : 44;

  // Level progress
  if (data.progress !== undefined) {
    const bw = W - pad * 2;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.85)';
    roundRect(ctx, pad, y, bw, 22, 11);
    ctx.fill();
    const fw = Math.max(22, bw * data.progress);
    const g = ctx.createLinearGradient(right, 0, right - fw, 0);
    g.addColorStop(0, '#00baf7');
    g.addColorStop(1, '#0cf2e3');
    ctx.fillStyle = g;
    roundRect(ctx, right - fw, y, fw, 22, 11);
    ctx.fill();
    y += 80;
  }

  // Stats row
  if (data.stats.length) {
    y += story ? 70 : 50;
    const colW = (W - pad * 2) / Math.max(3, data.stats.length);
    data.stats.forEach((s, i) => {
      const x = right - i * colW;
      text(ctx, s.value, x, y, story ? 92 : 76, 900, fg, colW - 20);
      text(ctx, s.unit, x, y + (story ? 56 : 48), story ? 36 : 32, 700, sub, colW - 20);
    });
    y += story ? 130 : 100;
  }

  // Exercise rows
  if (data.rows.length && y < H - 260) {
    y += 30;
    const rowH = story ? 120 : 96;
    for (const r of data.rows) {
      if (y + rowH > H - 200) break;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.14)' : '#ffffff';
      roundRect(ctx, pad, y, W - pad * 2, rowH - 18, 30);
      ctx.fill();
      const mid = y + (rowH - 18) / 2 + 14;
      text(ctx, r.name, right - 34, mid, story ? 44 : 38, 800, fg, (W - pad * 2) * 0.48);
      ctx.textAlign = 'left';
      text(ctx, r.detail, pad + 34, mid, story ? 40 : 34, 800, sub);
      ctx.textAlign = 'right';
      // per-set dots
      const dots = Math.min(r.sets, 8);
      const dx = pad + (W - pad * 2) * 0.42;
      for (let d = 0; d < dots; d++) {
        ctx.fillStyle = d < r.setsDone ? data.accent : hexA(data.accent, 0.3);
        ctx.beginPath();
        ctx.arc(dx - d * 30, mid - 12, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      y += rowH;
    }
    if (data.footnote) {
      text(ctx, data.footnote, right - 10, y + 20, story ? 36 : 32, 700, accentText);
      y += 70;
    }
  }

  // Badge (PR / streak)
  if (data.badge && y < H - 200) {
    ctx.font = `800 ${story ? 38 : 34}px ${FONT}`;
    const tw = Math.min(W - pad * 2 - 60, ctx.measureText(data.badge).width);
    const bh = story ? 84 : 74;
    const by = Math.max(y + 20, H - (story ? 330 : 230));
    ctx.fillStyle = dark ? 'rgba(254,243,199,0.95)' : '#fef3c7';
    roundRect(ctx, right - tw - 60, by, tw + 60, bh, bh / 2);
    ctx.fill();
    text(ctx, data.badge, right - 30, by + bh / 2 + 13, story ? 38 : 34, 800, '#92400e', W - pad * 2 - 60);
  }

  // Route inset (stats template, or any template over a photo)
  if (data.route && data.routeStyle === 'inset') {
    const s = story ? 300 : 240;
    const ix = pad;
    const iy = story ? 190 : 70;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.7)';
    roundRect(ctx, ix, iy, s, s, 40);
    ctx.fill();
    drawRoute(ctx, data.route, ix, iy, s, s, '#65a30d', dark);
  }

  // Footer
  text(ctx, 'outrun.co.il', right, H - (story ? 110 : 64), story ? 34 : 30, 700, sub);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/** OS share sheet with the file; download when file sharing isn't there. */
export async function shareOrDownload(blob: Blob, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
