#!/usr/bin/env npx tsx
/**
 * scripts/cleanup-authorities-dedup.ts
 *
 * One-time authorities cleanup, approved by David 16.08.2026:
 *   Phase 1: delete 7 confirmed-safe stale/duplicate docs
 *   Phase 2: migrate the 1 user referencing the Kiryat Ata duplicate to the
 *            canonical doc, then delete the duplicate
 *   Phase 3: resolve 5 ambiguous duplicate pairs (keep the CBS-registry doc
 *            with authorityCode+district, delete the empty hand-seed doc)
 *   Phase 4: for any of the 9 deduped cities that have static subLocations
 *            and now show 0 children on the canonical doc, seed them
 *            create-only (same Phase-A template)
 *
 * SAFETY: every delete re-verifies isActiveClient===false, 0 children,
 * 0 user refs IMMEDIATELY before deleting (fresh reads, not the earlier
 * investigation's cached numbers). Any doc that fails re-verification is
 * ABORTED (not deleted) and reported — the run continues to the next item,
 * except a paying client (isActiveClient===true) anywhere HALTS the whole
 * script immediately. One .doc(id).delete() at a time, never a batch.
 * The Kiryat Ata user migration touches ONLY core.authorityId /
 * core.neighborhoodId on that one user doc, nothing else.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/cleanup-authorities-dedup.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/cleanup-authorities-dedup.ts
 */

import * as admin from 'firebase-admin';
import { ISRAELI_LOCATIONS } from '../src/lib/data/israel-locations';
import { DEFAULT_COORDINATES } from '../src/features/user/onboarding/components/steps/UnifiedLocation/location-constants';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) { console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }
const key = JSON.parse(rawKey);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const P = DRY_RUN ? 'WOULD ' : '';

let halted = false;
const deletedLog: string[] = [];
const abortedLog: string[] = [];

