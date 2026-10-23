/**
 * Reader + only writer for backfill-route-surface-class.ts: a FIELD-LEVEL update that copies
 * `surfaceClass` from `route_scores/{routeId}` onto the matching official_routes doc
 * (plan: src/lib/routes-nationwide/surface-class-backfill.ts).
 *
 * - planSurfaceClassBackfill: reads official_routes + route_scores (read-only), decides
 *   absence IN MEMORY (axiom §33), keeps each doc's read-time updateTime.
 * - Every payload goes through buildValidatedDoc (update mode) with the doc's existing
 *   authorityId/city, so §23 is enforced at the write site; asserted to be exactly
 *   {surfaceClass} — nothing else on the doc (no updatedAt, published, status…).
 * - Guarded by the doc's read-time updateTime: a doc edited since the read is skipped and
 *   reported as a conflict, never clobbered. Idempotent (an already-set doc is never planned).
 * - Batches of ≤ 400. Nothing is ever created or deleted.
 */
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';
import { planSurfaceClass, summarizeSurfaceClassPlans, type SurfaceClassPlan, type SurfaceClassPlanSummary } from '../../../src/lib/routes-nationwide/surface-class-backfill';
import { isSurfaceClass, type SurfaceClass } from '../../../src/lib/route-score/surface-class';

export interface SurfaceClassWrite {
  id: string;
  surfaceClass: SurfaceClass;
  existingAuthorityId: string | null;
  existingCity: string | null;
  updateTime: Timestamp;
}

export interface SurfaceClassRow { id: string; name: string; city: string | null; plan: SurfaceClassPlan }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The exact validated payload ({surfaceClass}). Throws on anything else. */
export function surfaceClassPayload(w: Pick<SurfaceClassWrite, 'surfaceClass' | 'existingAuthorityId' | 'existingCity'>, knownAuthorityIds: Set<string>): Record<string, unknown> {
  if (!isSurfaceClass(w.surfaceClass) || w.surfaceClass === 'unknown') throw new Error(`backfill only writes a known surfaceClass, got ${String(w.surfaceClass)}`);
  const validated = buildValidatedDoc('official_routes', { surfaceClass: w.surfaceClass }, {
    mode: 'update',
    knownAuthorityIds,
    existing: { authorityId: w.existingAuthorityId ?? undefined, city: w.existingCity ?? undefined },
  });
  const keys = Object.keys(validated);
  if (keys.length !== 1 || keys[0] !== 'surfaceClass') throw new Error(`validated payload must be exactly {surfaceClass}, got {${keys.join(',')}}`);
  return validated;
}

export async function planSurfaceClassBackfill(
  db: Firestore,
  opts: { city?: string | null; knownAuthorityIds: Set<string> },
): Promise<{ rows: SurfaceClassRow[]; writes: SurfaceClassWrite[]; summary: SurfaceClassPlanSummary }> {
  const [routes, scores] = await Promise.all([
    db.collection('official_routes').select('surfaceClass', 'name', 'city', 'authorityId').get(),
    db.collection('route_scores').select('routeId', 'routeCollection', 'surfaceClass').get(),
  ]);
  const scoreById = new Map<string, Record<string, any>>();
  for (const d of scores.docs) scoreById.set(d.id, d.data());
  const rows: SurfaceClassRow[] = [];
  const writes: SurfaceClassWrite[] = [];
  for (const d of routes.docs) {
    const x = d.data();
    const city = str(x.city);
    if (opts.city && city !== opts.city) continue;
    const plan = planSurfaceClass(d.id, x, scoreById.get(d.id));
    rows.push({ id: d.id, name: String(x.name ?? ''), city, plan });
    if (plan.kind === 'fill') {
      const w: SurfaceClassWrite = { id: d.id, surfaceClass: plan.surfaceClass, existingAuthorityId: str(x.authorityId), existingCity: city, updateTime: d.updateTime };
      surfaceClassPayload(w, opts.knownAuthorityIds); // chokepoint now, in dry-run too
      writes.push(w);
    }
  }
  return { rows, writes, summary: summarizeSurfaceClassPlans(rows.map((r) => r.plan)) };
}

export async function applySurfaceClassWrites(
  db: Firestore,
  writes: SurfaceClassWrite[],
  knownAuthorityIds: Set<string>,
  opts: { batchSize?: number; pauseMs?: number; log?: (s: string) => void } = {},
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const log = opts.log ?? console.log;
  const size = Math.min(400, Math.max(1, opts.batchSize ?? 400));
  const prepared = writes.map((w) => ({ w, payload: surfaceClassPayload(w, knownAuthorityIds) }));
  let written = 0;
  const conflicts: string[] = [];
  const batches = Math.ceil(prepared.length / size);
  for (let i = 0; i < batches; i++) {
    const part = prepared.slice(i * size, (i + 1) * size);
    const batch = db.batch();
    for (const { w, payload } of part) batch.update(db.collection('official_routes').doc(w.id), payload, { lastUpdateTime: w.updateTime });
    try {
      await batch.commit();
      written += part.length;
    } catch {
      // A precondition failure rejects the whole batch — retry one by one so only the edited docs are skipped.
      for (const { w, payload } of part) {
        try {
          await db.collection('official_routes').doc(w.id).update(payload, { lastUpdateTime: w.updateTime });
          written++;
        } catch {
          conflicts.push(`official_routes/${w.id}`);
        }
      }
    }
    log(`  surface-class backfill: batch ${i + 1}/${batches} (${part.length} docs)`);
    if (opts.pauseMs && i < batches - 1) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { written, conflicts, batches };
}
