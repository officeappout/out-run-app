/**
 * Weather — shared types (client + server + workout engine).
 *
 * Plain data only: no Firebase / Next imports, so the engine, the API route and the
 * home hook can all share it. The provider adapters normalise their raw responses into
 * these shapes, so nothing downstream knows which provider produced the numbers.
 */

/** One point in time (the current conditions, or one hour of the forecast). */
export interface WeatherPoint {
  /** Local wall-clock time in Asia/Jerusalem, ISO-like without offset: 'YYYY-MM-DDTHH:mm'. */
  time: string;
  temperatureC: number | null;
  apparentC: number | null;
  /** Precipitation in mm for the interval (≈ mm/h for hourly points). */
  precipMm: number | null;
  /** 0-100. */
  precipProb: number | null;
  uv: number | null;
  windKmh: number | null;
  /** WMO weather interpretation code. */
  weatherCode: number | null;
}

/** What a provider returns for one cell: now + the next hours (current hour first). */
export interface WeatherSnapshot {
  provider: string;
  /** Epoch ms when the provider was queried. */
  fetchedAt: number;
  now: WeatherPoint;
  /** Up to 7 hourly points, starting with the current hour (= now + next 6h). */
  hourly: WeatherPoint[];
}

/** /api/weather response body. */
export interface WeatherApiResponse {
  cell: string;
  snapshot: WeatherSnapshot;
  /** True when the provider failed and a <3h-old cached copy was served instead. */
  stale?: boolean;
}

export type WeatherFlag = 'rain' | 'heat' | 'cold' | 'uv';

export interface WeatherClassification {
  flag: WeatherFlag | null;
  apparentC: number | null;
  /** Max precipitation probability over now + next 3h (0-100). */
  precipProb: number | null;
  uv: number | null;
  /** Short Hebrew hint for the home chip — null when nothing is flagged. */
  label: string | null;
}

/** The slim weather signal the workout generator reads (HomeWorkoutOptions.weather). */
export interface WorkoutWeather {
  flag: WeatherFlag | null;
  apparentC?: number | null;
  precipProb?: number | null;
}
