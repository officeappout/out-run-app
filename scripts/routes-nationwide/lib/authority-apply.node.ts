/**
 * The only writer for assign-authority-by-boundary.ts (RC6 step 1): a
 * FIELD-LEVEL update of `{authorityId, city?}` on existing official_routes /
 * curated_routes docs that have no authorityId yet.
 *
 * - Every payload goes through buildValidatedDoc (update mode) with the doc's
 *   existing authorityId/city, so §23's lock-once-set is enforced at the write
 *   site, not just by the planner.
 * - Asserted to carry only authorityId (+ city) — nothing else on the doc.
 * - Guarded by the doc's read-time updateTime: a doc edited since the read is
 *   skipped and reported as a conflict, never clobbered.
 * - Batches of ≤ 400. Nothing is ever deleted.
 */
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';

export type AuthorityTargetCollection = 'official_routes' | 'curated_routes';

export interface AuthorityWrite {
  collection: AuthorityTargetCollection;
  id: string;
  authorityId: string;
  city?: string;
  existingCity: string | null;
  updateTime: Timestamp;
}

/** The exact validated payload: {authorityId} or {authorityId, city}. Throws on a §23 lock violation. */
export function authorityPayload(w: Omit<AuthorityWrite, 'updateTime'>, knownAuthorityIds: Set<string>): Record<string, unknown> {
  const raw: Record<string, unknown> = { authorityId: w.authorityId, ...(w.city ? { city: w.city } : {}) };
  const validated = buildValidatedDoc(w.collection, raw, {
    mode: 'update',
    knownAuthorityIds,
    existing: { authorityId: undefined, city: w.existingCity ?? undefined },
  });
  const keys = Object.keys(validated).sort();
  const allowed = w.city ? ['authorityId', 'city'] : ['authorityId'];
  if (keys.join(',') !== allowed.join(',')) throw new Error(`authority payload must be exactly {${allowed.join(',')}}, got {${keys.join(',')}}`);
  return validated;
}

export async function applyAuthorityWrites(
  db: Firestore,
  writes: AuthorityWrite[],
  knownAuthorityIds: Set<string>,
  opts: { batchSize?: number; pauseMs?: number; log?: (s: string) => void } = {},
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const log = opts.log ?? console.log;
  const size = Math.min(400, Math.max(1, opts.batchSize ?? 400));
  const prepared = writes.map((w) => ({ w, payload: { ...authorityPayload(w, knownAuthorityIds), updatedAt: FieldValue.serverTimestamp() } }));
  let written = 0;
  const conflicts: string[] = [];
  const batches = Math.ceil(prepared.length / size);
  for (let i = 0; i < batches; i++) {
    const part = prepared.slice(i * size, (i + 1) * size);
    const batch = db.batch();
    for (const { w, payload } of part) batch.update(db.collection(w.collection).doc(w.id), payload, { lastUpdateTime: w.updateTime });
    try {
      await batch.commit();
      written += part.length;
    } catch {
      for (const { w, payload } of part) {
        try {
          await db.collection(w.collection).doc(w.id).update(payload, { lastUpdateTime: w.updateTime });
          written++;
        } catch {
          conflicts.push(`${w.collection}/${w.id}`);
        }
      }
    }
    log(`  authority backfill: batch ${i + 1}/${batches} (${part.length} docs)`);
    if (opts.pauseMs && i < batches - 1) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { written, conflicts, batches };
}
