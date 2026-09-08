/**
 * QR Generator — local-only (the `qr-code-styling` npm package, no network
 * calls, no external QR service ever sees a marketing link). Verified: the
 * package's compiled bundle has zero `require()` calls — `canvas`/`jsdom`
 * are only referenced as *optional*, caller-injected constructor options
 * for server-side rendering, never pulled in automatically — so this is
 * safe to use from a `'use client'` component without leaking a Node-only
 * dependency into the browser bundle (the exact class of bug that broke
 * production in the previous round).
 *
 * This file stays pure/unit-testable wherever the underlying operation
 * doesn't require real rendering:
 *   • `buildQrCodeStylingOptions()` — maps app-level style params to the
 *     library's `Options` object. No DOM, no canvas — just an object.
 *   • `computeContrastRatio` / `isContrastSafe` — WCAG-style contrast math.
 *   • `computeScanRiskLevel()` — heuristic risk scoring.
 *   • `computeMinPrintWidthCm()` — print-size rule of thumb.
 *   • `sanitizeFilename()` / `clampLogoSizeRatio()`.
 *
 * Actual rendering (`new QRCodeStyling(options)`, `.append()`, `.getRawData()`)
 * happens only in `QrCodeGenerator.tsx`, browser-only, not unit-tested —
 * verified by manual QA and the mandatory "scan before print" UI warning.
 */

import type { CornerSquareType, DotType, Options } from 'qr-code-styling';

// ─── Constants ───────────────────────────────────────────────────────────────

/** QR spec's highest tier — 30% of modules recoverable. Required headroom
 * for a center logo to still scan reliably. Never make this configurable
 * lower; a smaller logo is fine, a lower EC level is not. */
export const QR_ERROR_CORRECTION_LEVEL = 'H' as const;

/** Outer margin as a fraction of the rendered width — `qr-code-styling`'s
 * `margin` option is in pixels around the whole code (not a per-module
 * quiet zone like the old `qrcode` package), so this approximates the same
 * "don't crowd the finder patterns" effect proportionally at any size. */
export const QUIET_ZONE_WIDTH_RATIO = 0.04;

/** Logo width as a fraction of the QR's total width — user-adjustable
 * range. Below 12% a logo reads as a stray artifact rather than a mark;
 * above 22% starts eating into the error-correction headroom level H
 * buys us. Never allow anything outside this range to reach the renderer. */
export const LOGO_SIZE_MIN_RATIO = 0.12;
export const LOGO_SIZE_MAX_RATIO = 0.22;
export const LOGO_SIZE_DEFAULT_RATIO = 0.18;

/** Extra `imageOptions.margin` (px) applied when the white backing behind
 * the logo is enabled — pushes surrounding modules away from the logo so a
 * logo with transparent/textured edges doesn't read as broken modules. */
export const LOGO_PADDING_WIDTH_RATIO = 0.02;

/** Print-resolution floor for the PNG export. */
export const MIN_PRINT_PNG_WIDTH = 2000;

/**
 * WCAG-style minimum contrast ratio between the dark/light module colors.
 * WCAG AA text-contrast (4.5:1) is a stricter bar than a QR code needs —
 * scanners work on far coarser dark/light separation than human reading
 * does — but a real "usable" floor still catches the actual failure mode
 * ("light QR on a light background"): anything below ~3:1 is visually
 * close enough to unicolor that some cameras/lighting conditions will
 * fail to lock on.
 */
export const MIN_CONTRAST_RATIO = 3;

/** "Scan distance ≈ 10× QR width" rule of thumb for the print-size calculator. */
export const SCAN_DISTANCE_TO_WIDTH_RATIO = 10;

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

/**
 * Contrast against a possibly-gradient dark color: checks BOTH gradient
 * stops against the light color and returns the worse (lower) ratio, so a
 * gradient can't hide a bad pairing behind its better-contrasting stop.
 */
export function computeEffectiveContrastRatio(
  colors: QrColors,
  gradientEndColor?: string | null,
): number {
  const base = computeContrastRatio(colors.dark, colors.light);
  if (!gradientEndColor) return base;
  const end = computeContrastRatio(gradientEndColor, colors.light);
  return Math.min(base, end);
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

// ─── Logo size ───────────────────────────────────────────────────────────────

/** Clamps a UI-supplied logo-size ratio into the allowed [12%, 22%] range.
 * Called both by the slider's `onChange` and defensively inside
 * `buildQrCodeStylingOptions` — the 22% ceiling must never be bypassable
 * from any call site, including a future one that forgets to clamp first. */
export function clampLogoSizeRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return LOGO_SIZE_DEFAULT_RATIO;
  return Math.min(LOGO_SIZE_MAX_RATIO, Math.max(LOGO_SIZE_MIN_RATIO, ratio));
}

// ─── Options builder (pure, unit-tested) ────────────────────────────────────

export interface QrStyleParams {
  value: string;
  colors: QrColors;
  sizePx: number;
  dotType: DotType;
  cornerSquareType: CornerSquareType;
  logoDataUrl?: string | null;
  logoSizeRatio: number;
  logoPadding: boolean;
  /** When set, renders a linear gradient from `colors.dark` to this color
   * instead of a flat dark fill. */
  gradientEndColor?: string | null;
}

/**
 * Maps our app-level style params to `qr-code-styling`'s `Options` object.
 * Pure — no rendering, just object construction — so this stays fully
 * unit-testable even though the library itself is canvas/DOM-based.
 */
