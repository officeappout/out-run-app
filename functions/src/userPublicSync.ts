/**
 * Cloud Function: userPublicSync — SPEC-03 Wave B (SEC-06)
 *
 * `users/{uid}` used to be readable by any authenticated user (including
 * an anonymous guest) whenever `core.discoverable == true` — exposing the
 * FULL document: email, birthDate, home coordinates, tenantId, alongside
 * the handful of fields any real caller actually needed. A Firestore rule
 * can restrict WHICH docs are readable, not WHICH FIELDS within a
 * readable doc. Same pattern as `inviteCode` (SPEC-01),
 * `healthDeclarationPdfUrl` (SPEC-02), and `dailyActivity` (this same
 * spec's Wave A): the lean public subset now lives in its own collection,
 * `userPublic`, and `users/{uid}` itself is owner + admin only.
 *
 * Mirrored fields — every one confirmed against a real caller by grepping
 * every cross-user `users/{uid}` read in `src/` (see firestore.rules'
 * comment on the `userPublic` match block for the full list and why each
 * field is there; `ageGroup` in particular is NOT in the field set the
 * spec suggested, but is load-bearing for a minor-DM safety gate).
 *
 * Existence IS the discoverable signal — a doc only exists here for a
 * user whose `core.discoverable` is true. No `discoverable` field is
 * mirrored; no query anywhere needs to filter by it.
 *
 * Why a write TRIGGER here, unlike dailyActivityPublicSync's SCHEDULE
 * ─────────────────────────────────────────────────────────────────────
 * dailyActivity is written many times a day per user by a passive sensor
 * sync — a write-triggered mirror there would roughly double its write
 * volume. `users/{uid}` profile-field edits (name, photo, discoverable
 * toggle) are comparatively rare — onboarding time, occasional settings
 * changes — so a trigger is the better fit here: freshness matters more
 * (a user who just changed their display name expects search results to
 * reflect it soon, not up to 2 hours later), and the volume risk is much
 * lower. The real amplification risk on THIS doc is progression fields
 * changing far more often than profile fields (XP awards on every
 * workout) — handled below by diffing only the fields this collection
 * actually mirrors and skipping the sync entirely when none of them
 * changed, so an XP-only write never triggers a userPublic write at all.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Primitive (string/number) fields only — compared with !==, which is
// correct for primitives but would be WRONG for an array field (two
// independently-deserialized Firestore snapshots never share array
// references, so !== would read as "changed" on every write regardless of
// actual content — see trainingTagsChanged below, compared by value instead).
const MIRRORED_CORE_FIELDS = [
  'name',
  'photoURL',
  'mainGoal',
  'authorityId',
  'ageGroup',
  'initialFitnessTier',
  // Profile redesign round 5 — set via the new Edit Profile screen,
  // displayed on the public profile page.
  'bio',
] as const;

export const userPublicSync = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const publicRef = db.doc(`userPublic/${uid}`);

  const after = event.data?.after?.exists ? event.data.after.data() : undefined;
  if (!after) {
    // Doc deleted (account deletion) — remove the mirror too.
    await publicRef.delete().catch(() => {});
    return;
  }

  const before = event.data?.before?.exists ? event.data.before.data() : undefined;
  const afterCore = (after.core ?? {}) as Record<string, unknown>;
  const beforeCore = (before?.core ?? {}) as Record<string, unknown>;

  const afterDiscoverable = afterCore.discoverable === true;
  const beforeDiscoverable = beforeCore.discoverable === true;

  if (!afterDiscoverable) {
    if (beforeDiscoverable) {
      // Just opted out — remove any existing mirror.
      await publicRef.delete().catch(() => {});
    }
    return;
  }

  const afterLevel = (after.progression as Record<string, unknown> | undefined)?.currentLevel;
  const beforeLevel = (before?.progression as Record<string, unknown> | undefined)?.currentLevel;

  // trainingTags is an array — compared by value (below), not with the
  // generic !== loop above, which only works for primitives.
  const afterTags = (afterCore.trainingTags as string[] | undefined) ?? [];
  const beforeTags = (beforeCore.trainingTags as string[] | undefined) ?? [];
  const trainingTagsChanged =
    afterTags.length !== beforeTags.length || afterTags.some((t) => !beforeTags.includes(t));

  // Write on opt-in (discoverable just flipped false→true), or when a
  // MIRRORED field actually changed — an XP/progression write that never
  // touches core.name/photoURL/etc. must not trigger a userPublic write at
  // all (that per-write cost is exactly what this diff-and-skip exists to
  // avoid; a mirror doc's existence is never re-checked here on purpose —
  // see below).
  //
  // Known gap, by design, not oversight (found 10.09.2026): justOptedIn
  // only catches beforeDiscoverable flipping from false→true. A user who
  // was ALREADY core.discoverable === true before this function was ever
  // deployed has beforeDiscoverable === true on every subsequent write
  // too, so justOptedIn is always false for them — meaning if their
  // mirror doc is missing or was never created, this trigger alone will
  // never create or repair it, no matter how many times it fires,
  // because it has no way to notice the absence without paying for a
  // read on every write (including every XP award) to check. That read
  // is deliberately NOT added here — the fix for this class of gap is a
  // one-time backfill script (scripts/backfill-user-public.ts), not a
  // standing per-write existence check on a hot path.
  const justOptedIn = !beforeDiscoverable;
  const mirroredFieldChanged =
    MIRRORED_CORE_FIELDS.some((f) => afterCore[f] !== beforeCore[f])
    || trainingTagsChanged
    || afterLevel !== beforeLevel;

  if (!justOptedIn && !mirroredFieldChanged) {
    return;
  }

  await publicRef.set({
    name: (afterCore.name as string | undefined) ?? 'ללא שם',
    photoURL: (afterCore.photoURL as string | undefined) ?? null,
    mainGoal: (afterCore.mainGoal as string | undefined) ?? null,
    authorityId: (afterCore.authorityId as string | undefined) ?? null,
    ageGroup: (afterCore.ageGroup as string | undefined) ?? 'minor',
    initialFitnessTier: (afterCore.initialFitnessTier as string | undefined) ?? null,
    currentLevel: (afterLevel as string | number | undefined) ?? null,
    bio: (afterCore.bio as string | undefined) ?? null,
    trainingTags: afterTags,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[userPublicSync] synced userPublic/${uid}`);
});
