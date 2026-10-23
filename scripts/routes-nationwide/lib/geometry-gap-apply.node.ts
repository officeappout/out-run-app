/**
 * The only writer for repair-route-geometry-gaps.ts: ARCHIVES still-pending,
 * unpublished official_routes docs whose path was built with straight bridges
 * (see src/lib/routes-nationwide/geometry-gaps.ts for why archive-and-regenerate).
 *
 * The payload is exactly what the approval center's reject writes
 * (moderation.service.ts rejectEntity 'route'): published:false, status:'archived',
 * rejectionReason, reviewedBy, reviewedAt (+ updatedAt). Every payload goes through
 * buildValidatedDoc (update mode); every write is guarded by the doc's read-time
 * updateTime (a doc edited / approved since is skipped as a conflict). Nothing is
 * ever deleted; a published doc is never written (the CLI only passes pending ones
 * and the precondition would fail anyway after an approve). Batches ≤ 400.
 */
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';
import { GEOMETRY_GAP_REJECTION_REASON, REPAIR_REVIEWER } from '../../../src/lib/routes-nationwide/geometry-gaps';

export interface GapArchiveWrite {
  id: string;
  authorityId: string;
  city: string | null;
  updateTime: Timestamp;
}

export function gapArchivePayload(w: GapArchiveWrite, knownAuthorityIds: Set<string>): Record<string, unknown> {
  const validated = buildValidatedDoc(
    'official_routes',
    { published: false, status: 'archived', rejectionReason: GEOMETRY_GAP_REJECTION_REASON, reviewedBy: REPAIR_REVIEWER },
    { mode: 'update', knownAuthorityIds, existing: { authorityId: w.authorityId, city: w.city ?? undefined } },
  );
  const keys = Object.keys(validated).sort().join(',');
  if (keys !== 'published,rejectionReason,reviewedBy,status') throw new Error(`gap-archive payload must be exactly {published,rejectionReason,reviewedBy,status}, got {${keys}}`);
  return validated;
}

export async function applyGapArchives(
  db: Firestore,
  writes: GapArchiveWrite[],
  knownAuthorityIds: Set<string>,
  opts: { batchSize?: number; pauseMs?: number; log?: (s: string) => void } = {},
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const log = opts.log ?? console.log;
  const size = Math.min(400, Math.max(1, opts.batchSize ?? 200));
  const prepared = writes.map((w) => ({
    w,
    payload: { ...gapArchivePayload(w, knownAuthorityIds), reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
  }));
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
      // one stale precondition fails the whole batch — retry doc by doc so only the stale ones are skipped
      for (const { w, payload } of part) {
        try {
          await db.collection('official_routes').doc(w.id).update(payload, { lastUpdateTime: w.updateTime });
          written++;
        } catch {
          conflicts.push(`official_routes/${w.id}`);
        }
      }
    }
    log(`  repair: batch ${i + 1}/${batches} (${part.length} docs)`);
    if (opts.pauseMs && i < batches - 1) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { written, conflicts, batches };
}
