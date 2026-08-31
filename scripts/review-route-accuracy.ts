/**
 * scripts/review-route-accuracy.ts — accuracy agent Stage 1, READ-ONLY.
 * Runs decideRouteAccuracy (src/lib/route-decisions/decide-accuracy.ts) over
 * every official_routes/curated_routes doc, all 5 cities, using ONLY
 * already-persisted qualitySignals + a ground-truth distance recompute +
 * per-city duplicate-name counts. No Overpass, no live OSM fetch, no
 * Firestore writes.
 *
 * Cross-references Haifa's verdicts against the hand-validated triage
 * baseline (scripts/_haifa-full-triage.ts's fresh output,
 * /tmp/haifa-full-triage-results.json) for threshold calibration — see
 * .claude/plans/vectorized-twirling-tiger.md.
 *
 * Usage: npx tsx scripts/review-route-accuracy.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import {
  decideRouteAccuracy, type AccuracyDecision, type DistanceClassification,
} from '../src/lib/route-decisions/decide-accuracy';
import { classify, computePathDistanceMeters, normalizePathToLngLatTuples } from './lib/distance-unit-classify';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface RouteRow {
  id: string; collection: 'official_routes' | 'curated_routes'; name: string; city: string;
  decision: AccuracyDecision;
}

async function main() {
  const db = initFb();
  console.log('=== Accuracy agent — Stage 1 review (read-only, no writes) ===\n');

  const [officialSnap, curatedSnap] = await Promise.all([
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
  ]);
  console.log(`Loaded ${officialSnap.size + curatedSnap.size} routes (${officialSnap.size} official + ${curatedSnap.size} curated).\n`);

  type RawRoute = { id: string; collection: 'official_routes' | 'curated_routes'; data: FirebaseFirestore.DocumentData };
  const allDocs: RawRoute[] = [
    ...officialSnap.docs.map((d) => ({ id: d.id, collection: 'official_routes' as const, data: d.data() })),
    ...curatedSnap.docs.map((d) => ({ id: d.id, collection: 'curated_routes' as const, data: d.data() })),
  ];

  // Duplicate-name clusters, per city, exact-string-match (ported from
  // scripts/audit-city-coverage.ts, unmerged branch audit/city-coverage).
  const namesByCity = new Map<string, Map<string, number>>();
  for (const { data } of allDocs) {
    const city = data.city || '(none)';
    const name = (data.name || '').trim();
    if (!name) continue;
    if (!namesByCity.has(city)) namesByCity.set(city, new Map());
    const nm = namesByCity.get(city)!;
    nm.set(name, (nm.get(name) || 0) + 1);
  }

  const rows: RouteRow[] = [];
  let noComposition = 0;

  for (const { id, collection, data } of allDocs) {
    const composition = data.qualitySignals?.composition;
    if (!composition) { noComposition++; continue; }
    const lighting = data.qualitySignals?.lighting;

    const rawPath = Array.isArray(data.path) ? data.path : [];
    const pathPointCount = rawPath.length;
    const pathPts = normalizePathToLngLatTuples(rawPath);
    const groundTruthMeters = computePathDistanceMeters(pathPts);
    const { classification } = pathPointCount < 2
      ? { classification: 'no-geometry' as DistanceClassification }
      : classify(data.distance, groundTruthMeters);
    const normalizedKm = pathPointCount >= 2 ? Math.round((groundTruthMeters / 1000) * 100) / 100 : null;

    const city = data.city || '(none)';
    const nameCount = (namesByCity.get(city)?.get((data.name || '').trim()) || 1) - 1; // "other" routes sharing this name

    const decision = decideRouteAccuracy({
      composition: { sidewalkPct: composition.sidewalkPct, genuinePct: composition.genuinePct, ordinaryPct: composition.ordinaryPct, otherPct: composition.otherPct },
      lighting: lighting ? { status: lighting.status, litCoveragePct: lighting.litCoveragePct, isLit: lighting.isLit } : undefined,
      pathPointCount,
      distance: { classification, normalizedKm },
      duplicateNameCount: nameCount,
    });

    rows.push({ id, collection, name: data.name || '(unnamed)', city, decision });
  }

  console.log(`Computed decisions for ${rows.length} routes. (${noComposition} skipped — no qualitySignals.composition yet.)\n`);

  // ── Per-city distribution ──
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  PER-CITY DISTRIBUTION                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const byCity = new Map<string, RouteRow[]>();
  for (const r of rows) { if (!byCity.has(r.city)) byCity.set(r.city, []); byCity.get(r.city)!.push(r); }
  for (const [city, cityRows] of Array.from(byCity.entries())) {
    const approve = cityRows.filter((r) => r.decision.verdict === 'approve').length;
    const edit = cityRows.filter((r) => r.decision.verdict === 'edit').length;
    const drop = cityRows.filter((r) => r.decision.verdict === 'drop').length;
    console.log(`\n${city} — ${cityRows.length} routes: approve=${approve}  edit=${edit}  drop=${drop}`);
  }

  // ── Full ranked queue (worst-first: drop, then edit by descending confidence, then approve) ──
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RANKED QUEUE (worst-first)                                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const order: Record<string, number> = { drop: 0, edit: 1, approve: 2 };
  const sorted = [...rows].sort((a, b) => {
    if (order[a.decision.verdict] !== order[b.decision.verdict]) return order[a.decision.verdict] - order[b.decision.verdict];
    return b.decision.confidence - a.decision.confidence;
  });
  for (const r of sorted) {
    console.log(`\n[${r.collection}/${r.id}] "${r.name}" (${r.city}) — ${r.decision.verdict.toUpperCase()} (confidence ${r.decision.confidence})`);
    console.log(`  ${r.decision.reason}`);
  }

  // ── Haifa cross-reference against the hand-validated triage baseline ──
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  HAIFA CROSS-REFERENCE vs. hand-validated triage baseline    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const triagePath = '/tmp/haifa-full-triage-results.json';
  if (!fs.existsSync(triagePath)) {
    console.log(`  (${triagePath} not found — run scripts/_haifa-full-triage.ts first for the cross-reference.)`);
  } else {
    const triageRows: Array<{ id: string; name: string; bucket: 'APPROVE' | 'EDIT' | 'DROP'; genuinePct: number; reason: string }> = JSON.parse(fs.readFileSync(triagePath, 'utf8'));
    const triageById = new Map(triageRows.map((t) => [t.id, t]));
    const haifaRows = rows.filter((r) => r.city === 'חיפה');
    let agree = 0, disagree = 0;
    const mismatches: string[] = [];
    for (const r of haifaRows) {
      const t = triageById.get(r.id);
      if (!t) continue;
      const triageVerdict = t.bucket.toLowerCase();
      const same = triageVerdict === r.decision.verdict;
      if (same) agree++; else {
        disagree++;
        mismatches.push(`  [${r.id}] "${r.name}" — agent=${r.decision.verdict.toUpperCase()}(${r.decision.confidence}) vs triage=${t.bucket} (triage genuinePct=${t.genuinePct}%, triage reason: ${t.reason})`);
      }
    }
    console.log(`\nMatched ${agree + disagree}/${haifaRows.length} Haifa routes against the triage baseline.`);
    console.log(`Agree: ${agree}  Disagree: ${disagree}\n`);
    if (mismatches.length) { console.log('Mismatches:'); mismatches.forEach((m) => console.log(m)); }
  }

  console.log('\n=== COMPLETE — read-only, no Firestore writes ===');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
