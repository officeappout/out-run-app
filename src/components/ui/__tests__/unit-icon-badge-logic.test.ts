import { describe, it, expect } from 'vitest';
import { badgeGradient, unitBadgeGlyph } from '../unit-icon-badge-logic';

describe('unitBadgeGlyph', () => {
  it('extracts the embedded number from a real designator name', () => {
    expect(unitBadgeGlyph('גדוד 51')).toBe('51');
    expect(unitBadgeGlyph('חטיבה 810 (ההרים - מרחבית)')).toBe('810');
  });

  it('falls back to the first character for a nameless unit', () => {
    expect(unitBadgeGlyph('סיירת גולני')).toBe('ס');
    expect(unitBadgeGlyph('חטמ"ר אפרים')).toBe('ח');
  });

  it('prefers an explicit displayNumber over extracting from name', () => {
    expect(unitBadgeGlyph('גדוד 51', 999)).toBe('999');
  });
});

describe('badgeGradient', () => {
  it('is deterministic — same seed always produces the same gradient', () => {
    expect(badgeGradient('bn_51')).toBe(badgeGradient('bn_51'));
  });

  it('varies across different seeds (not a constant)', () => {
    const seeds = ['bn_51', 'bn_79', 'bn_7107', 'bde_1', 'bde_810'];
    const gradients = new Set(seeds.map(badgeGradient));
    expect(gradients.size).toBeGreaterThan(1);
  });
});