export function buildQrCodeStylingOptions(
  params: QrStyleParams,
  outputType: 'canvas' | 'svg',
): Options {
  const logoSizeRatio = clampLogoSizeRatio(params.logoSizeRatio);

  const dotsColor = params.gradientEndColor
    ? {
        gradient: {
          type: 'linear' as const,
          rotation: Math.PI / 4,
          colorStops: [
            { offset: 0, color: params.colors.dark },
            { offset: 1, color: params.gradientEndColor },
          ],
        },
      }
    : { color: params.colors.dark };

  // `qr-code-styling` merges caller options over its own defaults with a
  // shallow Object.assign — an explicit `imageOptions: undefined` key
  // OVERWRITES (not skips) the library's default `imageOptions` object, and
  // its own constructor then reads `imageOptions.hideBackgroundDots` with no
  // optional-chaining guard, throwing "Cannot read properties of undefined
  // (reading 'hideBackgroundDots')". Confirmed against the real installed
  // package (not assumed): passing `imageOptions: undefined` reproduces the
  // exact production crash; OMITTING the key entirely (via conditional
  // spread, not a ternary-to-undefined) lets the library's own default
  // populate and does not throw. The `imageOptions` key must never be
  // present-but-undefined in the returned object — only present (with a
  // real object) or fully absent.
  return {
    type: outputType,
    width: params.sizePx,
    height: params.sizePx,
    margin: Math.round(params.sizePx * QUIET_ZONE_WIDTH_RATIO),
    data: params.value,
    image: params.logoDataUrl ?? undefined,
    qrOptions: {
      errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    },
    ...(params.logoDataUrl
      ? {
          imageOptions: {
            imageSize: logoSizeRatio,
            hideBackgroundDots: true,
            margin: params.logoPadding
              ? Math.round(params.sizePx * LOGO_PADDING_WIDTH_RATIO)
              : 0,
          },
        }
      : {}),
    dotsOptions: {
      type: params.dotType,
      ...dotsColor,
    },
    cornersSquareOptions: {
      type: params.cornerSquareType,
      color: params.colors.dark,
    },
    backgroundOptions: {
      color: params.colors.light,
    },
  };
}

// ─── Scan-reliability risk heuristic (pure, unit-tested) ───────────────────

export type ScanRiskLevel = 'low' | 'medium' | 'high';

export interface ScanRiskInput {
  logoSizeRatio: number;
  dotType: DotType;
  /** Pass `computeEffectiveContrastRatio(...)` when a gradient is active. */
  contrastRatio: number;
}

export interface ScanRiskResult {
  level: ScanRiskLevel;
  /** Human-readable (Hebrew) reasons for any factor above 'low'. Empty when 'low'. */
  reasons: string[];
}

const RISK_RANK: Record<ScanRiskLevel, number> = { low: 0, medium: 1, high: 2 };

const DECORATIVE_DOT_TYPES = new Set<DotType>(['classy', 'classy-rounded', 'extra-rounded']);

/**
 * NOT a scientific scan test — a heuristic to catch an expensive print
 * mistake before it happens. Worst-of-three-factors wins (a single risky
 * factor is enough to flag the whole code), each threshold documented here:
 *
 *  • Logo size: ≤18% (the recommended default) → low. 18–20% → medium.
 *    Above 20% (up to the hard 22% cap) → high — eating further into the
 *    30% error-correction headroom level H buys us.
 *  • Dot style: 'square' (the QR-standard look) → low. 'rounded'/'dots'
 *    → medium (mild decorative deviation, still broadly scanner-tested).
 *    'classy'/'classy-rounded'/'extra-rounded' → high (most decorative,
 *    least battle-tested across scanner apps).
 *  • Contrast: ≥7:1 → low. 4–7:1 → medium. Below 4:1 (down to the hard
 *    3:1 floor that blocks download entirely) → high.
 */
export function computeScanRiskLevel(input: ScanRiskInput): ScanRiskResult {
  const reasons: string[] = [];
  let level: ScanRiskLevel = 'low';
  const escalate = (next: ScanRiskLevel) => {
    if (RISK_RANK[next] > RISK_RANK[level]) level = next;
  };

  if (input.logoSizeRatio > 0.2) {
    escalate('high');
    reasons.push('לוגו גדול (מעל 20%)');
  } else if (input.logoSizeRatio > 0.18) {
    escalate('medium');
    reasons.push('לוגו מעט גדול מהמומלץ (מעל 18%)');
  }

  if (DECORATIVE_DOT_TYPES.has(input.dotType)) {
    escalate('high');
    reasons.push('סגנון נקודות דקורטיבי מאוד');
  } else if (input.dotType === 'rounded' || input.dotType === 'dots') {
    escalate('medium');
    reasons.push('סגנון נקודות לא-סטנדרטי');
  }

  if (input.contrastRatio < 4) {
    escalate('high');
    reasons.push('ניגודיות נמוכה');
  } else if (input.contrastRatio < 7) {
    escalate('medium');
    reasons.push('ניגודיות בינונית');
  }

  return { level, reasons };
}

// ─── Print-size calculator (pure, unit-tested) ──────────────────────────────

/**
 * Minimum recommended print width (cm) for a given expected scan distance
 * (meters), using the rule of thumb "scan distance ≈ 10× QR width". Not a
 * hard physics law — a widely-used field heuristic for print sizing.
 */
export function computeMinPrintWidthCm(scanDistanceMeters: number): number {
  if (!Number.isFinite(scanDistanceMeters) || scanDistanceMeters <= 0) return 0;
  return (scanDistanceMeters * 100) / SCAN_DISTANCE_TO_WIDTH_RATIO;
}
