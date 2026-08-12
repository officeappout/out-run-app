#!/usr/bin/env npx tsx
/**
 * scripts/audit-location-coordinate-completeness.ts
 *
 * HARD PRE-SHIP GATE — every subLocation `id` in ISRAELI_LOCATIONS must
 * have a matching key in DEFAULT_COORDINATES. This is the check that was
 * missing throughout the whole multi-city neighborhood-mapping project:
 * per-city hard gates checked NEW entries for internal duplicates, but
 * never verified that EXISTING ("kept unchanged") entries actually had a
 * working coordinate. That gap let the neighborhood-centering bug ship
 * silently across ~30 cities before David caught it live (Haifa +
 * Herzliya, 12.08.2026 investigation).
 *
 * Root cause this gate defends against: `getDefaultCoordinates(id, parentId)`
 * in location-utils.ts falls through DEFAULT_COORDINATES[id] →
 * DEFAULT_COORDINATES[parentId] → a hardcoded Tel Aviv literal whenever a
 * neighborhood's own id has no matching key. The live geocode guard
 * (NEIGHBORHOOD_GEOCODE_GUARD_ENABLED) can only PROTECT a correct static
 * value from being overwritten by a bad Mapbox match — it cannot invent a
 * correct value when the static lookup itself already failed. A missing
 * key is silent: no error, no warning, just a neighborhood that quietly
 * lands on the city (or Tel Aviv) instead of itself.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/audit-location-coordinate-completeness.ts
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/audit-location-coordinate-completeness.ts --city=haifa   (scope to one city)
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/audit-location-coordinate-completeness.ts --json         (machine-readable dump)
 *
 * Exit code: 0 if every id has a matching key, 1 otherwise. Intended to be
 * called as a hard gate before any city's build is considered shippable —
 * a non-zero exit means STOP, do not merge/deploy.
 */

import { ISRAELI_LOCATIONS } from '../src/lib/data/israel-locations';
import { DEFAULT_COORDINATES } from '../src/features/user/onboarding/components/steps/UnifiedLocation/location-constants';

const cityFilter = process.argv.find((a) => a.startsWith('--city='))?.split('=')[1];
const jsonOutput = process.argv.includes('--json');

interface CityResult {
  cityId: string;
  cityName: string;
  totalIds: number;
  missingIds: string[];
}

const results: CityResult[] = [];

for (const loc of ISRAELI_LOCATIONS) {
  if (cityFilter && loc.id !== cityFilter) continue;
  if (!loc.subLocations || loc.subLocations.length === 0) continue;

  const allIds = loc.subLocations.map((s) => s.id);
  const missingIds = allIds.filter((id) => !(id in DEFAULT_COORDINATES));

  if (missingIds.length > 0) {
    results.push({
      cityId: loc.id,
      cityName: loc.name,
      totalIds: allIds.length,
      missingIds,
    });
  }
}

const totalMissing = results.reduce((sum, r) => sum + r.missingIds.length, 0);
const totalCitiesAffected = results.length;

if (jsonOutput) {
  console.log(JSON.stringify({ totalCitiesAffected, totalMissing, results }, null, 2));
} else {
  console.log(`── Location Coordinate Completeness Audit ──`);
  console.log(`Checked ${ISRAELI_LOCATIONS.length} top-level locations${cityFilter ? ` (filtered to: ${cityFilter})` : ''}\n`);

  if (results.length === 0) {
    console.log(`✅  PASS — every subLocation id has a matching DEFAULT_COORDINATES key.`);
  } else {
    console.log(`❌  FAIL — ${totalCitiesAffected} cities have ${totalMissing} ids with no matching coordinate key:\n`);
    for (const r of results) {
      console.log(`${r.cityName} (${r.cityId}): ${r.missingIds.length}/${r.totalIds} missing`);
      for (const id of r.missingIds) {
        console.log(`   - ${id}`);
      }
    }
    console.log(`\nTotal: ${totalCitiesAffected} cities, ${totalMissing} missing ids.`);
  }
}

process.exit(results.length > 0 ? 1 : 0);
