/**
 * generator-elevation.service.ts — thin async bridge between the live
 * generator's construction sites (route-generator.service.ts, browser-
 * side) and the cached DEM tile set (src/lib/dem-tile-cache/). NOT a live
 * per-route Mapbox call — see dem-tile-cache-client.ts's own header: this
 * only ever reads already-cached, already-decoded elevation tiles from
 * Firebase Storage (warmed once, city-wide, by
 * scripts/populate-route-elevation-tlv.ts or its future per-city
 * siblings) — that separation (live per-request DEM fetch vs. cached-tile
 * sampling) is exactly what Stage 0's own scope correction called out as
 * the hard line between "reconnect what's already computed" (in scope)
 * and "new live per-request DEM fetch" (out of scope for this whole plan).
 *
 * Graceful degradation is the load-bearing property here: a route outside
 * whatever bbox has been cache-warmed (any city other than the current
 * TLV pilot, today) MUST fall back to today's exact behavior — a
 * hardcoded 'easy' difficulty literal, no elevationGain/maxGrade — never
 * throw, never block route generation on a cache miss.
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase B (DEM tile cache),
 * autonomous build run 18.08.2026.
 */

import { boundingBoxWithMargin } from '@/lib/dem-tile-cache/tile-math';
import { computeDemProfile } from '@/lib/dem-tile-cache/dem-sampling.service';
import { loadCachedTilesClient } from '@/lib/dem-tile-cache/dem-tile-cache-client';
import { computeDifficulty, difficultyLevelToRouteDifficulty } from './route-difficulty.service';

const BBOX_MARGIN_METERS = 300;

export interface GeneratorDifficultyResult {
  difficulty: 'easy' | 'medium' | 'hard';
  /** Present only when real DEM coverage was found for this path — absent
   *  (not zero) on a cache miss, so a reader can tell "computed as flat"
   *  apart from "no real data available," same discipline as the route
   *  type's own optional elevationGain/maxGrade fields. */
  elevationGain?: number;
  maxGrade?: number;
}

const FALLBACK: GeneratorDifficultyResult = { difficulty: 'easy' };

/**
 * `path` is the generator's own internal tuple order, [lng, lat] (verified
 * against pathLengthMeters's own haversineMeters(path[i][1], path[i][0],
 * ...) call, geoUtils.ts:431) — NOT the {lat,lng} object shape Firestore-
 * stored route docs use (a separate, later serialization). Converts to
 * [lat, lng] internally, matching dem-sampling.service.ts's own convention.
 *
 * Never throws — any failure (no cache coverage, a Storage read error)
 * degrades to FALLBACK so a DEM hiccup can never block route generation.
 */
export async function computeGeneratorDifficulty(path: Array<[number, number]>): Promise<GeneratorDifficultyResult> {
  if (path.length < 2) return FALLBACK;

  try {
    const pathLatLng: Array<[number, number]> = path.map(([lng, lat]) => [lat, lng]);
    const bbox = boundingBoxWithMargin(pathLatLng.map(([lat, lng]) => ({ lat, lng })), BBOX_MARGIN_METERS);
    const tiles = await loadCachedTilesClient(bbox);
    if (tiles.size === 0) return FALLBACK; // no cache coverage for this area at all — cheap early exit

    const profile = computeDemProfile(pathLatLng, tiles);
    if (!profile) return FALLBACK; // partial coverage gap along this specific path

    let distanceMeters = 0;
    for (let i = 1; i < path.length; i++) {
      const [lng1, lat1] = path[i - 1];
      const [lng2, lat2] = path[i];
      const R = 6_371_000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const s = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      distanceMeters += R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }
    const distanceKm = distanceMeters / 1000;

    const result = computeDifficulty(profile.elevationGainM, profile.maxGradePercent, distanceKm);
    return {
      difficulty: difficultyLevelToRouteDifficulty(result.level),
      elevationGain: profile.elevationGainM,
      maxGrade: profile.maxGradePercent,
    };
  } catch (err) {
    console.warn('[generator-elevation] cached-DEM lookup failed, falling back to default difficulty:', err);
    return FALLBACK;
  }
}
