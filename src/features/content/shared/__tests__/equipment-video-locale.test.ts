import { describe, it, expect } from 'vitest';
import {
  brandVideoUrlForLang,
  resolveBrandVideoUrl,
} from '@/features/content/equipment/gym/core/gym-equipment-brand.utils';
import type { EquipmentBrand } from '@/features/content/equipment/gym/core/gym-equipment.types';

const HE = 'https://player.mediadelivery.net/play/640043/he-guid';
const EN = 'https://player.mediadelivery.net/play/640043/en-guid';
const both: EquipmentBrand = { brandName: 'Ludos', videoUrl: HE, videoUrlEn: EN };
const heOnly: EquipmentBrand = { brandName: 'Urbanics', videoUrl: HE };
const blankEn: EquipmentBrand = { brandName: 'X', videoUrl: HE, videoUrlEn: '  ' };
const none: EquipmentBrand = { brandName: 'None' };

describe('brandVideoUrlForLang', () => {
  it('he (and the default) is exactly videoUrl', () => {
    expect(brandVideoUrlForLang(both)).toBe(HE);
    expect(brandVideoUrlForLang(both, 'he')).toBe(HE);
    expect(brandVideoUrlForLang(none, 'he')).toBeUndefined();
  });
  it('en picks videoUrlEn when set', () => {
    expect(brandVideoUrlForLang(both, 'en')).toBe(EN);
  });
  it('en falls back to videoUrl when videoUrlEn is missing or blank', () => {
    expect(brandVideoUrlForLang(heOnly, 'en')).toBe(HE);
    expect(brandVideoUrlForLang(blankEn, 'en')).toBe(HE);
  });
  it('null brand is undefined', () => {
    expect(brandVideoUrlForLang(null, 'en')).toBeUndefined();
  });
});

describe('resolveBrandVideoUrl with a language', () => {
  const brands = [none, both];
  it('default and he are identical to before (own, else another brand)', () => {
    expect(resolveBrandVideoUrl(brands, both)).toBe(HE);
    expect(resolveBrandVideoUrl(brands, none)).toBe(HE);
    expect(resolveBrandVideoUrl(brands, none, 'he')).toBe(HE);
    expect(resolveBrandVideoUrl([none], none)).toBeUndefined();
  });
  it('en uses the English video, including through the other-brand fallback', () => {
    expect(resolveBrandVideoUrl(brands, both, 'en')).toBe(EN);
    expect(resolveBrandVideoUrl(brands, none, 'en')).toBe(EN);
  });
  it('en keeps the Hebrew video when no English one exists', () => {
    expect(resolveBrandVideoUrl([none, heOnly], none, 'en')).toBe(HE);
  });
  it('an English-only brand still plays for en', () => {
    const enOnly: EquipmentBrand = { brandName: 'E', videoUrlEn: EN };
    expect(resolveBrandVideoUrl([enOnly], enOnly, 'en')).toBe(EN);
    expect(resolveBrandVideoUrl([enOnly], enOnly, 'he')).toBeUndefined();
  });
});
