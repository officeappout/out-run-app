/**
 * classifyWeather — pure: turns now + the next 3 hours into ONE flag the app reacts to.
 *
 * Rules (owner's spec):
 *   rain  precipitation_probability ≥ 60% in the next 3h, or ≥ 0.5 mm/h (now or next 3h)
 *   heat  apparent temperature ≥ 32°C
 *   uv    UV index ≥ 8 between 10:00 and 16:00 (Israel time)
 *   cold  apparent temperature ≤ 10°C
 *
 * Priority when several apply: rain > heat > uv > cold. Rain moves an inferred park
 * workout home, so it wins; heat already implies "shade / evening", so it beats uv.
 */

import type { WeatherClassification, WeatherFlag, WeatherPoint } from './weather.types';

export const RAIN_PROB_THRESHOLD = 60;
export const RAIN_MM_PER_HOUR_THRESHOLD = 0.5;
export const HEAT_APPARENT_C = 32;
export const COLD_APPARENT_C = 10;
export const UV_THRESHOLD = 8;
export const UV_WINDOW = { fromHour: 10, toHour: 16 } as const;

/** Short Hebrew hints for the home chip. Gender-neutral, no emoji, no em-dashes. */
export const WEATHER_LABELS_HE: Record<WeatherFlag, string> = {
  rain: 'גשום היום',
  heat: 'חם מאוד, עדיף בצל או בערב',
  uv: 'קרינה חזקה, עדיף בצל',
  cold: 'קר בחוץ, מתחממים טוב',
};

type PointLike = Pick<WeatherPoint, 'apparentC' | 'precipMm' | 'precipProb' | 'uv'>;

function maxOf(values: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && (best === null || v > best)) best = v;
  }
  return best;
}

export function classifyWeather(
  now: PointLike,
  next3h: PointLike[],
  hour: number,
): WeatherClassification {
  const window = [now, ...next3h.slice(0, 3)];
  const precipProb = maxOf(window.map((p) => p.precipProb));
  const maxMm = maxOf(window.map((p) => p.precipMm));
  const apparentC = typeof now.apparentC === 'number' && Number.isFinite(now.apparentC) ? now.apparentC : null;
  const uv = typeof now.uv === 'number' && Number.isFinite(now.uv) ? now.uv : null;

  let flag: WeatherFlag | null = null;
  if ((precipProb !== null && precipProb >= RAIN_PROB_THRESHOLD) || (maxMm !== null && maxMm >= RAIN_MM_PER_HOUR_THRESHOLD)) {
    flag = 'rain';
  } else if (apparentC !== null && apparentC >= HEAT_APPARENT_C) {
    flag = 'heat';
  } else if (uv !== null && uv >= UV_THRESHOLD && hour >= UV_WINDOW.fromHour && hour < UV_WINDOW.toHour) {
    flag = 'uv';
  } else if (apparentC !== null && apparentC <= COLD_APPARENT_C) {
    flag = 'cold';
  }

  return { flag, apparentC, precipProb, uv, label: flag ? WEATHER_LABELS_HE[flag] : null };
}

/**
 * The forecast hours that are still ahead of `nowLocalKey` ('YYYY-MM-DDTHH', Israel
 * time). Provider times are local wall-clock strings in the same zone, so a plain string
 * compare on the hour prefix is exact. The current hour counts as "ahead".
 */
export function selectUpcomingHours(hourly: WeatherPoint[], nowLocalKey: string, count = 3): WeatherPoint[] {
  return hourly.filter((h) => h.time.slice(0, 13) >= nowLocalKey).slice(0, count);
}

/** 'YYYY-MM-DDTHH' + the hour (0-23) for a Date, in Asia/Jerusalem. */
export function jerusalemHourKey(date: Date): { key: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  return { key: `${get('year')}-${get('month')}-${get('day')}T${String(hour).padStart(2, '0')}`, hour };
}
