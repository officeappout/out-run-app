/**
 * station-source — resolve WHAT equipment/location a hybrid station uses (Phase א).
 *
 * A station is "a strength block defined by (equipment + location)"; the equipment
 * SOURCE is an input, not new engine code (see HYBRID_ENGINE_DESIGN §station). The
 * resolver is the ALWAYS-PRESENT fallback chain — MVP: **park → bodyweight** (never
 * silent). Future kinds (home / travel / user-equipment) plug in as new branches.
 */

import type { StopLocationKind } from './compose-hybrid-session.service';
import type { FindStationParkOpts } from './find-station-park.service';

export type HybridStationSourceKind = 'park' | 'bodyweight'; // phase ד: 'home' | 'travel' | 'user_equipment'

export interface HybridStationSource {
  kind: HybridStationSourceKind;
  locationKind: StopLocationKind;
  /** Canonical gear ids; bodyweight = []. */
  availableEquipment: string[];
  parkId?: string;
  name?: string;
  image?: string;
  lat?: number;
  lng?: number;
  waypointIndex?: number;
  /** Friendly message when we fell back (shown by the UI; logged for now). */
  uiHint?: string;
}

/** Min exercises a station needs AFTER level/program filtering; below → bodyweight top-up (composer). */
export const MIN_STATION_EXERCISES = 3;

/**
 * Resolve the station source for a route. MVP chain: real PRIMARY park with
 * translatable equipment → else a bodyweight block (with a friendly hint).
 */
export async function resolveStationSource(
  routePath: [number, number][],
  opts: FindStationParkOpts = {},
): Promise<HybridStationSource> {
  const { findStationPark } = await import('./find-station-park.service');
  // Prefer a station a real walk away (300 m–1.2 km) over one on top of the user.
  const park = await findStationPark(routePath, {
    ...opts,
    walkBand: opts.walkBand ?? { minMeters: 300, maxMeters: 1200 },
  });
  if (park) {
    return {
      kind: 'park',
      locationKind: 'gym',
      availableEquipment: park.availableEquipment,
      parkId: park.parkId,
      name: park.name,
      image: park.image,
      lat: park.lat,
      lng: park.lng,
      waypointIndex: park.waypointIndex,
    };
  }
  // Fallback rung (Q6) — never returns nothing.
  return {
    kind: 'bodyweight',
    locationKind: 'open_area',
    availableEquipment: [],
    uiHint: 'לא מצאנו גינה בקרבת מקום — נסגור עם בלוק כוח משקל-גוף',
  };
}
