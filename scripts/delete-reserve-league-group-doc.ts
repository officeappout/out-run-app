/**
 * One-time cleanup: delete community_groups/military_reserve_general.
 *
 * Confirmed 08.09.2026 (see docs/research/military-persona-unified-architecture.md
 * follow-up): nothing legitimate reads this document's own content.
 *   - No chat is ever created for it (joinReserveLeague only writes the
 *     members subcollection + social.groupIds/user_memberships — see
 *     functions/src/militaryReserveLeague.ts, it never touches the parent doc).
 *   - No member-list UI ever opens it (excluded from every discovery query;
 *     it has no authorityId, so it's also invisible to the admin panel's
 *     getGroupsByAuthority-scoped group list).
 *   - The real reserve leaderboard reads reserveScope on streaks/dailyActivity
 *     directly (ranking.service.ts) — never this document or its memberCount.
 *   - The ONLY real consumer, useActivityStore.ts:818, checks
 *     `social.groupIds.includes(RESERVE_LEAGUE_GROUP_ID)` — a pure
 *     array-membership check on a client-known constant string. It never
 *     fetches this document.
 * Firestore subcollections don't require their parent document to exist,
 * so members/{uid} keeps working exactly as before. This document was pure
 * vestigial infrastructure whose only OBSERVED effect was the nearby-groups
 * bug (a location-less "group" polluting NearbyGroupsRow's privateJoinedGroups
 * merge via the shared social.groupIds field).
 *
 * NOT touched (per explicit instruction): members/{uid} subcollection docs,
 * social.groupIds, user_memberships — they keep working without this doc.
 *
 * SAFE BY DEFAULT: no flags = backs up and prints, zero deletes.
 * --confirm = deletes the parent doc only.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const GROUP_ID = 'military_reserve_general';

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  const groupRef = db.collection('community_groups').doc(GROUP_ID);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    console.log(`community_groups/${GROUP_ID} does not exist — nothing to do.`);
    return;
  }

  const membersSnap = await groupRef.collection('members').get();
  const backup = {
    groupDoc: groupSnap.data(),
    members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };

  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `reserve-league-group-doc-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2), 'utf-8');
  console.log(`Backed up ${GROUP_ID} (+${membersSnap.size} member docs, NOT deleted) to ${file}`);
  console.log(JSON.stringify(backup.groupDoc, null, 2));

  if (!confirm) {
    console.log('\nDry run only — no delete performed. Re-run with --confirm to delete the PARENT DOC ONLY.');
    console.log(`members/{uid} subcollection (${membersSnap.size} docs) will be LEFT AS-IS.`);
    return;
  }

  await groupRef.delete();
  console.log(`\n✅ Deleted community_groups/${GROUP_ID} (parent doc only). members/{uid} subcollection untouched.`);

  const stillExists = await groupRef.get();
  const membersAfter = await groupRef.collection('members').get();
  console.log(`Verify — parent doc exists: ${stillExists.exists} (expect false). members count: ${membersAfter.size} (expect ${membersSnap.size}, unchanged).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
