/**
 * QR Generator — local-only (the `qrcode` npm package, no network calls,
 * no external QR service ever sees a marketing link). Two output paths:
 *
 *   • `generateQrSvgString()` — pure string generation (works in Node or
 *     browser, no DOM). This is what's unit-tested.
 *   • `generateQrPngDataUrl()` — browser-only, uses `<canvas>`/`Image` to
 *     rasterize the SVG output and composite the logo on top at print
 *     resolution. Not unit-testable without a real browser — verified by
 *     manual QA + the mandatory "scan before print" step in the UI.
 *
 * Both take the SAME color/logo/error-correction inputs so the PNG and
 * SVG exports of one link are always visually identical.
 */

import QRCode from 'qrcode';

// ─── Constants ───────────────────────────────────────────────────────────────

/** QR spec's highest tier — 30% of modules recoverable. Required headroom
 * for a center logo to still scan reliably. Never make this configurable
 * lower; a smaller logo is fine, a lower EC level is not. */
export const QR_ERROR_CORRECTION_LEVEL = 'H' as const;

/** Modules of white space around the code — below ~4 risks scanners
 * (especially older phone cameras) failing to lock onto the finder
 * patterns, particularly on textured print backgrounds like a rollup. */
export const QUIET_ZONE_MODULES = 4;

/** Logo width as a fraction of the QR's total width. Center logo, level H:
 * safe up to ~25-30% per external guidance — capped well under that. */
export const LOGO_MAX_WIDTH_RATIO = 0.2;

/** Small light-color backing square behind the logo, as extra fraction of
 * logoSize, so a logo with transparent corners doesn't show QR pattern
 * bleeding through at the edges. */
export const LOGO_BACKING_PADDING_RATIO = 0.08;

/** Print-resolution floor for the PNG export. */
export const MIN_PRINT_PNG_WIDTH = 2000;

/**
 * WCAG-style minimum contrast ratio between the dark/light module colors.
 * WCAG AA text-contrast (4.5:1) is a stricter bar than a QR code needs —
 * scanners work on far coarser dark/light separation than human reading
 * does — but a real "usable" floor still catches the actual failure mode
 * ("light QR on a light background", the exact case flagged in the spec):
 * anything below ~3:1 is visually close enough to unicolor that some
 * cameras/lighting conditions will fail to lock on.
 */
export const MIN_CONTRAST_RATIO = 3;

// ─── Colors + contrast ──────────────────────────────────────────────────────

export interface QrColors {
  /** Module ("dark") color, hex e.g. '#0F172A'. */
  dark: string;
  /** Background ("light") color, hex e.g. '#FFFFFF'. */
  light: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** Standard WCAG contrast ratio formula — 1 (identical) to 21 (black/white). */
export function computeContrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** `true` when the pair is safe to print/scan (see `MIN_CONTRAST_RATIO`). */
export function isContrastSafe(colors: QrColors): boolean {
  return computeContrastRatio(colors.dark, colors.light) >= MIN_CONTRAST_RATIO;
}

// ─── Filenames ───────────────────────────────────────────────────────────────

/**
 * Turns a link's free-text `friendlyName` into a safe download filename —
 * so ten downloaded QR codes are distinguishable in a Downloads folder by
 * name, not by "qrcode(7).png". Strips characters that are invalid (or
 * just annoying) in filenames across macOS/Windows, collapses whitespace
 * to single underscores, and falls back to a generic name if the result
 * would otherwise be empty (e.g. a friendlyName that's 100% emoji).
 */
export function sanitizeFilename(name: string, extension: string): string {
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, '_');
  const base = cleaned.length > 0 ? cleaned : 'marketing-link-qr';
  return `${base}.${extension}`;
}

// ─── SVG generation (pure, unit-tested) ─────────────────────────────────────

export interface GenerateQrOptions {
  value: string;
  colors: QrColors;
  /** Base64 data URI of the logo image, e.g. 'data:image/png;base64,...'.
   * Omit to render a plain QR code with no center logo. */
  logoDataUrl?: string | null;
}

/**
 * Renders the QR code as an SVG string, with the logo (if provided)
 * injected as a centered `<image>` on a small light-color backing square.
 * Pure string generation — the `qrcode` package's SVG renderer runs
 * identically in Node and the browser, no canvas/DOM involved, so this
 * is fully unit-testable.
 */
export async function generateQrSvgString(options: GenerateQrOptions): Promise<string> {
  const svg = await QRCode.toString(options.value, {
    type: 'svg',
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: QUIET_ZONE_MODULES,
    color: { dark: options.colors.dark, light: options.colors.light },
  });

  if (!options.logoDataUrl) return svg;

  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!viewBoxMatch) return svg; // Unexpected renderer output — degrade to no-logo rather than throw.

  const totalWidth = parseFloat(viewBoxMatch[1]);
  const logoSize = totalWidth * LOGO_MAX_WIDTH_RATIO;
  const backingSize = logoSize * (1 + LOGO_BACKING_PADDING_RATIO);
  const logoPos = (totalWidth - logoSize) / 2;
  const backingPos = (totalWidth - backingSize) / 2;

  const overlay =
    `<rect x="${backingPos}" y="${backingPos}" width="${backingSize}" height="${backingSize}" ` +
    `fill="${options.colors.light}" />` +
    `<image href="${options.logoDataUrl}" x="${logoPos}" y="${logoPos}" ` +
    `width="${logoSize}" height="${logoSize}" />`;

  return svg.replace('</svg>', `${overlay}</svg>`);
}

// ─── PNG generation (browser-only) ──────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize QR SVG'));
    img.src = src;
  });
}

/**
 * Renders the QR code (logo included, since it reuses the same SVG the
 * logo is already baked into) as a print-resolution PNG data URL.
 * Browser-only — rasterizes via `<canvas>`, which doesn't exist in Node.
 * Not unit-tested for that reason; verified by manual QA and the
 * mandatory "scan before print" UI warning.
 */
export async function generateQrPngDataUrl(
  options: GenerateQrOptions & { widthPx?: number },
): Promise<string> {
  const svgString = await generateQrSvgString(options);
  const width = options.widthPx ?? MIN_PRINT_PNG_WIDTH;

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = width; // QR codes are always square
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, width, width);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
