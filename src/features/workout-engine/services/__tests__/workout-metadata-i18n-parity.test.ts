/**
 * i18n wave 2B (namespace `coach`, keys `title.weather.*`): the weather fallback titles of
 * workout-metadata.service.ts. Snapshot recorded from UNMODIFIED origin/main before the extraction.
 * NOTE: these titles end up in the workout title that is SAVED with the workout (history) — the stored string must stay identical.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn() }));
vi.mock('@/features/parks/core/store/useGPSStore', () => ({
  useGPSStore: { getState: () => ({ coords: null, requestPermissionIfAllowed: async () => null }) },
}));

import { resolveWeatherFallbackTitle, WEATHER_FALLBACK_TITLES } from '../workout-metadata.service';

describe('workout-metadata weather titles parity', () => {
  it('every weather flag x location', async () => {
    const lines: string[] = [JSON.stringify(WEATHER_FALLBACK_TITLES)];
    for (const w of ['rain', 'heat', 'uv', 'cold', undefined, null] as const) {
      for (const loc of ['home', 'park', 'gym', 'office', undefined] as const) {
        lines.push(`${String(w)} | ${String(loc)}: ${JSON.stringify(resolveWeatherFallbackTitle(w as never, loc as never))}`);
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot('./__snapshots__/workout-metadata-i18n/weather-titles.txt');
  });
});
