/**
 * scripts/backfill-member-names.ts
 *
 * Fixes member records where name === 'משתמש' due to the poisoned-default bug:
 * join/confirm and session-token passed 'משתמש' (truthy) to joinEngine, which
 * prevented the engine's Firestore fallback (userData?.core?.name) from running.
 *
 * Patches two collections per group:
 *   A. community_groups/{groupId}/members/{uid}.name
 *   B. community_groups/{groupId}/attendance/{attendanceId}.attendeeProfiles.{uid}.name
 *
 * Only updates records where:
 *   - stored name === 'משתמש'   (the broken placeholder)
 *   - users/{uid}.core.name exists and is not 'משתמש'  (a real name is available)
 *
 * Usage:
 *   DRY RUN (default — no writes):
 *     npx tsx scripts/backfill-member-names.ts
 *
 *   WRITE to Firestore:
 *     npx tsx scripts/backfill-member-names.ts --write
 *
 * Safe to re-run — idempotent (only touches name === 'משתמש').
 */

import * as admin from 'firebase-admin';

const isDryRun = !process.argv.includes('--write');

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const BROKEN = 'משתמש';

// Cache uid → realName to avoid redundant Firestore reads within the same run.
const nameCache = new Map<string, string | null>();

async function resolveRealName(uid: string): Promise<string | null> {
  if (nameCache.has(uid)) return nameCache.get(uid)!;
  const snap = await db.doc(`users/${uid}`).get();
  const name = (snap.data()?.core?.name as string | undefined)?.trim() ?? null;
  const resolved = name && name !== BROKEN ? name : null;
  nameCache.set(uid, resolved);
  return resolved;
}

async function run() {
  console.log(isDryRun ? '🔍 DRY RUN — no writes. Pass --write to commit.' : '✍️  WRITE mode');
  console.log('');

  const groupsSnap = await db.collection('community_groups').get();
  console.log(`Found ${groupsSnap.size} groups\n`);

  let fixedMembers = 0;
  let fixedAttendees = 0;
  let skippedNoName = 0;

  for (const gDoc of groupsSnap.docs) {
    const gid = gDoc.id;

    // ── (א) members subcollection ────────────────────────────────────────────
    const membersSnap = await gDoc.ref
      .collection('members')
      .where('name', '==', BROKEN)
      .get();

    if (!membersSnap.empty) {
      let batch = db.batch();
      let ops = 0;

      for (const mDoc of membersSnap.docs) {
        const uid = mDoc.id;
        const realName = await resolveRealName(uid);
        if (!realName) {
          skippedNoName++;
          console.log(`  ⚠️  members/${gid}/${uid} — no core.name, skip`);
          continue;
        }
        console.log(`  ✅ members/${gid}/${uid} → "${realName}"`);
        if (!isDryRun) {
          batch.update(mDoc.ref, { name: realName });
          ops++;
          // Firestore batch limit is 500; flush early at 400 for headroom.
          if (ops >= 400) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
          }
        }
        fixedMembers++;
      }

      if (!isDryRun && ops > 0) await batch.commit();
    }

    // ── (ב) attendance → attendeeProfiles map ───────────────────────────────
    const attSnap = await gDoc.ref.collection('attendance').get();

    for (const aDoc of attSnap.docs) {
      const profiles = (aDoc.data()?.attendeeProfiles ?? {}) as Record<
        string,
        { name?: string; photoURL?: string }
      >;

      const updates: Record<string, string> = {};

      for (const [uid, prof] of Object.entries(profiles)) {
        if (prof?.name !== BROKEN) continue;
        const realName = await resolveRealName(uid);
        if (!realName) {
          skippedNoName++;
          console.log(`  ⚠️  attendance/${gid}/${aDoc.id}/profiles/${uid} — no core.name, skip`);
          continue;
        }
        console.log(`  ✅ attendance/${gid}/${aDoc.id}/profiles/${uid} → "${realName}"`);
        updates[`attendeeProfiles.${uid}.name`] = realName;
        fixedAttendees++;
      }

      if (!isDryRun && Object.keys(updates).length > 0) {
        await aDoc.ref.update(updates);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────');
  console.log(`  members fixed:       ${fixedMembers}`);
  console.log(`  attendee profiles:   ${fixedAttendees}`);
  console.log(`  skipped (no name):   ${skippedNoName}  ← still anonymous, JSX fallback covers them`);
  if (isDryRun) {
    console.log('\n  ℹ️  DRY RUN — nothing written. Run with --write to apply.');
  }
}

run().then(() => console.log('\ndone')).catch(console.error);
