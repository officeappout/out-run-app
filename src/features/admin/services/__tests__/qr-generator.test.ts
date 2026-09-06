import { describe, expect, it } from 'vitest';
import {
  buildQrCodeStylingOptions,
  clampLogoSizeRatio,
  computeContrastRatio,
  computeEffectiveContrastRatio,
  computeMinPrintWidthCm,
  computeScanRiskLevel,
  isContrastSafe,
  LOGO_SIZE_DEFAULT_RATIO,
  LOGO_SIZE_MAX_RATIO,
  LOGO_SIZE_MIN_RATIO,
  MIN_CONTRAST_RATIO,
  sanitizeFilename,
} from '../qr-generator';

describe('computeContrastRatio + isContrastSafe', () => {
  it('black on white is the maximum possible ratio (21:1)', () => {
    expect(computeContrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('identical colors have a ratio of exactly 1', () => {
    expect(computeContrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('is symmetric — order of the two colors does not matter', () => {
    const a = computeContrastRatio('#123456', '#EDEDED');
    const b = computeContrastRatio('#EDEDED', '#123456');
    expect(a).toBeCloseTo(b, 10);
  });

  it('flags a light-on-light pair as unsafe — the exact failure mode from the spec', () => {
    const colors = { dark: '#EEEEEE', light: '#FFFFFF' };
    expect(computeContrastRatio(colors.dark, colors.light)).toBeLessThan(MIN_CONTRAST_RATIO);
    expect(isContrastSafe(colors)).toBe(false);
  });

  it('accepts a real brand-plausible dark-on-light pair', () => {
    const colors = { dark: '#0F172A', light: '#FFFFFF' };
    expect(isContrastSafe(colors)).toBe(true);
  });

  it('handles 3-digit hex shorthand', () => {
    expect(computeContrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
  });
});

describe('computeEffectiveContrastRatio', () => {
  const colors = { dark: '#0F172A', light: '#FFFFFF' };

  it('matches the plain contrast ratio when there is no gradient', () => {
    expect(computeEffectiveContrastRatio(colors, null)).toBeCloseTo(
      computeContrastRatio(colors.dark, colors.light),
      10,
    );
  });

  it('returns the worse of the two gradient stops, not the better one', () => {
    // A near-white gradient end stop would tank contrast against a white background.
    const result = computeEffectiveContrastRatio(colors, '#F8F8F8');
    const endRatio = computeContrastRatio('#F8F8F8', colors.light);
    expect(result).toBeCloseTo(endRatio, 10);
    expect(result).toBeLessThan(computeContrastRatio(colors.dark, colors.light));
  });
});

describe('sanitizeFilename', () => {
  it('replaces filesystem-unsafe characters and collapses whitespace', () => {
    expect(sanitizeFilename('קמפיין: רולאפ / כוח?', 'png')).toBe('קמפיין_רולאפ_כוח.png');
  });

  it('falls back to a generic name when nothing usable survives', () => {
    expect(sanitizeFilename('???', 'svg')).toBe('marketing-link-qr.svg');
  });

  it('trims surrounding whitespace before processing', () => {
    expect(sanitizeFilename('  spring campaign  ', 'png')).toBe('spring_campaign.png');
  });
});

describe('clampLogoSizeRatio', () => {
  it('leaves an in-range value untouched', () => {
    expect(clampLogoSizeRatio(0.18)).toBe(0.18);
  });

  it('clamps below the 12% floor', () => {
    expect(clampLogoSizeRatio(0.05)).toBe(LOGO_SIZE_MIN_RATIO);
  });

  it('clamps above the 22% ceiling — never bypassable', () => {
    expect(clampLogoSizeRatio(0.5)).toBe(LOGO_SIZE_MAX_RATIO);
    expect(clampLogoSizeRatio(0.22)).toBe(LOGO_SIZE_MAX_RATIO);
    expect(clampLogoSizeRatio(0.2200001)).toBe(LOGO_SIZE_MAX_RATIO);
  });

  it('falls back to the documented default for non-finite input', () => {
    expect(clampLogoSizeRatio(NaN)).toBe(LOGO_SIZE_DEFAULT_RATIO);
    expect(clampLogoSizeRatio(Infinity)).toBe(LOGO_SIZE_DEFAULT_RATIO);
  });
});

describe('buildQrCodeStylingOptions', () => {
  const BASE_PARAMS = {
    value: 'https://outrun.co.il/r/rollup_koach_haifa',
    colors: { dark: '#0F172A', light: '#FFFFFF' },
    sizePx: 2000,
    dotType: 'square' as const,
    cornerSquareType: 'square' as const,
    logoSizeRatio: LOGO_SIZE_DEFAULT_RATIO,
    logoPadding: false,
  };

  it('sets the requested dot style, corner style, and error correction level', () => {
    const options = buildQrCodeStylingOptions({ ...BASE_PARAMS, dotType: 'dots' }, 'canvas');
    expect(options.dotsOptions?.type).toBe('dots');
    expect(options.cornersSquareOptions?.type).toBe('square');
    expect(options.qrOptions?.errorCorrectionLevel).toBe('H');
    expect(options.type).toBe('canvas');
    expect(options.data).toBe(BASE_PARAMS.value);
  });

  it('omits imageOptions entirely when there is no logo', () => {
    const options = buildQrCodeStylingOptions(BASE_PARAMS, 'canvas');
    expect(options.imageOptions).toBeUndefined();
    expect(options.image).toBeUndefined();
  });

  it('sets imageSize from the (clamped) logo size ratio when a logo is provided', () => {
    const options = buildQrCodeStylingOptions(
      { ...BASE_PARAMS, logoDataUrl: 'data:image/png;base64,AAAA', logoSizeRatio: 0.9 },
      'canvas',
    );
    expect(options.image).toBe('data:image/png;base64,AAAA');
    expect(options.imageOptions?.imageSize).toBe(LOGO_SIZE_MAX_RATIO);
    expect(options.imageOptions?.hideBackgroundDots).toBe(true);
  });

  it('gives the logo backing margin only when logoPadding is enabled', () => {
    const withoutPadding = buildQrCodeStylingOptions(
      { ...BASE_PARAMS, logoDataUrl: 'data:image/png;base64,AAAA', logoPadding: false },
      'canvas',
    );
    const withPadding = buildQrCodeStylingOptions(
      { ...BASE_PARAMS, logoDataUrl: 'data:image/png;base64,AAAA', logoPadding: true },
      'canvas',
    );
    expect(withoutPadding.imageOptions?.margin).toBe(0);
    expect(withPadding.imageOptions?.margin).toBeGreaterThan(0);
  });

  it('uses a flat dark color when no gradient end color is given', () => {
    const options = buildQrCodeStylingOptions(BASE_PARAMS, 'canvas');
    expect(options.dotsOptions?.color).toBe(BASE_PARAMS.colors.dark);
    expect(options.dotsOptions?.gradient).toBeUndefined();
  });

  it('builds a linear gradient from dark to the gradient end color when provided', () => {
    const options = buildQrCodeStylingOptions(
      { ...BASE_PARAMS, gradientEndColor: '#7C3AED' },
      'canvas',
    );
    expect(options.dotsOptions?.color).toBeUndefined();
    expect(options.dotsOptions?.gradient?.type).toBe('linear');
    expect(options.dotsOptions?.gradient?.colorStops).toEqual([
      { offset: 0, color: BASE_PARAMS.colors.dark },
      { offset: 1, color: '#7C3AED' },
    ]);
  });

  it('passes through the requested output type (svg vs canvas)', () => {
    expect(buildQrCodeStylingOptions(BASE_PARAMS, 'svg').type).toBe('svg');
    expect(buildQrCodeStylingOptions(BASE_PARAMS, 'canvas').type).toBe('canvas');
  });
});

describe('computeScanRiskLevel', () => {
  it('is low risk for the recommended defaults', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: LOGO_SIZE_DEFAULT_RATIO,
      dotType: 'square',
      contrastRatio: 21,
    });
    expect(result.level).toBe('low');
    expect(result.reasons).toEqual([]);
  });

  it('escalates to medium for a slightly-large logo alone', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: 0.19,
      dotType: 'square',
      contrastRatio: 21,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons.length).toBe(1);
  });

  it('escalates to high once the logo passes 20%', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: 0.21,
      dotType: 'square',
      contrastRatio: 21,
    });
    expect(result.level).toBe('high');
  });

  it('escalates to high for a decorative dot style regardless of other factors', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: LOGO_SIZE_DEFAULT_RATIO,
      dotType: 'classy',
      contrastRatio: 21,
    });
    expect(result.level).toBe('high');
  });

  it('escalates to medium for a mildly non-standard dot style', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: LOGO_SIZE_DEFAULT_RATIO,
      dotType: 'rounded',
      contrastRatio: 21,
    });
    expect(result.level).toBe('medium');
  });

  it('escalates on low contrast alone', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: LOGO_SIZE_DEFAULT_RATIO,
      dotType: 'square',
      contrastRatio: 3.2,
    });
    expect(result.level).toBe('high');
  });

  it('takes the worst of multiple factors, not the first or last', () => {
    const result = computeScanRiskLevel({
      logoSizeRatio: 0.19, // medium
      dotType: 'classy', // high
      contrastRatio: 21, // low
    });
    expect(result.level).toBe('high');
    expect(result.reasons.length).toBe(2);
  });
});

describe('computeMinPrintWidthCm', () => {
  it('applies the "distance ≈ 10× width" rule of thumb', () => {
    expect(computeMinPrintWidthCm(1)).toBeCloseTo(10, 5);
    expect(computeMinPrintWidthCm(2)).toBeCloseTo(20, 5);
    expect(computeMinPrintWidthCm(0.5)).toBeCloseTo(5, 5);
  });

  it('returns 0 for zero, negative, or non-finite input rather than a nonsense size', () => {
    expect(computeMinPrintWidthCm(0)).toBe(0);
    expect(computeMinPrintWidthCm(-3)).toBe(0);
    expect(computeMinPrintWidthCm(NaN)).toBe(0);
  });
});
