/**
 * Kelly round 4 — get_weather's answer for the model. Pure (a derived HomeWeather in, facts out).
 */
import type { HomeWeather } from '@/features/weather/core/derive-home-weather';

const ADVICE: Record<string, string> = {
  rain: 'Rain is likely in the next hours: suggest training at home, or outside later when it is dry.',
  heat: 'It is very hot: suggest early morning or the evening, shade, water, and a shorter or easier session.',
  cold: 'It is cold: suggest a longer warm-up and layers; training outside is fine.',
  uv: 'Strong sun: suggest shade or a later hour, and water.',
};

export function weatherToolResult(w: HomeWeather, originKind: string): Record<string, unknown> {
  const c = w.classification;
  return {
    available: true,
    area: originKind === 'recent' ? "the user's recent location" : originKind === 'home_area' ? "the user's home area" : "the user's city",
    temperatureC: w.temperatureC === null ? null : Math.round(w.temperatureC),
    feelsLikeC: c.apparentC === null ? null : Math.round(c.apparentC),
    rainChanceNext3hPct: c.precipProb,
    uv: c.uv,
    isNight: w.isNight,
    flag: c.flag,
    labelHe: c.label,
    noteForCoach: [
      c.flag ? ADVICE[c.flag] : 'Nothing special: a good time to train outside.',
      'Fold it into your answer in one short phrase in Hebrew (for example the temperature and what it means for training). Use only these numbers.',
    ].join(' '),
  };
}

export const WEATHER_UNAVAILABLE = {
  available: false,
  noteForCoach: 'No weather data for this user right now. Answer in Hebrew only. If the user asked about the weather, say in one short sentence: כרגע אין לי נתוני מזג אוויר, and offer what you can do. Otherwise do not mention the weather.',
} as const;

/**
 * plan_aerobic_session also carries the weather (when available), so a walk or run is never
 * recommended blind to rain or heat even when the model skips get_weather.
 */
export function withWeather(result: Record<string, unknown>, weather: Record<string, unknown>): Record<string, unknown> {
  if (weather.available !== true) return result;
  const notes = Array.isArray(result.notesForCoach) ? (result.notesForCoach as string[]) : [];
  return {
    ...result,
    weatherNow: { temperatureC: weather.temperatureC, feelsLikeC: weather.feelsLikeC, flag: weather.flag, labelHe: weather.labelHe },
    notesForCoach: [...notes, `Weather for this outing: ${String(weather.noteForCoach ?? '')}`],
  };
}
