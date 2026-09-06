import { describe, expect, it } from 'vitest';
import {
  computeContrastRatio,
  generateQrSvgString,
  isContrastSafe,
  LOGO_MAX_WIDTH_RATIO,
  MIN_CONTRAST_RATIO,
  QUIET_ZONE_MODULES,
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

describe('generateQrSvgString', () => {
  const TEST_URL = 'https://outrun.co.il/r/rollup_koach_haifa';
  const COLORS = { dark: '#0F172A', light: '#FFFFFF' };

  it('renders a valid SVG with the requested colors and a 4-module quiet zone', async () => {
    const svg = await generateQrSvgString({ value: TEST_URL, colors: COLORS });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('stroke="#0F172A"');
    // qrcode's `margin` option IS the quiet zone, in modules, on each side.
    expect(QUIET_ZONE_MODULES).toBe(4);
  });

  it('injects no logo when logoDataUrl is omitted', async () => {
    const svg = await generateQrSvgString({ value: TEST_URL, colors: COLORS });
    expect(svg).not.toContain('<image');
  });

  it('injects a centered logo sized to LOGO_MAX_WIDTH_RATIO of the total width when provided', async () => {
    const fakeLogo = 'data:image/png;base64,AAAA';
    const svg = await generateQrSvgString({ value: TEST_URL, colors: COLORS, logoDataUrl: fakeLogo });

    expect(svg).toContain(`<image href="${fakeLogo}"`);

    const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)!;
    const totalWidth = parseFloat(viewBoxMatch[1]);
    const expectedLogoSize = totalWidth * LOGO_MAX_WIDTH_RATIO;

    const widthMatch = svg.match(/<image[^>]*width="([\d.]+)"/)!;
    expect(parseFloat(widthMatch[1])).toBeCloseTo(expectedLogoSize, 5);

    // Centered: x position + half the logo size should land on the midpoint.
    const xMatch = svg.match(/<image[^>]*x="([\d.]+)"/)!;
    expect(parseFloat(xMatch[1]) + expectedLogoSize / 2).toBeCloseTo(totalWidth / 2, 5);

    // A backing rect (same light color) is drawn behind the logo.
    expect(svg).toContain(`fill="${COLORS.light}"`);
    expect(svg.indexOf('<rect') < svg.indexOf('<image')).toBe(true);
  });
});
