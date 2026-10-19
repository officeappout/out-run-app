/**
 * The minimal profile snapshot attached to every log: levels per track, persona ids, the
 * coarse area (geohash-5 of the neighborhood anchor, or of a given point) and generation
 * flags. Never a name, email, phone, birth date or exact coordinate.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { areaGeohash5 } from '@/lib/generation-review/geo';
import type { GenerationInput } from '@/lib/generation-review/types';

/** Flags that change what the generators produce. */
const GENERATION_FLAGS = [
  'enableHybridCardsV2',
  'enableBudgetLightMode',
  'enableCalmReturnV1',
  'enableRouteQualityV1',
  'enableGraphhopperRoutes',
  'enableLoopsPreferOfficial',
  'enableFullParkWorkout',
  'enableRouteStops',
  'enableNoAutoStrengthLevel',
  'aiCoachRound4',
] as const;

const TRACK_TO_LEVEL_KEY: Record<string, string> = {
  push: 'push',
  pull: 'pull',
  legs: 'legs',
  lower_body: 'legs',
  core: 'core',
  full_body: 'overall',
  upper_body: 'upper',
};

export function profileInput(at?: { lat: number; lng: number } | null): Pick<GenerationInput, 'levels' | 'personaIds' | 'areaGeohash5' | 'flags'> {
  const p = useUserStore.getState().profile;
  const levels: Record<string, number> = {};
  const tracks = (p?.progression?.tracks ?? {}) as Record<string, { currentLevel?: unknown } | undefined>;
  for (const [id, t] of Object.entries(tracks)) {
    const key = TRACK_TO_LEVEL_KEY[id];
    const lvl = t?.currentLevel;
    if (key && typeof lvl === 'number' && Number.isFinite(lvl)) levels[key] = lvl;
  }
  const personaIds = (Array.isArray(p?.personas) ? p.personas : [])
    .map((e) => (e && typeof e.id === 'string' ? e.id : null))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 10) as string[];
  const flags: Record<string, boolean> = {};
  for (const k of GENERATION_FLAGS) flags[k] = readLiveFlag(k);
  return {
    levels,
    personaIds,
    areaGeohash5: at ? areaGeohash5(at.lat, at.lng) : areaGeohash5(p?.core?.anchorLat, p?.core?.anchorLng),
    flags,
  };
}

/** The user's gear list for a location ('home' / 'office' / 'outdoor'), null = unknown. */
export function userGear(location: string | null | undefined): string[] | null {
  const eq = useUserStore.getState().profile?.equipment;
  if (!eq || !location) return null;
  const list = location === 'home' ? eq.home : location === 'office' ? eq.office : null;
  return Array.isArray(list) ? list.slice(0, 40) : null;
}
