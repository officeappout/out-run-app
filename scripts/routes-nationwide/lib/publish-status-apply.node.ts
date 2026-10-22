/**
 * The only writer for backfill-route-publish-status.ts: a FIELD-LEVEL update that fills a
 * missing `published` and/or `status` on existing official_routes docs (plan:
 * src/lib/routes-nationwide/publish-status.ts → planPublishState).
 *
 * - Every payload goes through buildValidatedDoc (update mode) with the doc's existing
 *   authorityId/city, so §23 is enforced at the write site.
 * - Asserted to carry only `published` and/or `status` — nothing else on the doc.
 * - Guarded by the doc's read-time updateTime: a doc edited since the read (e.g. approved in
 *   the panel meanwhile) is skipped and reported as a conflict, never clobbered.
 * - Batches of ≤ 400. Nothing is ever created or deleted.
 */
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';
import type { PublishPatch } from '../../../src/lib/routes-nationwide/publish-status';

export interface PublishWrite {
  id: string;
  patch: PublishPatch;
  existingAuthorityId: string | null;
  existingCity: string | null;
  updateTime: Timestamp;
}

const ALLOWED = new Set(['published', 'status']);

/** The exact validated payload ({published?, status?}). Throws on anything else. */
export function publishPayload(w: Omit<PublishWrite, 'updateTime'>, knownAuthorityIds: Set<string>): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...w.patch };
  const keys = Object.keys(raw);
  if (keys.length === 0 || keys.some((k) => !ALLOWED.has(k))) {
    throw new Error(`publish payload must be a non-empty subset of {published,status}, got {${keys.join(',')}}`);
  }
  if ('published' in raw && raw.published !== true) throw new Error('backfill only ever writes published: true');
  if ('status' in raw && raw.status !== 'published' && raw.status !== 'pending') throw new Error(`unexpected status ${String(raw.status)}`);
  const validated = buildValidatedDoc('official_routes', raw, {
    mode: 'update',
    knownAuthorityIds,
    existing: { authorityId: w.existingAuthorityId ?? undefined, city: w.existingCity ?? undefined },
  });
  const out = Object.keys(validated).sort().join(',');
  if (out !== keys.sort().join(',')) throw new Error(`validated payload keys changed: {${out}}`);
  return validated;
}

export async function applyPublishWrites(
  db: Firestore,
  writes: PublishWrite[],
  knownAuthorityIds: Set<string>,
  opts: { batchSize?: number; pauseMs?: number; log?: (s: string) => void } = {},
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const log = opts.log ?? console.log;
  const size = Math.min(400, Math.max(1, opts.batchSize ?? 400));
  const prepared = writes.map((w) => ({ w, payload: { ...publishPayload(w, knownAuthorityIds), updatedAt: FieldValue.serverTimestamp() } }));
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
    log(`  publish-status backfill: batch ${i + 1}/${batches} (${part.length} docs)`);
    if (opts.pauseMs && i < batches - 1) await new Promise((r) => setTimeout(r, opts.pauseMs));
  }
  return { written, conflicts, batches };
}
