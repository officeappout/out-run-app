/**
 * scripts/review-route-accuracy.ts — accuracy agent Stage 1, READ-ONLY.
 * Runs decideRouteAccuracy (src/lib/route-decisions/decide-accuracy.ts) over
 * every official_routes/curated_routes doc, all 5 cities, using ONLY
 * already-persisted qualitySignals + a ground-truth distance recompute +
 * per-city duplicate-name counts. No Overpass, no live OSM fetch, no
 * Firestore writes.
 *
 * The actual batch compute (fetch + duplicate-name grouping + per-route
 * decideRouteAccuracy) lives in src/lib/route-decisions/compute-queue.ts
 * (extracted 31.08.2026, Stage 3) — shared with the accuracy-queue API
 * route so both have exactly one implementation. This script is now just
 * that module's caller, plus the printing/cross-reference logic below.
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
import { computeAccuracyQueue, sortAccuracyQueueWorstFirst, type QueuedRouteAccuracy } from '../src/lib/route-decisions/compute-queue';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

type RouteRow = QueuedRouteAccuracy;

async function main() {
  const db = initFb();
  console.log('=== Accuracy agent — Stage 1 review (read-only, no writes) ===\n');

  const { rows, totalRoutes, skippedNoComposition } = await computeAccuracyQueue(db);
  console.log(`Loaded ${totalRoutes} routes.\n`);
  console.log(`Computed decisions for ${rows.length} routes. (${skippedNoComposition} skipped — no qualitySignals.composition yet.)\n`);

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
  const sorted = sortAccuracyQueueWorstFirst(rows);
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
