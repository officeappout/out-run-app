/**
 * The only writer for cleanup-regional-pending.ts: field-level updates on
 * still-pending, unpublished official_routes docs of the regional run.
 *   rename    → payload exactly {name}
 *   duplicate → exactly what the approval center's reject writes
 *               (moderation.service.ts rejectEntity 'route'): published:false,
 *               status:'archived', rejectionReason, reviewedBy, reviewedAt.
 * Every payload goes through buildValidatedDoc (update mode); every write is
 * guarded by the doc's read-time updateTime (a doc edited since is skipped as
 * a conflict). Nothing is ever deleted. Batches ≤ 400.
 */
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';

export const REVIEWER = 'script:cleanup-regional-pending';

export type CleanupWrite =
  | { kind: 'rename'; id: string; name: string; authorityId: string; city: string | null; updateTime: Timestamp }
  | { kind: 'duplicate'; id: string; duplicateOf: string; authorityId: string; city: string | null; updateTime: Timestamp };

export function cleanupPayload(w: CleanupWrite, knownAuthorityIds: Set<string>): Record<string, unknown> {
  const raw: Record<string, unknown> = w.kind === 'rename'
    ? { name: w.name }
    : { published: false, status: 'archived', rejectionReason: `duplicate of ${w.duplicateOf}`, reviewedBy: REVIEWER };
  const validated = buildValidatedDoc('official_routes', raw, {
    mode: 'update',
    knownAuthorityIds,
    existing: { authorityId: w.authorityId, city: w.city ?? undefined },
  });
  const expected = w.kind === 'rename' ? ['name'] : ['published', 'rejectionReason', 'reviewedBy', 'status'];
  const keys = Object.keys(validated).sort();
  if (keys.join(',') !== expected.join(',')) throw new Error(`cleanup payload (${w.kind}) must be exactly {${expected.join(',')}}, got {${keys.join(',')}}`);
  return validated;
}

export async function applyCleanupWrites(
  db: Firestore,
  writes: CleanupWrite[],
  knownAuthorityIds: Set<string>,
  opts: { batchSize?: number; pauseMs?: number; log?: (s: string) => void } = {},
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const log = opts.log ?? console.log;
  const size = Math.min(400, Math.max(1, opts.batchSize ?? 200));
  const prepared = writes.map((w) => {
    const base = cleanupPayload(w, knownAuthorityIds);
    return { w, payload: { ...base, ...(w.kind === 'duplicate' ? { reviewedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp() } };
  });
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
      for (const { w, payload } of part) {
        try {
          await db.collection('official_routes').doc(w.id).update(payload, { lastUpdateTime: w.updateTime });
          written++;
        } catch {
          conflicts.push(`official_routes/${w.id}`);
        }
      }
    }
    log(`  cleanup: batch ${i + 1}/${batches} (${part.length} docs)`);
    if (opts.pauseMs && i < batches - 1) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { written, conflicts, batches };
}
