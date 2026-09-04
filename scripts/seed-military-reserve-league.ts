/**
 * scripts/seed-military-reserve-league.ts — one-time seed, committed (writes
 * real production data, per the project convention that data-mutating
 * migration scripts stay committed — see backfill-unit-directory.ts).
 *
 * Phase 6a (docs/research/military-persona-unified-architecture.md §11):
 * creates the single, fixed community_groups doc that every self-declared
 * reservist auto-joins (functions/src/militaryReserveLeague.ts). Created
 * here — NOT via the normal createGroup() service/wizard — because that
 * path auto-locks any groupType:'military' doc (INSTITUTIONAL_GROUP_TYPES),
 * which contradicts the "no access codes" product decision for this league.
 *
 * isActive:true and minimumMembers:0 are set directly (not left for
 * onGroupMemberWrite to flip later): that trigger only activates a group
 * once membership crosses minimumMembers, and deleteZombieGroups deletes
 * isActive:false groups older than 24h — a slow first join would otherwise
 * risk the group being swept before anyone joins it.
 *
 * isPublic:false so it never appears in getPublicGroups()/getGroupsByScopeId()
 * discovery listings — membership is exclusively via the join CF, never
 * self-service browse-and-join.
 *
 * Idempotent: re-running is a no-op if the doc already exists (checked
 * before writing, not a blind overwrite — a real admin could have edited
 * name/description by then).
 *
 * SAFE BY DEFAULT: no flags = prints the planned doc, zero writes.
 * --confirm executes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { RESERVE_LEAGUE_GROUP_ID } from '../src/lib/military-reserve-league';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  const ref = db.collection('community_groups').doc(RESERVE_LEAGUE_GROUP_ID);
  const existing = await ref.get();
  if (existing.exists) {
    console.log(`✅ ${RESERVE_LEAGUE_GROUP_ID} already exists — nothing to do.`);
    console.log(JSON.stringify(existing.data(), null, 2));
    return;
  }

  const doc = {
    groupType: 'military',
    name: 'ליגת המילואים',
    description: 'ליגה ארצית פתוחה לכל מי שהצהיר שהוא/היא במילואים — בלי קוד גישה, בלי אימות.',
    category: 'other',
    source: 'authority',
    isOfficial: true,
    isLocked: false,
    isPublic: false,
    allowJoinRequests: false,
    isActive: true,
    minimumMembers: 0,
    currentParticipants: 0,
    memberCount: 0,
    createdBy: 'system',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  console.log(confirm ? 'Creating:' : 'DRY RUN — would create (pass --confirm to execute):');
  console.log(JSON.stringify(doc, null, 2));
  if (!confirm) return;

  await ref.set(doc);
  console.log(`✅ created community_groups/${RESERVE_LEAGUE_GROUP_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
