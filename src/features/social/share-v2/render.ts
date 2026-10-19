/**
 * Renders a v2 share image on a canvas: background → template, in design
 * units scaled to the output (1080 px wide, or a small preview).
 * Hebrew fonts are loaded before the first draw.
 */
import { drawBackground, type ShareImageSource } from './draw/background';
import { FONT } from './draw/primitives';
import { paletteFor, toneFor } from './palette';
import { templateById } from './templates/registry';
import { DESIGN_W, SHARE_PX, frameFor, type ShareBackground, type ShareFormat, type ShareInk, type ShareModel } from './types';

let fontsReady: Promise<void> | null = null;

/** Wait for the app font (with Hebrew glyphs) in the weights the templates use. */
export function ensureShareFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  fontsReady ??= Promise.all(
    [700, 800, 900].map((w) => document.fonts.load(`${w} 40px ${FONT}`, 'אבג 0123')),
  )
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  return fontsReady;
}

export interface RenderShareV2Options {
  model: ShareModel;
  templateId: string;
  format: ShareFormat;
  background: ShareBackground;
  photo?: ShareImageSource | null;
  /** Sticker ink (format 'sticker' only; default white). */
  ink?: ShareInk;
  /** Output width in px (default 1080). Previews use ~360. */
  widthPx?: number;
}

export async function renderShareV2(o: RenderShareV2Options): Promise<HTMLCanvasElement> {
  await ensureShareFonts();
  const tpl = templateById(o.model.kind, o.templateId);
  const frame = frameFor(o.format);
  const widthPx = o.widthPx ?? SHARE_PX[o.format].width;
  const k = widthPx / DESIGN_W;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPx);
  canvas.height = Math.round(frame.h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.scale(k, k);
  // No usable photo → the template's OUT-colours look.
  // Stickers are always transparent; no usable photo → the template's OUT-colours look.
  const bg: ShareBackground = o.format === 'sticker' ? 'none' : o.background === 'photo' && !o.photo ? 'brand' : o.background;
  drawBackground(ctx, frame, { bg, brand: tpl.brand, kind: o.model.kind, photo: o.photo, focal: tpl.focal, scrims: tpl.scrims?.(o.format) });
  const palette = paletteFor(toneFor(bg, tpl.brand, o.ink), o.model.kind);
  tpl.draw({ ctx, frame, model: o.model, palette, bg, photo: o.photo });
  return canvas;
}

/**
 * Load a photo for drawing. Rejects when it can't load OR when drawing it
 * would taint the canvas (no CORS headers) — the caller marks the photo
 * tile unavailable instead of failing the share.
 */
export async function loadUsablePhoto(src: string): Promise<HTMLImageElement> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('photo load failed'));
    el.src = src;
  });
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const pctx = probe.getContext('2d');
  if (!pctx) throw new Error('no 2d context');
  pctx.drawImage(img, 0, 0, 1, 1);
  pctx.getImageData(0, 0, 1, 1); // throws SecurityError when tainted
  return img;
}