async function verifyAndDelete(id: string, label: string): Promise<'deleted' | 'aborted' | 'halted'> {
  if (halted) return 'halted';
  const snap = await db.collection('authorities').doc(id).get();
  if (!snap.exists) {
    console.log(`  ❌ ABORT [${label}] (${id}): doc no longer exists`);
    abortedLog.push(`${label} (${id}): doc not found`);
    return 'aborted';
  }
  const data = snap.data()!;
  if (data.isActiveClient === true) {
    console.log(`  🛑 HALT — [${label}] (${id}) is isActiveClient=true (PAYING CLIENT). Stopping the entire run.`);
    halted = true;
    return 'halted';
  }
  const childrenSnap = await db.collection('authorities').where('parentAuthorityId', '==', id).get();
  const usersA = await db.collection('users').where('core.authorityId', '==', id).get();
  const usersN = await db.collection('users').where('core.neighborhoodId', '==', id).get();
  const refCount = usersA.size + usersN.size;

  if (childrenSnap.size > 0 || refCount > 0) {
    console.log(`  ❌ ABORT [${label}] (${id}): children=${childrenSnap.size} userRefs=${refCount} (expected 0/0)`);
    abortedLog.push(`${label} (${id}): children=${childrenSnap.size} userRefs=${refCount}`);
    return 'aborted';
  }

  console.log(`  ${P}DELETE [${label}] (${id}) — name="${data.name}" isActiveClient=false children=0 userRefs=0`);
  if (!DRY_RUN) await db.collection('authorities').doc(id).delete();
  deletedLog.push(`${label} (${id}) "${data.name}"`);
  return 'deleted';
}

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Authorities cleanup: dedup + delete ──\n`);

  // ═══ PHASE 1: 7 safe deletes ═══
  console.log('═══ PHASE 1: safe deletes (stale children + empty duplicates) ═══');
  const PHASE1: [string, string][] = [
    ['UEIy3tn7KzkuYOaNkcPt', 'Tzur Hadassah (stale child, Mateh Yehuda)'],
    ['ZHOjjtBiXRyRklZcyTDd', 'Kibbutz Mishmar HaEmek (stale child, Emek Yizrael)'],
    ['46AAGGIvb7EDrHGxB0aY', 'Shoham (stale child, Chevel Modiin)'],
    ['ZSy2MtnX92ZxA0pFST4x', 'Herzliya empty duplicate'],
    ['HmabG1kdRgrMsHdpHkOj', 'Kiryat Gat empty duplicate'],
    ['GMxlkX78T7wFhPytEFKf', 'Nahariya empty duplicate'],
    ['F5ZgNZBznPJXjrRaIsdm', 'Kiryat Yam leftover duplicate'],
  ];
  for (const [id, label] of PHASE1) {
    if (halted) break;
    await verifyAndDelete(id, label);
  }

  // ═══ PHASE 2: Kiryat Ata — migrate then delete ═══
  console.log('\n═══ PHASE 2: Kiryat Ata — migrate user ref, then delete duplicate ═══');
  const KIRYAT_ATA_DUP = 'XBKcBcOJameV06NR7DUU';
  const KIRYAT_ATA_CANONICAL = 'Sy2VFerWiFXNuddMkVld';
  if (!halted) {
    const usersA = await db.collection('users').where('core.authorityId', '==', KIRYAT_ATA_DUP).get();
    const usersN = await db.collection('users').where('core.neighborhoodId', '==', KIRYAT_ATA_DUP).get();
    console.log(`  Found ${usersA.size} user(s) with core.authorityId=dup, ${usersN.size} with core.neighborhoodId=dup`);

    for (const doc of usersA.docs) {
      console.log(`  ${P}MIGRATE user ${doc.id}: core.authorityId ${KIRYAT_ATA_DUP} → ${KIRYAT_ATA_CANONICAL}`);
      if (!DRY_RUN) await db.collection('users').doc(doc.id).update({ 'core.authorityId': KIRYAT_ATA_CANONICAL });
    }
    for (const doc of usersN.docs) {
      console.log(`  ${P}MIGRATE user ${doc.id}: core.neighborhoodId ${KIRYAT_ATA_DUP} → ${KIRYAT_ATA_CANONICAL}`);
      if (!DRY_RUN) await db.collection('users').doc(doc.id).update({ 'core.neighborhoodId': KIRYAT_ATA_CANONICAL });
    }

    if (DRY_RUN) {
      console.log('  (dry-run: skipping post-migration re-verify + delete of the duplicate — would happen after real migration)');
    } else {
      await verifyAndDelete(KIRYAT_ATA_DUP, 'Kiryat Ata duplicate (post-migration)');
    }
  }

  // ═══ PHASE 3: 5 ambiguous pairs — keep CBS-coded, delete empty hand-seed ═══
  console.log('\n═══ PHASE 3: 5 ambiguous duplicate pairs ═══');
  const PHASE3: [string, string, string, string][] = [
    // [keepId, keepName, deleteId, deleteName]
    ['6pmGh2kqYOE2xHZKfkis', 'באקה אל-גרביה (CBS, code=6000)', '2JMx4AiIEVd77nlFKtFr', 'באקה אל-גרבייה (hand-seed)'],
    ['NbM6XnnDazHDVYvHo1Ex', "סח'נין (CBS, code=7500)", 'KasrflPQ70BA3YYNxqVG', 'סח׳נין (hand-seed)'],
    ['6H005gU90gsDwEomslWc', 'קריית ביאליק (CBS, code=9500)', 'cBfrdTQxAMxSfgKhsc2J', 'קרית ביאליק (hand-seed)'],
    ['7VbPlJJWQEbNLNoC2UHs', 'קריית מוצקין (CBS, code=8200)', 'oPGKpVRCPdqz6wSpn7oG', 'קרית מוצקין (hand-seed)'],
    ['5cE8NoMQT4OS4CtNGdJz', 'קריית שמונה (CBS, code=2800)', 'hQdduMiwMgrIPbHtDrL3', 'קרית שמונה (hand-seed)'],
  ];
  for (const [keepId, keepLabel, deleteId, deleteLabel] of PHASE3) {
    if (halted) break;
    console.log(`  KEEP: ${keepLabel} (${keepId})  |  DELETE candidate: ${deleteLabel} (${deleteId})`);
    await verifyAndDelete(deleteId, deleteLabel);
  }

  // ═══ PHASE 4: reseed the 9 deduped cities where canonical now shows 0 children ═══
  console.log('\n═══ PHASE 4: reseed check for the 9 deduped cities ═══');
  const NINE_CANONICAL: [string, string][] = [
    ['הרצליה', '1O54R5EOghNYylTEhxJa'],
    ['קרית גת', 'lfdFHzo43oS7GN8qRHpM'],
    ['נהריה', 'k3dBx2Ml6xhiH5mIO6e1'],
    ['קרית אתא', KIRYAT_ATA_CANONICAL],
    ['באקה אל-גרביה', '6pmGh2kqYOE2xHZKfkis'],
    ["סח'נין", 'NbM6XnnDazHDVYvHo1Ex'],
    ['קריית ביאליק', '6H005gU90gsDwEomslWc'],
    ['קריית מוצקין', '7VbPlJJWQEbNLNoC2UHs'],
    ['קריית שמונה', '5cE8NoMQT4OS4CtNGdJz'],
  ];

  let totalSeeded = 0;
  for (const [name, parentId] of NINE_CANONICAL) {
    if (halted) break;
    const loc = ISRAELI_LOCATIONS.find(l => l.name === name);
    const childrenSnap = await db.collection('authorities').where('parentAuthorityId', '==', parentId).get();
    const childCount = childrenSnap.size;

    if (!loc || !loc.subLocations || loc.subLocations.length === 0) {
      console.log(`  ${name}: no static subLocations — skip (nothing to seed)`);
      continue;
    }
    if (childCount > 0) {
      console.log(`  ${name}: already has ${childCount} children (partial/legacy, not part of this task) — skip`);
      continue;
    }

    console.log(`  ${name}: 0 children, static has ${loc.subLocations.length} subLocations — seeding`);
    const existingNames = new Set(childrenSnap.docs.map(d => d.data().name));
    let created = 0;
    for (const sub of loc.subLocations) {
      if (existingNames.has(sub.name)) continue;
      const coords = DEFAULT_COORDINATES[sub.id];
      if (!coords) { console.error(`    ❌ no coordinates for ${sub.id} (${sub.name}) — skipping`); continue; }
      const doc: Record<string, unknown> = {
        name: sub.name, type: sub.type, parentAuthorityId: parentId,
        logoUrl: null, managerIds: [] as string[], userCount: 0,
        status: 'inactive' as const, isActiveClient: false,
        coordinates: { lat: coords.lat, lng: coords.lng },
        pipelineStatus: 'draft' as const, unitCount: 0, hierarchyLevel: 2, vertical: 'municipal' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (DRY_RUN) {
        console.log(`    WOULD CREATE: ${sub.name} @ ${coords.lat},${coords.lng}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`    ✓ CREATED: ${sub.name} → ${ref.id}`);
      }
      created++;
    }
    totalSeeded += created;
    console.log(`    ${P}created ${created}/${loc.subLocations.length} for ${name}`);
  }

  console.log('\n═══ SUMMARY ═══');
  console.log(`${DRY_RUN ? 'Would delete' : 'Deleted'}: ${deletedLog.length}`);
  deletedLog.forEach(d => console.log('   -', d));
  console.log(`Aborted (failed re-verification): ${abortedLog.length}`);
  abortedLog.forEach(a => console.log('   -', a));
  console.log(`Halted early: ${halted}`);
  console.log(`${DRY_RUN ? 'Would seed' : 'Seeded'} total (Phase 4): ${totalSeeded}`);
}

main().catch((err) => { console.error('💥', err); process.exit(1); });
