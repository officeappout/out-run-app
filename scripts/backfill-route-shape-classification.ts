/**
 * scripts/backfill-route-shape-classification.ts — 05.10.2026.
 *
 * Writes `shapeType` + `geometryMetrics` onto the 97 pending routes
 * (official_routes, published:false, status!='archived') — the first-class
 * shape field the new approval screen reads. Reuses the exact, already-
 * validated geometry functions from measure-route-geometry.ts (profileRoute/
 * toRouteDoc, including the smallest-enclosing-circle dedup fix) — does not
 * re-derive them.
 *
 * Does NOT touch route-generator, route-stitching, or decide-accuracy.ts.
 * Does NOT write any decision/approval field — shapeTrainingReview (the
 * ✅/❓/❌ + chips) is written only by the live screen when a human clicks,
 * never by this script. This script computes and persists FACTS (shape,
 * closure gap, overlap %, compactness numbers) — zero judgment calls.
 *
 * Classification (per the spec):
 *   loop             — closed (closureGapM <= CLOSURE_STRUCTURAL_GAP_M).
 *                       All 3 compactness measures computed.
 *   linear_corridor  — not closed, AND name matches a known promenade/
 *                       corridor pattern (same regex profileRoute already
 *                       uses — טיילת/רצועה ירוקה/רצועת חוף/שביל טבע/ואדי).
 *                       Compactness does not apply — not computed, not
 *                       penalized.
 *   unclassified     — not closed, name doesn't match. Neither approved
 *                       nor rejected by this script — a human decides on
 *                       the new screen, informed by the closure-gap number
 *                       this script DOES persist.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { profileRoute, toRouteDoc, CLOSURE_STRUCTURAL_GAP_M, type RouteProfile } from './measure-route-geometry';
import { computeAccuracyQueue } from '../src/lib/route-decisions/compute-queue';

type ShapeType = 'loop' | 'linear_corridor' | 'unclassified';

function classifyShape(profile: RouteProfile): ShapeType {
  if (profile.isClosedEnoughForCompactness && profile.compactness) return 'loop';
  if (profile.looksLikePromenade) return 'linear_corridor';
  return 'unclassified';
}

function percentileRank(values: number[], v: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted.filter((x) => x < v).length / sorted.length) * 100;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  const snap = await db.collection('official_routes').where('published', '==', false).get();
  const targets: { id: string; profile: RouteProfile; shapeType: ShapeType }[] = [];
  let skippedArchived = 0, skippedBadGeometry = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status === 'archived') { skippedArchived++; continue; }
    const routeDoc = toRouteDoc(doc.id, data);
    if (!routeDoc) { skippedBadGeometry++; continue; }
    const profile = profileRoute(routeDoc);
    targets.push({ id: doc.id, profile, shapeType: classifyShape(profile) });
  }

  const byType: Record<ShapeType, number> = { loop: 0, linear_corridor: 0, unclassified: 0 };
  for (const t of targets) byType[t.shapeType]++;
  console.log(`Loaded ${targets.length} pending routes (skipped ${skippedArchived} archived, ${skippedBadGeometry} bad geometry).`);
  console.log(`Shape breakdown: loop=${byType.loop}  linear_corridor=${byType.linear_corridor}  unclassified=${byType.unclassified}`);

  // ── Review priority — the EXACT cut (b) logic from the measurement
  // report (docs/audit-2026-10/route-geometry-measurement-report.md),
  // computed once here so the live screen can just sort on a field rather
  // than hardcoding 7 route IDs in UI code. Not a new judgment — a literal
  // transcription of the already-validated, already-reported criterion:
  // certificate verdict=approve AND bottom-quartile (<=25th percentile) on
  // all 3 compactness measures at once.
  const loopTargets = targets.filter((t) => t.shapeType === 'loop' && t.profile.compactness);
  const measureKeys = ['polsbyPopper', 'reock', 'convexHullRatio'] as const;
  const measureValues: Record<string, number[]> = {};
  for (const m of measureKeys) measureValues[m] = loopTargets.map((t) => t.profile.compactness![m]);
  const accuracyQueue = await computeAccuracyQueue(db); // unmodified, read-only reuse
  const accuracyById = new Map(accuracyQueue.rows.map((r) => [r.id, r]));

  const reviewPriorityIds = new Set<string>();
  for (const t of loopTargets) {
    const ranks = measureKeys.map((m) => percentileRank(measureValues[m], t.profile.compactness![m]));
    const certApprove = accuracyById.get(t.id)?.decision.verdict === 'approve';
    if (certApprove && ranks.every((r) => r <= 25)) reviewPriorityIds.add(t.id);
  }
  console.log(`Review-priority (cert=approve + bottom-quartile on all 3): ${reviewPriorityIds.size} routes.`);

  if (!isApply) {
    console.log('\nDry run only (pass --apply to write). No Firestore writes made.');
    console.log('\nSample (first 10):');
    for (const t of targets.slice(0, 10)) {
      console.log(`  ${t.profile.name} (${t.profile.city}) → ${t.shapeType}${reviewPriorityIds.has(t.id) ? ' ⚠️PRIORITY' : ''} | closureGap=${t.profile.closureGapM.toFixed(0)}m | selfOverlap=${(t.profile.selfOverlapRatio * 100).toFixed(0)}%${t.profile.compactness ? ` | PP=${t.profile.compactness.polsbyPopper.toFixed(3)} Reock=${t.profile.compactness.reock.toFixed(3)} ConvexHull=${t.profile.compactness.convexHullRatio.toFixed(3)}` : ''}`);
    }
    process.exit(0);
  }

  console.log('\n=== Writing ===');
  let written = 0;
  for (const t of targets) {
    const isPriority = reviewPriorityIds.has(t.id);
    const geometryMetrics: Record<string, unknown> = {
      closureGapM: Math.round(t.profile.closureGapM * 10) / 10,
      selfOverlapPct: Math.round(t.profile.selfOverlapRatio * 1000) / 10,
      compactness: t.profile.compactness
        ? {
            polsbyPopper: Math.round(t.profile.compactness.polsbyPopper * 1000) / 1000,
            reock: Math.round(t.profile.compactness.reock * 1000) / 1000,
            convexHullRatio: Math.round(t.profile.compactness.convexHullRatio * 1000) / 1000,
          }
        : null,
      computedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('official_routes').doc(t.id).update({
      shapeType: t.shapeType,
      geometryMetrics,
      isReviewPriority: isPriority,
      // Suggested only — pre-fills the UI's chip selection, never
      // auto-submitted. A human still has to click ❌ themselves.
      suggestedReasonChips: isPriority ? ['לא באמת מסלול'] : [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
  }
  console.log(`💾 Written: ${written}/${targets.length}.`);

  // Live re-read verification — value from the DB, not the value sent.
  console.log('\n=== Live re-read verification (3 samples) ===');
  for (const name of ['הקפת Bar Yehuda', 'הטיילת', 'הקפת גן אופירה']) {
    const t = targets.find((x) => x.profile.name === name);
    if (!t) continue;
    const after = await db.collection('official_routes').doc(t.id).get();
    const d = after.data()!;
    console.log(`${name}: shapeType=${d.shapeType}, closureGapM=${d.geometryMetrics?.closureGapM}, compactness=${JSON.stringify(d.geometryMetrics?.compactness)}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
