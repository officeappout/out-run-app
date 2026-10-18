/**
 * deriveHomeWeather — pure: a cached/fetched snapshot + a clock → what home shows and
 * what the generator reads. Lives in core (no React / Firebase) so it is unit-testable.
 */

import { classifyWeather, jerusalemHourKey, selectUpcomingHours } from './classify-weather';
import type { WeatherClassification, WeatherSnapshot, WorkoutWeather } from './weather.types';

export interface HomeWeather {
  snapshot: WeatherSnapshot;
  classification: WeatherClassification;
  /** The slim signal the workout generator reads (HomeWorkoutOptions.weather). */
  workoutWeather: WorkoutWeather;
  temperatureC: number | null;
  weatherCode: number | null;
  /** 19:00-05:59 Israel time — the chip shows a moon instead of a sun on clear nights. */
  isNight: boolean;
}

export function deriveHomeWeather(snapshot: WeatherSnapshot, at: Date = new Date()): HomeWeather {
  const { key, hour } = jerusalemHourKey(at);
  const upcoming = selectUpcomingHours(snapshot.hourly, key, 3);
  const classification = classifyWeather(snapshot.now, upcoming, hour);
  return {
    snapshot,
    classification,
    workoutWeather: {
      flag: classification.flag,
      apparentC: classification.apparentC,
      precipProb: classification.precipProb,
    },
    temperatureC: snapshot.now.temperatureC,
    weatherCode: snapshot.now.weatherCode,
    isNight: hour >= 19 || hour < 6,
  };
}
