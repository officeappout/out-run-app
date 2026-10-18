import { describe, expect, it } from 'vitest';
import { isWeatherOnFor } from '../core/weather-access';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

describe('isWeatherOnFor', () => {
  it('weather_enabled off → nobody, admins included', () => {
    expect(isWeatherOnFor({ weatherEnabled: false, weatherAdminsOnly: true }, true)).toBe(false);
    expect(isWeatherOnFor({ weatherEnabled: false, weatherAdminsOnly: false }, true)).toBe(false);
    expect(isWeatherOnFor({ weatherEnabled: false, weatherAdminsOnly: false }, false)).toBe(false);
  });

  it('on + admins-only → super admins only', () => {
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: true }, true)).toBe(true);
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: true }, false)).toBe(false);
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: true }, undefined)).toBe(false);
  });

  it('on + admins-only off → everyone', () => {
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: false }, false)).toBe(true);
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: false }, true)).toBe(true);
  });
});

describe('weather flag defaults', () => {
  it('weather_enabled fails closed; weather_admins_only defaults ON so a first flip reaches admins only', () => {
    expect(FLAG_DEFS.find((d) => d.firestoreKey === 'weather_enabled')).toMatchObject({ defaultValue: false });
    expect(FLAG_DEFS.find((d) => d.firestoreKey === 'weather_admins_only')).toMatchObject({ key: 'weatherAdminsOnly', defaultValue: true });
  });

  it('a doc with only weather_enabled:true (admins-only key missing) → admins only', () => {
    const adminsOnlyDefault = FLAG_DEFS.find((d) => d.key === 'weatherAdminsOnly')!.defaultValue;
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: adminsOnlyDefault }, false)).toBe(false);
    expect(isWeatherOnFor({ weatherEnabled: true, weatherAdminsOnly: adminsOnlyDefault }, true)).toBe(true);
  });
});
