/**
 * scripts/tag-route-amenities.ts — Phase 3 of the route↔amenity tagging plan
 * (David-approved 01.09.2026): joins `osm_amenities` onto `official_routes`
 * per city, writing the dual-layer signal (`Route.nearbyAmenities` detailed
 * array + `Route.qualitySignals.amenities` flat summary).
 *
 * Deliberately a FRESH, standalone script — NOT wired into
 * InventoryService.recomputeRouteEnrichmentForCity / IS_ROUTE_ENRICHMENT_
 * ORCHESTRATOR_ENABLED. Investigation before this build found that
 * pipeline's own route-side output has never landed in production and its
 * climb-side cross-refs are stale/orphaned (see route-amenity-tagging.
 * service.ts's header) — this script does not inherit that flag, that
 * orchestrator, or any assumption that pipeline's existing output is
 * trustworthy. Mirrors extract-osm-amenities-tlv.ts's exact operational
 * shape instead: per-city, dry-run default, chokepoint-validated, --apply
 * required to write.
 *
 * SOURCING (David-approved 01.09.2026): amenities with status 'pending' OR
 * 'published' are included; 'rejected' is excluded. Recorded transparently
 * on every written summary via `sourceStatuses` — see route-amenity-
 * tagging.service.ts's header for why 'published'-only would leave this
 * feature empty today.
 *
 * WRITE SEMANTICS: `nearbyAmenities` is wholesale-replaced every run (never
 * arrayUnion — see Route.nearbyAmenities' doc comment, route.types.ts).
 * `qualitySignals.amenities` requires the route's FULL existing
 * qualitySignals object to be merged in memory before writing — verified
 * empirically (not assumed) that zod's `.partial()` is SHALLOW: a route
 * update payload containing a `qualitySignals` key still validates the
 * inner object's required `composition`/`computedAt`/`source` fields, so a
 * bare `{qualitySignals: {amenities: {...}}}` payload fails validation. A
 * route with no existing `qualitySignals` at all is therefore skipped for
 * the summary field (still gets `nearbyAmenities`, which has no such
 * dependency) — flagged in the report, never silently dropped.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints per-route match report + summary):
 *     npx tsx scripts/tag-route-amenities.ts --city="חיפה"
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/tag-route-amenities.ts --city="חיפה" --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so dotenv/.env.local + relative imports resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { buildValidatedDoc } from '../src/lib/route-collections';
import { findAuthorityByCityName } from '../src/lib/route-collections/authority-resolution';
import {
  findAmenityMatchesForRoute,
  buildAmenitiesSignal,
  ROUTE_AMENITY_THRESHOLDS_METERS,
  type AmenityJoinInput,
} from '../src/features/parks/core/services/route-amenity-tagging.service';
import { computeQualityBadges, CARD_BADGE_CAP } from '../src/features/parks/core/services/route-quality-badges.service';
import type { AmenityCategory, CourtSport } from '../src/features/parks/core/types/osm-amenity.types';
import type { RouteAmenityRef } from '../src/features/parks/core/types/route.types';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.slice(flag.length + 3) : undefined;
}

const CITY = argValue('city');
if (!CITY) {
  console.error('❌  --city="<name>" is required (e.g. --city="חיפה"). This script is per-city by design, no default.');
  process.exit(1);
}

const SOURCE_STATUSES: Array<'pending' | 'published'> = ['pending', 'published'];

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
}
const db = admin.firestore();

interface RouteJoinResult {
  id: string;
  name: string;
  matches: RouteAmenityRef[];
  simulatedCardBadges: { key: string; label: string }[];
  fullCandidateBadgeCount: number; // uncapped count, to show what the cap actually dropped
  hadExistingQualitySignals: boolean;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Route↔Amenity Tagging — ${CITY!.padEnd(14)} [${mode.padEnd(8)}]      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Sourcing: osm_amenities status IN ${JSON.stringify(SOURCE_STATUSES)} (rejected excluded)`);
  console.log(`  Thresholds (m): ${JSON.stringify(ROUTE_AMENITY_THRESHOLDS_METERS)}\n`);
  if (!isApply) {
    console.log('⚠️  DRY-RUN mode — official_routes will NOT be written.');
    console.log('   Run with --apply to write.\n');
  }

  // ── Resolve the city's authorityId (never hardcoded) ──
  const authoritySnap = await db.collection('authorities').get();
  const authorities = authoritySnap.docs.map((d) => ({ id: d.id, name: (d.data().label as string) ?? (d.data().name as string) ?? '' }));
  const knownAuthorityIds = new Set(authorities.map((a) => a.id));
  const cityAuthorityId = findAuthorityByCityName(CITY!, authorities);
  if (!cityAuthorityId) {
    console.error(`❌  Could not resolve an authority for "${CITY}" — aborting (never guessing an authorityId).`);
    process.exit(1);
  }
  console.log(`📍 Resolved ${CITY} authorityId: ${cityAuthorityId}`);

  // ── Fetch ALL osm_amenities for the city (any status) — brute-force fetch-
  // all, same precedent as garden-dedup's ~1,165 parks / this same phase's
  // reproduction check. hasCityCoverage = the honesty gate: ANY doc at all,
  // regardless of status, means the ingester ran here. ──
  const amenitiesSnap = await db.collection('osm_amenities').where('city', '==', CITY).get();
  const hasCityCoverage = amenitiesSnap.size > 0;
  const candidates: AmenityJoinInput[] = [];
  let rejectedSkipped = 0;
  for (const d of amenitiesSnap.docs) {
    const data = d.data();
    if (data.status === 'rejected') { rejectedSkipped++; continue; }
    const lat = Number(data.location?.lat);
    const lng = Number(data.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    candidates.push({
      id: d.id,
      category: data.category as AmenityCategory,
      sport: data.sport as CourtSport | undefined,
      location: { lat, lng },
    });
  }
  console.log(`🏷️  ${amenitiesSnap.size} osm_amenities doc(s) for ${CITY} (${hasCityCoverage ? 'coverage exists' : 'NO COVERAGE'}); ${candidates.length} usable as join candidates (${rejectedSkipped} rejected excluded).`);

  // ── Fetch official_routes for the city ──
  const routesSnap = await db.collection('official_routes').where('city', '==', CITY).get();
  console.log(`🗺️  ${routesSnap.size} official_routes for ${CITY}.\n`);

  const results: RouteJoinResult[] = [];
  const writes: Array<{ id: string; payload: Record<string, unknown> }> = [];
  let skippedNoQualitySignals = 0;

  for (const routeDoc of routesSnap.docs) {
    const data = routeDoc.data();
    const rawPath = Array.isArray(data.path) ? data.path : [];
    const routePath: [number, number][] = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0]);
    if (routePath.length < 2) continue;

    const matches = hasCityCoverage ? findAmenityMatchesForRoute(routePath, candidates) : [];
    const amenitiesSignalNoTimestamp = buildAmenitiesSignal(hasCityCoverage, matches, SOURCE_STATUSES);

    // Simulate the CARD's post-cap badges, reusing the REAL production
    // function — not a reimplementation — against this route's existing
    // composition/lighting plus the newly-computed amenities signal.
    const existingQS = data.qualitySignals as Record<string, unknown> | undefined;
    const hadExistingQualitySignals = !!existingQS?.composition;
    const simulatedQualitySignals = { ...(existingQS ?? {}), amenities: amenitiesSignalNoTimestamp } as any;
    const cappedBadges = computeQualityBadges(simulatedQualitySignals);

    // Uncapped candidate count, purely for the report (how many WOULD have
    // fired before the cap trims them) — re-derive by temporarily lifting
    // the cap is not exposed by the function on purpose (CARD_BADGE_CAP is
    // a hard rule, not a caller-configurable knob), so count independently
    // from the same `has`/composition/lighting inputs computeQualityBadges
    // itself reads, for report purposes only.
    let uncappedCount = 0;
    if (simulatedQualitySignals.lighting?.status === 'computed' && simulatedQualitySignals.lighting.isLit === true) uncappedCount++;
    if (amenitiesSignalNoTimestamp.status === 'computed') {
      if (amenitiesSignalNoTimestamp.has.drinking_water) uncappedCount++;
      if (amenitiesSignalNoTimestamp.has.fitness_station) uncappedCount++;
      if (amenitiesSignalNoTimestamp.has.bench) uncappedCount++;
      if (amenitiesSignalNoTimestamp.has.court) uncappedCount++;
      if (amenitiesSignalNoTimestamp.has.dog_park) uncappedCount++;
    }
    const genuinePct = simulatedQualitySignals.composition?.genuinePct;
    if (genuinePct !== undefined && genuinePct >= 60) uncappedCount++;

    results.push({
      id: routeDoc.id,
      name: data.name ?? '(unnamed)',
      matches,
      simulatedCardBadges: cappedBadges,
      fullCandidateBadgeCount: uncappedCount,
      hadExistingQualitySignals,
    });

    if (isApply) {
      const payload: Record<string, unknown> = {};
      if (hasCityCoverage) payload.nearbyAmenities = matches;
      if (hadExistingQualitySignals) {
        payload.qualitySignals = {
          ...existingQS,
          amenities: { ...amenitiesSignalNoTimestamp, computedAt: admin.firestore.FieldValue.serverTimestamp() },
        };
      } else {
        skippedNoQualitySignals++;
      }
      if (Object.keys(payload).length > 0) {
        const validated = buildValidatedDoc('official_routes', payload, {
          mode: 'update',
          knownAuthorityIds,
          existing: { authorityId: data.authorityId, city: data.city },
        });
        writes.push({ id: routeDoc.id, payload: validated as Record<string, unknown> });
      }
    } else if (!hadExistingQualitySignals && hasCityCoverage) {
      skippedNoQualitySignals++;
    }
  }

  // ── Per-route report ──
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  PER-ROUTE MATCH REPORT                                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const sorted = [...results].sort((a, b) => b.matches.length - a.matches.length);
  for (const r of sorted) {
    const byCat: Partial<Record<AmenityCategory, number>> = {};
    for (const m of r.matches) byCat[m.category] = (byCat[m.category] ?? 0) + 1;
    const catStr = Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ') || '(none)';
    const badgeStr = r.simulatedCardBadges.map((b) => b.label).join(' · ') || '(none)';
    const qsFlag = r.hadExistingQualitySignals ? '' : '  [NO EXISTING qualitySignals — summary write skipped]';
    console.log(`  ${r.name.padEnd(30)} matches=${String(r.matches.length).padEnd(4)} [${catStr}]  → card: ${badgeStr}${qsFlag}`);
  }

  // ── Distribution summary ──
  const buckets = { '0': 0, '1-2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
  const categoryTotals: Record<AmenityCategory, number> = { court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 0, dog_park: 0 };
  for (const r of results) {
    const n = r.matches.length;
    if (n === 0) buckets['0']++;
    else if (n <= 2) buckets['1-2']++;
    else if (n <= 5) buckets['3-5']++;
    else if (n <= 10) buckets['6-10']++;
    else buckets['11+']++;
    for (const m of r.matches) categoryTotals[m.category]++;
  }
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  DISTRIBUTION — matches per route                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const [bucket, count] of Object.entries(buckets)) console.log(`  ${bucket.padEnd(8)} routes: ${count}`);
  console.log(`\n  Category totals across all ${results.length} routes:`);
  for (const [cat, total] of Object.entries(categoryTotals)) console.log(`    ${cat.padEnd(16)} ${total}`);
  if (skippedNoQualitySignals > 0) {
    console.log(`\n  ⚠️  ${skippedNoQualitySignals} route(s) have no existing qualitySignals — qualitySignals.amenities summary would be SKIPPED for them (nearbyAmenities still written). See route-amenity-tagging.service.ts's header for why a bare partial qualitySignals object can't validate.`);
  }

  // ── Badge-cap example: the route with the most uncapped candidate badges ──
  const capExample = [...results].sort((a, b) => b.fullCandidateBadgeCount - a.fullCandidateBadgeCount)[0];
  if (capExample && capExample.fullCandidateBadgeCount > 0) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  BADGE-CAP EXAMPLE (route with the most candidate badges)   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Route: ${capExample.name}`);
    console.log(`  Uncapped candidates that fired: ${capExample.fullCandidateBadgeCount}`);
    console.log(`  CARD_BADGE_CAP: ${CARD_BADGE_CAP}`);
    console.log(`  Card actually shows (priority order, capped): ${capExample.simulatedCardBadges.map((b) => b.label).join(' · ')}`);
    console.log(`  Dropped from the card (would have fired, lower priority): ${Math.max(0, capExample.fullCandidateBadgeCount - capExample.simulatedCardBadges.length)} badge(s)`);
    console.log('  (The full, uncapped breakdown remains visible on the admin panel — see "מתקנים בסביבת המסלול".)');
  } else {
    console.log('\n  No route matched enough categories to demonstrate the badge cap in this run (cap only matters above 3 candidates).');
  }

  if (isApply) {
    console.log(`\n✍️  Writing ${writes.length} official_routes update(s)...`);
    for (const w of writes) {
      await db.collection('official_routes').doc(w.id).set(w.payload, { merge: true });
    }
    console.log(`  ✔ committed ${writes.length}`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Routes processed:        ${String(results.length).padEnd(31)}║`);
  console.log(`║  Routes with 0 matches:   ${String(buckets['0']).padEnd(31)}║`);
  console.log(`║  Total amenity matches:   ${String(results.reduce((s, r) => s + r.matches.length, 0)).padEnd(31)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
