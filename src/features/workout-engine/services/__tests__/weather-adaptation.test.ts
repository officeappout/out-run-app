import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Weather → generator mappings (weather_enabled):
 *   rain      → resolveWorkoutContext 'weather-rain-home' (inferred only)
 *   heat / uv → time −20% (min 15), rest ×1.25, difficulty ≤ 2
 *   cold      → extra warm-up slots
 *   copy      → weather-tagged rows + fallback titles
 */

const state = vi.hoisted(() => ({
  gear: [] as string[],
  resolverCalls: 0,
  ROWS: {} as Record<string, any[]>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _base: string, parentDoc: string) => ({ __parentDoc: parentDoc }),
  getDocs: async (ref: { __parentDoc: string }) => {
    const rows = state.ROWS[ref.__parentDoc] ?? [];
    return { empty: rows.length === 0, docs: rows.map((r) => ({ data: () => r })) };
  },
  query: vi.fn(),
  where: vi.fn(),
}));
vi.mock('../park-equipment-resolver', () => ({
  resolveParkEquipmentIds: async () => {
    state.resolverCalls++;
    return state.gear;
  },
}));
vi.mock('@/features/parks/core/store/useGPSStore', () => ({
  useGPSStore: { getState: () => ({ coords: null, requestPermissionIfAllowed: async () => null }) },
}));
vi.mock('@/config/feature-flags', () => ({ CONTEXT_AWARE_SELECTION_ENABLED: true }));

import {
  adjustTimeForWeather,
  applyWeatherRest,
  capDifficultyForWeather,
  extraWarmupMinutesForWeather,
  weatherRestFactor,
} from '../weather-adaptation';
import { resolveWorkoutContext } from '../workout-context-resolver';
import { extraWarmupSlots } from '../warmup.service';
import { warmupSlotBudget } from '../../logic/session-frame.utils';
import {
  resolveWeatherFallbackTitle,
  resolveWorkoutMetadata,
  scoreWeatherField,
  WEATHER_FALLBACK_TITLES,
  type WorkoutMetadataContext,
} from '../workout-metadata.service';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { WorkoutExercise } from '../../logic/workout-generator.types';

const heat = { flag: 'heat' as const, apparentC: 34, precipProb: 0 };
const uv = { flag: 'uv' as const, apparentC: 28, precipProb: 0 };
const cold = { flag: 'cold' as const, apparentC: 6, precipProb: 0 };
const rain = { flag: 'rain' as const, apparentC: 14, precipProb: 80 };

describe('heat / uv → time, rest, difficulty', () => {
  it('cuts time by 20%, rounded, min 15, never longer than requested', () => {
    expect(adjustTimeForWeather(30, heat)).toBe(24);
    expect(adjustTimeForWeather(45, uv)).toBe(36);
    expect(adjustTimeForWeather(60, heat)).toBe(48);
    expect(adjustTimeForWeather(18, heat)).toBe(15);
    expect(adjustTimeForWeather(12, heat)).toBe(12);
  });

  it('leaves time alone for rain / cold / none', () => {
    for (const w of [rain, cold, { flag: null }, null, undefined]) {
      expect(adjustTimeForWeather(30, w)).toBe(30);
    }
  });

  it('caps difficulty at 2 only for heat-like weather', () => {
    expect(capDifficultyForWeather(3, heat)).toBe(2);
    expect(capDifficultyForWeather(3, uv)).toBe(2);
    expect(capDifficultyForWeather(1, heat)).toBe(1);
    expect(capDifficultyForWeather(3, cold)).toBe(3);
    expect(capDifficultyForWeather(3, null)).toBe(3);
  });

  it('rest ×1.25 on main exercises only, rounded to 5 s', () => {
    expect(weatherRestFactor(heat)).toBe(1.25);
    expect(weatherRestFactor(cold)).toBe(1);
    const ex = (restSeconds: number, exerciseRole?: WorkoutExercise['exerciseRole']) =>
      ({ restSeconds, exerciseRole } as WorkoutExercise);
    const list = [ex(60), ex(90, 'main'), ex(30, 'warmup'), ex(30, 'cooldown'), ex(0)];
    expect(applyWeatherRest(list, heat)).toBe(2);
    expect(list.map((e) => e.restSeconds)).toEqual([75, 115, 30, 30, 0]);
  });

  it('rest untouched without heat', () => {
    const list = [{ restSeconds: 60 } as WorkoutExercise];
    expect(applyWeatherRest(list, rain)).toBe(0);
    expect(list[0].restSeconds).toBe(60);
  });
});

describe('cold → longer warm-up', () => {
  it('maps to +2 minutes → +1 warm-up slot (65 s each)', () => {
    expect(extraWarmupMinutesForWeather(cold)).toBe(2);
    expect(extraWarmupMinutesForWeather(heat)).toBe(0);
    expect(extraWarmupSlots(2)).toBe(1);
    expect(extraWarmupSlots(0)).toBe(0);
    expect(extraWarmupSlots(undefined)).toBe(0);
    // A 15-min session's 2-slot floor becomes 3 in the cold.
    expect(warmupSlotBudget(15) + extraWarmupSlots(extraWarmupMinutesForWeather(cold))).toBe(3);
  });
});

