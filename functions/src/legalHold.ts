/**
 * Legal Hold — 7-year post-deletion archive (Israeli statute of limitations).
 *
 * Legal basis
 * ───────────
 * Israeli tort claims are subject to a 7-year limitation period (Limitation
 * Law 5718-1958). To defend against an injury claim arising from a workout,
 * the company must be able to produce: who the user was (name + email), what
 * they did (workout history incl. GPS), where they trained (park sessions),
 * and the medical self-certification they signed (PAR-Q health declaration).
 *
 * When a user deletes their account we therefore archive a minimal copy of
 * this data into `legal_hold/{uid}` BEFORE the normal GDPR purge wipes the
 * originals. The archive is:
 *   • inaccessible to the data subject and every non-admin client
 *     (firestore.rules denies all client access; admins read via the
 *     ADMIN FALLBACK catch-all for legal proceedings only),
 *   • automatically destroyed once the 7-year window elapses
 *     (`purgeExpiredLegalHolds` below).
 *
 * Two pieces:
 *   1. `createLegalHold(uid, displayName, email)` — idempotent helper called
 *      from the account-deletion pipeline (functions/src/onUserDelete.ts) on
 *      BOTH entry points (callable + Auth onDelete trigger).
 *   2. `purgeExpiredLegalHolds` — monthly scheduled function that deletes
 *      expired holds plus their Storage PDFs.
 *
 * The health-declaration PDF is NOT moved — it stays in place under
 * `health-declarations/{uid}/` and the legal_hold root doc records its path.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

// Firestore batch ceiling is 500 writes — stay safely under it.
const BATCH_SIZE = 400;
// Retention window mandated by the Israeli statute of limitations.
const RETENTION_YEARS = 7;
// Hard cap on archived workouts per user so a power-user's deletion cannot
// blow the 540s callable timeout. If exceeded we archive the most recent N
// and flag the root doc as truncated.
const MAX_LEGAL_HOLD_WORKOUTS = 2000;
// Per-document size guard. Firestore's hard limit is 1 MiB; we strip the GPS
// route from any workout that would approach it.
const MAX_DOC_BYTES = 900_000;

const HEALTH_DECLARATION_PREFIX = (uid: string) => `health-declarations/${uid}/`;

interface LegalHoldResult {
  created: boolean;
  workoutCount: number;
  sessionCount: number;
  truncated: boolean;
}

/**
 * Compute a Timestamp `years` into the future from `from`.
 */
function yearsFromNow(years: number, from: Date = new Date()): admin.firestore.Timestamp {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return admin.firestore.Timestamp.fromDate(d);
}

/**
 * Extract the Storage object path from a Firebase `getDownloadURL()` result.
 * Download URLs look like:
 *   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{ENCODED_PATH}?alt=media&token=...
 * The `{ENCODED_PATH}` segment is URL-encoded (slashes → %2F). Returns null
 * if the URL is not a recognisable Firebase Storage download URL.
 */
function parseStoragePathFromDownloadUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const marker = '/o/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const afterO = url.slice(idx + marker.length);
    const qIdx = afterO.indexOf('?');
    const encoded = qIdx === -1 ? afterO : afterO.slice(0, qIdx);
    const decoded = decodeURIComponent(encoded);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort lookup of the health-declaration PDF path for a user. Prefers
 * the URL stored on the user doc; falls back to listing the Storage prefix
 * (handles legacy users whose doc field is missing).
 */
async function resolveHealthDeclarationPath(
  uid: string,
  pdfUrl: unknown,
): Promise<string | null> {
  const parsed = parseStoragePathFromDownloadUrl(pdfUrl);
  if (parsed) return parsed;

  try {
    const [files] = await storage.bucket().getFiles({ prefix: HEALTH_DECLARATION_PREFIX(uid) });
    if (files.length > 0) {
      // Most recent upload wins if several exist.
      return files
        .map((f) => f.name)
        .sort()
        .reverse()[0];
    }
  } catch (e) {
    logger.warn(`[legalHold] failed listing health-declaration prefix for ${uid}`, e);
  }
  return null;
}

/**
 * Copy the documents from `sourceQuery` into `targetCollection`, preserving
 * the original document IDs. Applies a per-document size guard that strips a
 * `heavyField` (e.g. GPS `routePath`) from any doc that would approach the
 * 1 MiB Firestore ceiling. Returns the number of documents written.
 */
