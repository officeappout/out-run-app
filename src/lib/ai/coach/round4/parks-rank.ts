/**
 * Kelly round 4 — find_nearby_parks: pick the closest suitable outdoor gyms. Pure.
 *
 * Equipment is classified from the gym_equipment catalog (name + iconKey + isFunctional) into
 * a few calisthenics groups; a park qualifies for a focus when it has a matching group.
 * Distances are straight-line from the user's area (never shown as coordinates).
 */
import type { FindNearbyParksInputT } from './tool-specs';
import type { ParkCardView } from './types';

export type GearGroup = 'pullup' | 'parallel' | 'rings' | 'straps' | 'steps' | 'ab_bench' | 'ladder' | 'machines';

export const GEAR_GROUP_HE: Record<GearGroup, string> = {
  pullup: 'מתח',
  parallel: 'מקבילים',
  rings: 'טבעות',
  straps: 'רצועות חתירה',
  steps: 'מדרגות אימון',
  ab_bench: 'מיטת בטן',
  ladder: 'סולם',
  machines: 'מכשירי כושר',
};

/** Shown first: what a calisthenics user trains on. */
const GROUP_ORDER: GearGroup[] = ['pullup', 'parallel', 'rings', 'straps', 'ladder', 'ab_bench', 'steps', 'machines'];

export function classifyGear(e: { name?: unknown; iconKey?: unknown; isFunctional?: unknown }): GearGroup | null {
  const name = typeof e.name === 'string' ? e.name : '';
  const icon = typeof e.iconKey === 'string' ? e.iconKey.toLowerCase() : '';
  if (icon.startsWith('pullupbar') || /מתח/.test(name)) return /סולם/.test(name) ? 'ladder' : 'pullup';
  if (icon.startsWith('parallel_bars') || /מקבילים/.test(name)) return 'parallel';
  if (icon === 'ring_park' || /טבעות/.test(name)) return 'rings';
  if (icon === 'trx' || /רצועות/.test(name)) return 'straps';
  if (icon === 'training_steps' || /מדרגות/.test(name)) return 'steps';
  if (/מיטת עליית בטן|קירוב ברכיים/.test(name)) return 'ab_bench';
  if (/סולם/.test(name)) return 'ladder';
  if (e.isFunctional === true) return null; // boxing bags, bosu: not a workout anchor
  return name ? 'machines' : null;
}

const FOCUS_GROUPS: Record<FindNearbyParksInputT['focus'], GearGroup[]> = {
  pull: ['pullup', 'rings', 'straps', 'ladder'],
  push: ['parallel', 'rings'],
  core: ['pullup', 'parallel', 'ab_bench', 'ladder'],
  legs: ['steps', 'pullup', 'parallel', 'machines'],
  any: ['pullup', 'parallel', 'rings', 'straps', 'ladder'],
};

export interface ParkCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  groups: GearGroup[];
  area: string | null;
}

/** Further than this is not "nearby". */
export const NEARBY_MAX_KM = 15;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rankNearbyParks(parks: readonly ParkCandidate[], origin: { lat: number; lng: number }, focus: FindNearbyParksInputT['focus'], max = 3): ParkCardView[] {
  const want = new Set(FOCUS_GROUPS[focus]);
  return parks
    .filter((p) => p.groups.some((g) => want.has(g)))
    .map((p) => ({ p, km: haversineKm(origin, p) }))
    .filter((x) => x.km <= NEARBY_MAX_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, max)
    .map(({ p, km }) => ({
      parkId: p.id,
      name: p.name.slice(0, 80),
      distanceKm: Math.round(km * 10) / 10,
      equipment: GROUP_ORDER.filter((g) => p.groups.includes(g)).slice(0, 4).map((g) => GEAR_GROUP_HE[g]),
      area: p.area,
    }));
}

/** What the model reads back. */
export function parksToolResult(parks: ParkCardView[], originKind: 'recent' | 'home_area' | 'city' | null): Record<string, unknown> {
  if (!originKind) {
    return {
      found: false,
      reason: 'no_location',
      noteForCoach: 'The app does not know the user\'s area yet. Say so simply and suggest the "מפה" tab, which shows the parks around them.',
    };
  }
  if (parks.length === 0) {
    return {
      found: false,
      reason: 'none_nearby',
      noteForCoach: 'No outdoor gym with this equipment was found within 15 km. Say so and suggest the "מפה" tab to look further.',
    };
  }
  return {
    found: true,
    from: originKind === 'recent' ? 'the user\'s recent location' : originKind === 'home_area' ? 'the user\'s home area' : 'the user\'s city centre',
    parks: parks.map((p) => ({ name: p.name, distanceKm: p.distanceKm, equipment: p.equipment, area: p.area })),
    noteForCoach: 'The parks are shown under your reply; a tap opens the park on the map. Name them with the distance and one or two key items each, in one or two short sentences. Never add parks or equipment that are not here.',
  };
}