describe('rain → resolveWorkoutContext', () => {
  const profile = { id: 'u1' } as UserFullProfile;
  const gps = { lat: 32.07, lng: 34.78 };

  beforeEach(() => {
    state.gear = ['bar'];
    state.resolverCalls = 0;
  });

  it('inferred park + rain → home, source weather-rain-home, no park lookup', async () => {
    const ctx = await resolveWorkoutContext(profile, 'park', { gpsCoords: gps, weatherFlag: 'rain' });
    expect(ctx).toEqual({ location: 'home', availableGear: [], source: 'weather-rain-home' });
    expect(state.resolverCalls).toBe(0);
  });

  it('street counts as park intent', async () => {
    expect((await resolveWorkoutContext(profile, 'street', { gpsCoords: gps, weatherFlag: 'rain' })).location).toBe('home');
  });

  it('explicit choice (allowHomeOverride:false) is never overridden', async () => {
    const ctx = await resolveWorkoutContext(profile, 'park', { gpsCoords: gps, weatherFlag: 'rain', allowHomeOverride: false });
    expect(ctx).toMatchObject({ location: 'park', source: 'equipped-park' });
  });

  it('non-park request is untouched', async () => {
    expect(await resolveWorkoutContext(profile, 'gym', { weatherFlag: 'rain' })).toMatchObject({ location: 'gym', source: 'non-park' });
  });

  it('heat / no weather → normal park resolution', async () => {
    expect(await resolveWorkoutContext(profile, 'park', { gpsCoords: gps, weatherFlag: 'heat' })).toMatchObject({ location: 'park', source: 'equipped-park' });
    expect(await resolveWorkoutContext(profile, 'park', { gpsCoords: gps })).toMatchObject({ location: 'park', source: 'equipped-park' });
  });
});

describe('weather copy', () => {
  const ctx = (over: Partial<WorkoutMetadataContext> = {}): WorkoutMetadataContext => ({
    persona: null,
    location: 'home',
    timeOfDay: 'morning',
    ...over,
  });

  beforeEach(() => {
    state.ROWS = {};
  });

  it('scoreWeatherField: untagged neutral, match boosted, mismatch excluded', () => {
    expect(scoreWeatherField(undefined, 'rain')).toBe(0);
    expect(scoreWeatherField('', 'rain')).toBe(0);
    expect(scoreWeatherField('any', undefined)).toBe(0);
    expect(scoreWeatherField('rain', 'rain')).toBeGreaterThan(0);
    expect(scoreWeatherField('rain', 'heat')).toBeNull();
    expect(scoreWeatherField('rain', undefined)).toBeNull();
  });

  it('fallback titles: rain only at home; heat/uv share the shade line; cold', () => {
    expect(resolveWeatherFallbackTitle('rain', 'home')).toBe(WEATHER_FALLBACK_TITLES.rainHome);
    expect(resolveWeatherFallbackTitle('rain', 'park')).toBeNull();
    expect(resolveWeatherFallbackTitle('heat', 'park')).toBe(WEATHER_FALLBACK_TITLES.heat);
    expect(resolveWeatherFallbackTitle('uv', 'home')).toBe(WEATHER_FALLBACK_TITLES.heat);
    expect(resolveWeatherFallbackTitle('cold', 'park')).toBe(WEATHER_FALLBACK_TITLES.cold);
    expect(resolveWeatherFallbackTitle(undefined, 'home')).toBeNull();
  });

  it('fallback copy is brand-safe (no em-dash, no emoji)', () => {
    for (const t of Object.values(WEATHER_FALLBACK_TITLES)) {
      expect(t).not.toMatch(/[—–]/);
      expect(t).not.toMatch(/[\uD800-\uDFFF☀-➿]/);
    }
  });

  it('a weather-tagged row never shows without that weather', async () => {
    state.ROWS.workoutTitles = [
      { text: 'אימון גשום', weather: 'rain' },
      { text: 'אימון רגיל' },
    ];
    expect((await resolveWorkoutMetadata(ctx())).title).toBe('אימון רגיל');
    expect((await resolveWorkoutMetadata(ctx({ weather: 'heat' }))).title).toBe('אימון רגיל');
  });

  it('a matching weather row wins over generic rows', async () => {
    state.ROWS.workoutTitles = [
      { text: 'אימון רגיל', location: 'home' },
      { text: 'אימון גשום', weather: 'rain' },
    ];
    const m = await resolveWorkoutMetadata(ctx({ weather: 'rain', allowWeatherFallbackTitle: true }));
    expect(m.title).toBe('אימון גשום');
  });

  it('no weather row → fallback title, only when the caller allows it', async () => {
    state.ROWS.workoutTitles = [{ text: 'אימון רגיל' }];
    expect((await resolveWorkoutMetadata(ctx({ weather: 'rain', allowWeatherFallbackTitle: true }))).title)
      .toBe(WEATHER_FALLBACK_TITLES.rainHome);
    expect((await resolveWorkoutMetadata(ctx({ weather: 'cold', location: 'park', allowWeatherFallbackTitle: true }))).title)
      .toBe(WEATHER_FALLBACK_TITLES.cold);
    expect((await resolveWorkoutMetadata(ctx({ weather: 'rain' }))).title).toBe('אימון רגיל');
  });
});