async function copyDocsPreservingId(
  docs: admin.firestore.QueryDocumentSnapshot[],
  targetCollection: admin.firestore.CollectionReference,
  heavyField?: string,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const snap of slice) {
      const data = snap.data();
      let payload: Record<string, unknown> = data;
      if (heavyField && data[heavyField] !== undefined) {
        try {
          if (JSON.stringify(data).length > MAX_DOC_BYTES) {
            payload = { ...data, [heavyField]: null, routePathTruncated: true };
          }
        } catch {
          // Non-serialisable (e.g. GeoPoint/Timestamp) — leave as-is; these
          // are far below the size ceiling in practice.
        }
      }
      batch.set(targetCollection.doc(snap.id), payload);
      written++;
    }
    await batch.commit();
  }
  return written;
}

/**
 * Archive a user's legally-relevant data into `legal_hold/{uid}` before the
 * account purge. Idempotent: if the hold already exists it returns without
 * re-archiving (handles the callable→Auth-trigger double-fire).
 *
 * MUST complete successfully before the caller purges the originals — the
 * caller is responsible for aborting deletion if this throws.
 */
export async function createLegalHold(
  uid: string,
  displayName: string | null | undefined,
  email: string | null | undefined,
): Promise<LegalHoldResult> {
  const holdRef = db.collection('legal_hold').doc(uid);

  // ── Idempotency guard ──────────────────────────────────────────────
  const existing = await holdRef.get();
  if (existing.exists) {
    logger.info(`[createLegalHold] hold already exists for uid=${uid} — skipping`);
    const data = existing.data() ?? {};
    return {
      created: false,
      workoutCount: Number(data.workoutCount ?? 0),
      sessionCount: Number(data.sessionCount ?? 0),
      truncated: Boolean(data.truncated ?? false),
    };
  }

  // ── Resolve identity + health declaration path ─────────────────────
  // displayName/email passed in by the caller (from the Firestore user doc
  // on the callable path, or the Auth UserRecord on the trigger path). Fall
  // back to the user doc here in case the caller passed nullish values.
  let resolvedName = displayName ?? null;
  let resolvedEmail = email ?? null;
  let pdfUrl: unknown = null;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (userSnap.exists) {
      const u = userSnap.data() ?? {};
      resolvedName =
        resolvedName ?? (u.displayName ?? u.healthUserName ?? u.core?.displayName ?? null);
      resolvedEmail = resolvedEmail ?? (u.email ?? u.core?.email ?? null);
      pdfUrl = u.healthDeclarationPdfUrl ?? null;
    }
  } catch (e) {
    logger.warn(`[createLegalHold] could not read users/${uid} for identity`, e);
  }

  const healthDeclarationStoragePath = await resolveHealthDeclarationPath(uid, pdfUrl);

  // ── Gather workouts + sessions ─────────────────────────────────────
  const workoutSnap = await db
    .collection('workouts')
    .where('userId', '==', uid)
    .limit(MAX_LEGAL_HOLD_WORKOUTS + 1)
    .get();

  const truncated = workoutSnap.size > MAX_LEGAL_HOLD_WORKOUTS;
  const workoutDocs = truncated
    ? workoutSnap.docs.slice(0, MAX_LEGAL_HOLD_WORKOUTS)
    : workoutSnap.docs;
  if (truncated) {
    logger.warn(
      `[createLegalHold] uid=${uid} exceeded ${MAX_LEGAL_HOLD_WORKOUTS} workouts — archiving most recent only`,
    );
  }

  const sessionSnap = await db.collection('sessions').where('userId', '==', uid).get();

  // ── Write root doc FIRST so idempotency holds even if copies are
  //    interrupted mid-way (a retry sees the existing doc and skips). ─
  const now = admin.firestore.Timestamp.now();
  await holdRef.set({
    uid,
    displayName: resolvedName,
    email: resolvedEmail,
    deletedAt: now,
    deleteAt: yearsFromNow(RETENTION_YEARS, now.toDate()),
    healthDeclarationStoragePath: healthDeclarationStoragePath ?? null,
    workoutCount: workoutDocs.length,
    sessionCount: sessionSnap.size,
    truncated,
    reason:
      'Israeli Tort Law — Limitation Law 5718-1958, 7-year statute of limitations',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ── Copy subcollections ────────────────────────────────────────────
  const workoutCount = await copyDocsPreservingId(
    workoutDocs,
    holdRef.collection('workouts'),
    'routePath',
  );
  const sessionCount = await copyDocsPreservingId(
    sessionSnap.docs,
    holdRef.collection('sessions'),
  );

  logger.info(
    `[createLegalHold] archived uid=${uid} workouts=${workoutCount} sessions=${sessionCount} ` +
      `pdf=${healthDeclarationStoragePath ?? 'none'} truncated=${truncated}`,
  );

  return { created: true, workoutCount, sessionCount, truncated };
}

/**
 * Delete every Storage object under `prefix`. Best-effort; returns count.
 */
async function deleteStoragePrefix(prefix: string): Promise<number> {
  try {
    const [files] = await storage.bucket().getFiles({ prefix });
    if (files.length === 0) return 0;
    await Promise.all(files.map((f) => f.delete().catch(() => null)));
    return files.length;
  } catch (e) {
    logger.warn(`[purgeExpiredLegalHolds] storage prefix delete failed for ${prefix}`, e);
    return 0;
  }
}

/**
 * Monthly sweep — destroys legal_hold records whose 7-year window has
 * elapsed, along with the corresponding health-declaration PDFs in Storage.
 *
 * Runs on the 2nd of every month at 03:00 UTC (offset one day from
 * `cleanupOldLogs` on the 1st, so the two heavy sweeps don't overlap).
 */
export const purgeExpiredLegalHolds = onSchedule(
  {
    schedule: '0 3 2 * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const now = admin.firestore.Timestamp.now();
    logger.info(
      `[purgeExpiredLegalHolds] sweep start — deleting holds with deleteAt < ${now
        .toDate()
        .toISOString()}`,
    );

    const purgedUids: string[] = [];
    let storageFilesDeleted = 0;
    const failures: string[] = [];

    // Page through expired holds. recursiveDelete removes the root doc and
    // its workouts/sessions subcollections; we re-query each pass because the
    // previous page's docs no longer match.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snap = await db
        .collection('legal_hold')
        .where('deleteAt', '<', now)
        .limit(50)
        .get();

      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        const uid = docSnap.id;
        try {
          // 1. Storage PDF(s) for this user.
          const data = docSnap.data() ?? {};
          const explicitPath =
            typeof data.healthDeclarationStoragePath === 'string'
              ? data.healthDeclarationStoragePath
              : null;
          // Delete the whole per-user prefix to be safe (covers re-uploads).
          storageFilesDeleted += await deleteStoragePrefix(HEALTH_DECLARATION_PREFIX(uid));
          if (explicitPath && !explicitPath.startsWith(HEALTH_DECLARATION_PREFIX(uid))) {
            // Defensive: a non-standard recorded path outside the prefix.
            storageFilesDeleted += await deleteStoragePrefix(explicitPath);
          }

          // 2. The legal_hold tree (root + workouts + sessions).
          await db.recursiveDelete(docSnap.ref);
          purgedUids.push(uid);
        } catch (e) {
          logger.error(`[purgeExpiredLegalHolds] failed purging legal_hold/${uid}`, e);
          failures.push(uid);
        }
      }

      // If we got a short page there is nothing more to fetch.
      if (snap.size < 50) break;
    }

    logger.info(
      `[purgeExpiredLegalHolds] sweep complete — holds=${purgedUids.length}, ` +
        `storageFiles=${storageFilesDeleted}` +
        (failures.length ? `, FAILED=${failures.length}` : ''),
    );

    // Single summary audit row (not one per uid) for the compliance trail.
    if (purgedUids.length > 0 || failures.length > 0) {
      try {
        await db.collection('audit_logs').add({
          adminId: 'system',
          adminName: 'purgeExpiredLegalHolds',
          actionType: 'DELETE',
          targetEntity: 'System',
          targetId: 'legal_hold',
          details:
            '7-year legal-hold retention sweep (Limitation Law 5718-1958)',
          oldValue: null,
          newValue: JSON.stringify({
            purged: purgedUids.length,
            storageFiles: storageFilesDeleted,
            failed: failures.length,
            uids: purgedUids.slice(0, 200),
          }).slice(0, 10_000),
          sourceIp: 'scheduled',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        logger.warn('[purgeExpiredLegalHolds] failed writing summary audit row', e);
      }
    }

    if (failures.length) {
      throw new Error(
        `purgeExpiredLegalHolds failed for ${failures.length} hold(s): ${failures
          .slice(0, 20)
          .join(', ')}`,
      );
    }
  },
);
