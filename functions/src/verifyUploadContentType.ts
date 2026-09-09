/**
 * Cloud Function: verifyUploadContentType — SPEC-03 Wave D.4
 *
 * storage.rules' isImage()/isPdf() check `request.resource.contentType`
 * — a value the uploading CLIENT sets on the request, not something
 * Storage independently verifies. A caller can claim `image/jpeg` while
 * uploading an HTML file with an embedded script, an executable, or a
 * polyglot file, and the rule passes cleanly — Security Rules can only
 * see request metadata, never the file's actual bytes, so "real
 * content-based type detection" isn't expressible in rules at all.
 *
 * This fires AFTER upload (onObjectFinalized — the object already exists
 * in Storage by the time this runs) on the 3 genuinely user-facing,
 * non-admin, self-service upload paths — the ones an outside caller can
 * actually reach with a forged Content-Type: communities/{uid} (F-14,
 * SPEC-02), contribution-photos/{uid} (public read — the highest-risk
 * one, attacker-visible the moment it lands), health-declarations/{uid}
 * (PDFs). Every other storage.rules path (admin-avatars, parks,
 * authorities, locations, gear_icons, etc.) is admin-only — a trusted
 * internal user, not the threat model this check is for — so left
 * uncovered to keep this scoped to the paths that actually need it.
 *
 * On a mismatch: DELETE the object (fail closed) and log loudly. There
 * is no clean way to notify the uploader synchronously — this runs
 * async, after their upload already "succeeded" client-side — so a
 * legitimate file must never trip this: the signature set below is
 * deliberately restricted to the small, extremely well-standardized set
 * of magic bytes for the exact formats storage.rules already claims to
 * accept (isImage()/isPdf()), not a broad "detect anything" library.
 */

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { detectFileSignature, matchesExpectedCategory } from './lib/detectFileSignature';
import { expectedUploadCategoryFor } from './lib/expectedUploadCategoryFor';

if (!admin.apps.length) {
  admin.initializeApp();
}

const storage = admin.storage();

// Enough bytes to cover every signature in detectFileSignature.ts (WEBP's
// "WEBP" marker starts at offset 8, so 16 bytes covers it with margin).
const SIGNATURE_BYTES = 16;

export const verifyUploadContentType = onObjectFinalized(
  { maxInstances: 20 },
  async (event) => {
    const filePath = event.data.name;
    const expected = expectedUploadCategoryFor(filePath);
    if (!expected) return; // not one of the scoped user-facing paths

    const bucket = storage.bucket(event.data.bucket);
    const file = bucket.file(filePath);

    let head: Buffer;
    try {
      [head] = await file.download({ start: 0, end: SIGNATURE_BYTES - 1 });
    } catch (err) {
      logger.warn(`[verifyUploadContentType] could not download head bytes for ${filePath}, skipping check:`, err);
      return;
    }

    const detected = detectFileSignature(head);
    if (matchesExpectedCategory(detected, expected)) {
      return; // real content matches the claimed category — fine
    }

    logger.error(
      `[verifyUploadContentType] DELETING mismatched upload: ${filePath} — claimed contentType "${event.data.contentType ?? 'unknown'}" ` +
      `(expected category "${expected}"), but the file's actual magic bytes indicate "${detected}".`,
    );
    try {
      await file.delete();
    } catch (err) {
      logger.error(`[verifyUploadContentType] failed to delete mismatched upload ${filePath}:`, err);
    }
  },
);
