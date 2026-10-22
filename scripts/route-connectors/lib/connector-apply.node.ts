/**
 * The only Firestore reader/writer for tag-route-connectors.ts (RC10):
 * a FIELD-LEVEL update of `{displayRole: 'connector'}` on existing
 * official_routes docs of ONE authority.
 *
 * - Reads only `official_routes where authorityId == <id>` (plus the doc's
 *   updateTime, for the precondition below).
 * - Every payload goes through buildValidatedDoc (update mode) with the doc's
 *   existing authorityId/city, and is asserted to carry ONLY displayRole —
 *   nothing else on the doc (status / published / path / name) is touched.
 * - Guarded by the doc's read-time updateTime: a doc edited since the read is
 *   skipped and reported as a conflict, never clobbered.
 * - Batches of ≤ 400. Never creates, never deletes.
 */
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';

export interface AuthorityRouteDoc {
  id: string;
  data: Record<string, any>;
  updateTime: Timestamp;
}

export async function readAuthorityOfficialRoutes(db: Firestore, authorityId: string): Promise<AuthorityRouteDoc[]> {
  const snap = await db.collection('official_routes').where('authorityId', '==', authorityId).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {}, updateTime: d.updateTime }));
}

export interface ConnectorWrite {
  id: string;
  existingAuthorityId: string | null;
  existingCity: string | null;
  updateTime: Timestamp;
}

/** The exact validated payload: {displayRole: 'connector'}. Throws on anything else. */
export function connectorPayload(w: Omit<ConnectorWrite, 'updateTime'>, knownAuthorityIds: Set<string>): Record<string, unknown> {
  const validated = buildValidatedDoc('official_routes', { displayRole: 'connector' }, {
    mode: 'update',
    knownAuthorityIds,
    existing: { authorityId: w.existingAuthorityId ?? undefined, city: w.existingCity ?? undefined },
  });
  const keys = Object.keys(validated);
  if (keys.length !== 1 || keys[0] !== 'displayRole' || validated.displayRole !== 'connector') {
    throw new Error(`connector payload must be exactly {displayRole:'connector'}, got ${JSON.stringify(validated)}`);
  }
  return validated;
}

export async function applyConnectorWrites(
  db: Firestore,
  writes: ConnectorWrite[],
  knownAuthorityIds: Set<string>,
  opts: { batchSize?: number; log?: (s: string) => void } = {},
): Promise<{ written: number; conflicts: string[]; batches: number }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const log = opts.log ?? console.log;
  const size = Math.min(400, Math.max(1, opts.batchSize ?? 400));
  const prepared = writes.map((w) => ({ w, payload: { ...connectorPayload(w, knownAuthorityIds), updatedAt: FieldValue.serverTimestamp() } }));
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
    log(`  connector tag: batch ${i + 1}/${batches} (${part.length} docs)`);
  }
  return { written, conflicts, batches };
}
