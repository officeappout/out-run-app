/**
 * Apparent ("feels like") temperature — Australian Bureau of Meteorology formula
 * (Steadman 1994, the non-radiation version). It is the same family Open-Meteo uses for
 * `apparent_temperature`, so the heat/cold thresholds in classify-weather.ts mean the
 * same thing whichever provider produced the numbers.
 *
 *   AT = Ta + 0.33·e − 0.70·ws − 4.00
 *   e  = (RH / 100) · 6.105 · exp(17.27·Ta / (237.7 + Ta))     water-vapour pressure, hPa
 *
 * Ta °C, RH %, ws = wind speed at 10 m in m/s. Pure; null in → null out.
 */

export function apparentTemperatureC(
  tempC: number | null | undefined,
  relativeHumidity: number | null | undefined,
  windMs: number | null | undefined,
): number | null {
  if (typeof tempC !== 'number' || !Number.isFinite(tempC)) return null;
  if (typeof relativeHumidity !== 'number' || !Number.isFinite(relativeHumidity)) return null;
  const rh = Math.min(100, Math.max(0, relativeHumidity));
  const ws = typeof windMs === 'number' && Number.isFinite(windMs) ? Math.max(0, windMs) : 0;
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  const at = tempC + 0.33 * e - 0.7 * ws - 4.0;
  return Math.round(at * 10) / 10;
}

export const kmhToMs = (kmh: number): number => kmh / 3.6;
export const msToKmh = (ms: number): number => ms * 3.6;
