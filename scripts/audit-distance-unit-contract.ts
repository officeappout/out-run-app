/**
 * scripts/audit-distance-unit-contract.ts — Stage 1 (READ-ONLY) of the
 * distance-unit-normalization fix. For every official_routes/curated_routes
 * doc, recomputes ground-truth distance from the route's own path geometry
 * (meters, Haversine — identical formula to InventoryService's private
 * computePathDistanceMeters, inventory.service.ts:113-128, so the "truth"
 * this script measures against is the SAME truth the app itself already
 * uses elsewhere, not a new formula) and classifies the STORED `distance`
 * value's unit by comparing it against both candidate interpretations
 * (already-km vs stored-in-meters). PER-DOCUMENT, not per-city — a city is
 * never assumed internally consistent (confirmed necessary: Zichron-Yaakov
 * looked "fine" under a cruder per-city heuristic in an earlier audit pass,
 * but was explicitly listed as needing a fix in an earlier, separate,
 * unexecuted script — see this run's own report for the discrepancy).
 *
 * ZERO Firestore writes — only .get() calls. Stage 2 (the actual write) is
 * a separate, not-yet-built script requiring explicit approval first.
 *
 * Usage: npx tsx scripts/audit-distance-unit-contract.ts
 * Output: human-readable per-city table + sample migration plan to stdout,
 * full structured JSON to scripts/output/distance-unit-audit.json
 * (overwritten each run, not committed).
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

// ── Ground-truth distance — identical to InventoryService's private
// computePathDistanceMeters (inventory.service.ts:113-128), not reinvented. ──
function computePathDistanceMeters(pathPts: Array<[number, number]>): number {
  if (!pathPts || pathPts.length < 2) return 0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < pathPts.length; i++) {
    const [lng1, lat1] = pathPts[i - 1];
    const [lng2, lat2] = pathPts[i];
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total; // NOT rounded here — rounding happens only at display/comparison time
}

// A stored value is considered a match for a candidate interpretation when
// its relative error is within this fraction. 8% — generous enough to
// absorb path-simplification/rounding drift between whatever originally
// computed the stored value and this script's own Haversine, tight enough
// that km vs meters (a 1000x difference) can never accidentally both match.
const TOLERANCE = 0.08;
const EPSILON = 0.001; // avoid divide-by-zero on a literal zero-length path

type Classification = 'canonical-km' | 'needs-conversion-meters-stored' | 'ambiguous-or-corrupt' | 'missing-distance' | 'no-geometry';

interface DocResult {
  id: string;
  collection: 'official_routes' | 'curated_routes';
  name: string;
  cityLabel: string;
  authorityId: string | null;
  storedDistance: number | null;
  groundTruthMeters: number | null;
  groundTruthKm: number | null;
  classification: Classification;
  proposedNewValue: number | null; // only set for needs-conversion-meters-stored
}

function classify(storedDistance: unknown, groundTruthMeters: number): { classification: Classification; proposedNewValue: number | null } {
  if (typeof storedDistance !== 'number' || !isFinite(storedDistance)) {
    return { classification: 'missing-distance', proposedNewValue: null };
  }
  const groundTruthKm = groundTruthMeters / 1000;
  const relErrKm = Math.abs(storedDistance - groundTruthKm) / Math.max(groundTruthKm, EPSILON);
  const relErrM = Math.abs(storedDistance - groundTruthMeters) / Math.max(groundTruthMeters, EPSILON);

  const kmMatches = relErrKm <= TOLERANCE;
  const mMatches = relErrM <= TOLERANCE;

  if (kmMatches && (!mMatches || relErrKm <= relErrM)) {
    return { classification: 'canonical-km', proposedNewValue: null };
  }
  if (mMatches) {
    return { classification: 'needs-conversion-meters-stored', proposedNewValue: Math.round(groundTruthKm * 100) / 100 };
  }
  return { classification: 'ambiguous-or-corrupt', proposedNewValue: null };
}

function cityKey(authorityId: string | undefined, city: string | undefined): string {
  if (authorityId) return `auth:${authorityId}`;
  if (city && city.trim()) return `city:${city.trim()}`;
  return 'unknown';
}

async function main() {
  const db = initFb();

  console.log('Fetching authorities, official_routes, curated_routes (read-only)...');
  const [authoritiesSnap, officialSnap, curatedSnap] = await Promise.all([
    db.collection('authorities').get(),
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
  ]);
  console.log(`Loaded: ${authoritiesSnap.size} authorities, ${officialSnap.size} official_routes, ${curatedSnap.size} curated_routes.\n`);

  const authorityNames = new Map<string, string>();
  authoritiesSnap.docs.forEach((d) => authorityNames.set(d.id, (d.data() as any).name || d.id));

  const allDocs: Array<{ id: string; collection: 'official_routes' | 'curated_routes'; data: any }> = [
    ...officialSnap.docs.map((d) => ({ id: d.id, collection: 'official_routes' as const, data: d.data() })),
    ...curatedSnap.docs.map((d) => ({ id: d.id, collection: 'curated_routes' as const, data: d.data() })),
  ];

  const results: DocResult[] = [];

  for (const { id, collection, data } of allDocs) {
    const authorityId: string | undefined = data.authorityId;
    const city: string | undefined = data.city;
    const cityLabel = authorityId ? authorityNames.get(authorityId) || authorityId : city || 'ללא רשות/עיר';

    const rawPath = data.path;
    if (!Array.isArray(rawPath) || rawPath.length < 2) {
      results.push({
        id, collection: collection as any, name: data.name || id, cityLabel, authorityId: authorityId || null,
        storedDistance: typeof data.distance === 'number' ? data.distance : null,
        groundTruthMeters: null, groundTruthKm: null,
        classification: 'no-geometry', proposedNewValue: null,
      });
      continue;
    }

    // path may be stored as {lat,lng} objects OR [lng,lat] tuples (both
    // forms exist live — route-editor-scoping-spec.md's own PathSchema
    // documents this). Normalize to [lng,lat] tuples for computePathDistanceMeters.
    const pathPts: Array<[number, number]> = rawPath.map((p: any) =>
      Array.isArray(p) ? [Number(p[0]) || 0, Number(p[1]) || 0] : [Number(p.lng) || 0, Number(p.lat) || 0],
    );

    const groundTruthMeters = computePathDistanceMeters(pathPts);
    const { classification, proposedNewValue } = classify(data.distance, groundTruthMeters);

    results.push({
      id, collection: collection as any, name: data.name || id, cityLabel, authorityId: authorityId || null,
      storedDistance: typeof data.distance === 'number' ? data.distance : null,
      groundTruthMeters: Math.round(groundTruthMeters),
      groundTruthKm: Math.round((groundTruthMeters / 1000) * 100) / 100,
      classification, proposedNewValue,
    });
  }

  // ── Per-city table ──────────────────────────────────────────────────
  const byCity = new Map<string, { cityLabel: string; authorityId: string | null; counts: Record<Classification, number>; total: number }>();
  results.forEach((r) => {
    const key = cityKey(r.authorityId || undefined, r.cityLabel);
    if (!byCity.has(key)) {
      byCity.set(key, {
        cityLabel: r.cityLabel, authorityId: r.authorityId,
        counts: { 'canonical-km': 0, 'needs-conversion-meters-stored': 0, 'ambiguous-or-corrupt': 0, 'missing-distance': 0, 'no-geometry': 0 },
        total: 0,
      });
    }
    const entry = byCity.get(key)!;
    entry.counts[r.classification]++;
    entry.total++;
  });

  console.log('=== Per-city distance-unit classification ===\n');
  const sorted = Array.from(byCity.values()).sort((a, b) => b.total - a.total);
  for (const c of sorted) {
    console.log(`── ${c.cityLabel} ${c.authorityId ? `(${c.authorityId})` : '(no authorityId)'} — ${c.total} docs ──`);
    console.log(`   canonical-km: ${c.counts['canonical-km']}`);
    console.log(`   needs-conversion (stored in meters): ${c.counts['needs-conversion-meters-stored']}`);
    console.log(`   ambiguous/corrupt: ${c.counts['ambiguous-or-corrupt']}`);
    console.log(`   missing distance: ${c.counts['missing-distance']}`);
    console.log(`   no geometry to verify against: ${c.counts['no-geometry']}`);
    console.log('');
  }

  // ── Sample migration plan ──────────────────────────────────────────
  console.log('=== Sample migration plan (needs-conversion, up to 5 per city) ===\n');
  const needsConversion = results.filter((r) => r.classification === 'needs-conversion-meters-stored');
  const byCitySample = new Map<string, DocResult[]>();
  needsConversion.forEach((r) => {
    const key = cityKey(r.authorityId || undefined, r.cityLabel);
    if (!byCitySample.has(key)) byCitySample.set(key, []);
    const arr = byCitySample.get(key)!;
    if (arr.length < 5) arr.push(r);
  });
  byCitySample.forEach((docs, key) => {
    console.log(`${docs[0].cityLabel}:`);
    docs.forEach((d) => console.log(`  ${d.id}  "${d.name}"  ${d.storedDistance} -> ${d.proposedNewValue} km`));
  });

  console.log('\n=== Ambiguous/corrupt docs (up to 10 total, need manual look before Stage 2) ===\n');
  results.filter((r) => r.classification === 'ambiguous-or-corrupt').slice(0, 10).forEach((r) => {
    console.log(`  ${r.id}  "${r.name}"  city=${r.cityLabel}  stored=${r.storedDistance}  groundTruthKm=${r.groundTruthKm}  groundTruthMeters=${r.groundTruthMeters}`);
  });

  const totalCanonical = results.filter((r) => r.classification === 'canonical-km').length;
  const totalNeedsConversion = needsConversion.length;
  const totalAmbiguous = results.filter((r) => r.classification === 'ambiguous-or-corrupt').length;
  const totalMissing = results.filter((r) => r.classification === 'missing-distance').length;
  const totalNoGeometry = results.filter((r) => r.classification === 'no-geometry').length;

  console.log('\n=== TOTALS ===');
  console.log(`  canonical-km: ${totalCanonical}`);
  console.log(`  needs-conversion: ${totalNeedsConversion}`);
  console.log(`  ambiguous/corrupt: ${totalAmbiguous}`);
  console.log(`  missing-distance: ${totalMissing}`);
  console.log(`  no-geometry: ${totalNoGeometry}`);
  console.log(`  TOTAL DOCS: ${results.length}`);

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'distance-unit-audit.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), tolerance: TOLERANCE, results }, null, 2));
  console.log(`\nFull structured JSON written to: ${outPath}`);
  console.log('=== COMPLETE — read-only, no writes ===');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
