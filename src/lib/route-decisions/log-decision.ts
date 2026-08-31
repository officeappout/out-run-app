/**
 * src/lib/route-decisions/log-decision.ts — the single write path all 3
 * hook points (moderation.service.ts's approveEntity/rejectEntity,
 * route-geometry-edit.service.ts's applySafeGeometryEdit) call, so the
 * payload shape and the agentSuggestion computation live in exactly one
 * place. Client-SDK (browser) — every hook this calls from runs in the
 * admin panel, authenticated as the acting admin.
 *
 * Non-fatal by design: every internal failure is caught and logged to
 * console, never thrown — a decision-log write must never block or fail
 * the real approve/edit/drop action it's attached to (same "log-and-
 * continue" convention as inventory.service.ts's fire-and-forget
 * broadcastRouteToStreetSegments call). Callers should invoke this WITHOUT
 * awaiting it for the same reason (fire-and-forget), though awaiting is
 * also safe since it never rejects.
 */
import { addDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { pathLengthMeters } from '@/features/parks/core/services/geoUtils';
import { buildValidatedDecisionDoc } from './validate';
import { decideRouteAccuracy, type AccuracyVerdict } from './decide-accuracy';
// Pure, framework-free (see that file's own header: "No Firebase imports,
// no initialization, no top-level execution — safe to import from
// anywhere") — reused here rather than re-implemented, even though it
// lives under scripts/lib/ (Node-script land) rather than src/lib/. tsc
// and Next.js both compile it fine (tsconfig has no exclusion for
// scripts/), and duplicating a tolerance-based unit-classification
// algorithm into a second copy is exactly the kind of drift risk this
// codebase's "reuse, don't duplicate" convention exists to prevent.
import { classify as classifyDistanceUnit } from '../../../scripts/lib/distance-unit-classify';

export type RouteDecisionType = 'approve' | 'edit' | 'drop';

export interface EditDetailInput {
  removedRanges: Array<{ startIdx: number; endIdx: number; lengthM: number }>;
  editKind: 'trim-start' | 'trim-end' | 'delete-inset' | 'delete-point';
  reasonCategory?: string;
  reasonNote?: string;
}
export interface DropDetailInput {
  reasonCategory?: string;
  reasonNote?: string;
}

/** Minimal shape this module needs from a Route — avoids importing the full Route type just for a handful of fields. */
export interface RouteForDecisionLog {
  id: string;
  name: string;
  city?: string;
  authorityId?: string;
  path: Array<[number, number]>; // [lng, lat] tuples — Route.path's in-memory form
  distance: number; // km
  qualitySignals?: {
    composition?: { genuinePct: number; sidewalkPct: number; ordinaryPct: number; otherPct: number };
    lighting?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null };
  };
}

/** Counts OTHER official_routes in the same city sharing this exact name — same exact-string-match heuristic decide-accuracy's duplicate-name flag expects. Can't meaningfully check "duplicate in this city" without a city, so a city-less route (real, legacy) always reports 0 — not a fabricated guess. */
async function countDuplicateNames(city: string | undefined, name: string, excludeId: string): Promise<number> {
  if (!name || !city) return 0;
  try {
    const snap = await getDocs(query(collection(db, 'official_routes'), where('city', '==', city), where('name', '==', name)));
    return snap.docs.filter((d) => d.id !== excludeId).length;
  } catch {
    return 0; // never let a duplicate-name lookup failure block the real log write
  }
}

export async function logRouteDecision(
  route: RouteForDecisionLog,
  decisionType: RouteDecisionType,
  decidedBy: string,
  detail?: { editDetail?: EditDetailInput; dropDetail?: DropDetailInput },
): Promise<void> {
  try {
    const composition = route.qualitySignals?.composition;
    if (!composition) {
      // No composition signal yet for this route (e.g. a city never run
      // through the quality-certificate backfill) — nothing honest to log
      // as a snapshot, and decideRouteAccuracy requires it. Skip silently;
      // this is a real, expected gap for some routes, not an error.
      return;
    }
    const lighting = route.qualitySignals?.lighting;

    const groundTruthMeters = pathLengthMeters(route.path);
    const { classification } = classifyDistanceUnit(route.distance, groundTruthMeters);
    const normalizedKm = Math.round((groundTruthMeters / 1000) * 100) / 100;
    const duplicateNameCount = await countDuplicateNames(route.city, route.name, route.id);

    const suggestion = decideRouteAccuracy({
      composition,
      lighting,
      pathPointCount: route.path.length,
      distance: { classification, normalizedKm },
      duplicateNameCount,
    });

    const payload = buildValidatedDecisionDoc({
      routeId: route.id,
      routeName: route.name,
      city: route.city,
      authorityId: route.authorityId,
      decisionType,
      decidedBy,
      decidedAt: serverTimestamp(),
      compositionSnapshot: { ...composition, lengthM: Math.round(route.distance * 1000) },
      ...(lighting ? { lightingSnapshot: lighting } : {}),
      agentSuggestion: {
        verdict: suggestion.verdict as AccuracyVerdict,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        proposedAt: serverTimestamp(),
      },
      ...(detail?.editDetail ? { editDetail: detail.editDetail } : {}),
      ...(detail?.dropDetail ? { dropDetail: detail.dropDetail } : {}),
    });

    await addDoc(collection(db, 'route_decisions'), payload);
  } catch (e) {
    console.warn('[route-decisions] Failed to log decision (non-fatal):', e);
  }
}
