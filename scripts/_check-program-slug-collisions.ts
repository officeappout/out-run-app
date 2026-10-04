/**
 * READ-ONLY. Checks the real `programs` collection for slug collisions —
 * two different program doc ids resolving to the SAME slug under the
 * canonical formula (`slug || movementPattern || name-derived`). Answers
 * a pre-flight question for the Stage 9 backfill script's rename/collapse
 * safety (program-identity audit §06). Zero writes. Not the Stage 9
 * script — a separate, one-time diagnostic.
 */
import * as dotenv from 'dotenv';
// This worktree has no local .env.local (secrets are per-checkout, not
// shared via git) — pointing at the main checkout's copy for this one
// read-only check rather than duplicating the secrets file.
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing.'); process.exit(1); }
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

function programSlug(p: admin.firestore.DocumentData): string {
  return p.slug || p.movementPattern || String(p.name ?? '').toLowerCase().replace(/[\s-]+/g, '_');
}

async function main() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('programs').get();
  console.log(`Scanned ${snap.size} program doc(s).\n`);

  const slugToIds = new Map<string, string[]>();
  for (const doc of snap.docs) {
    const slug = programSlug(doc.data());
    const list = slugToIds.get(slug) ?? [];
    list.push(doc.id);
    slugToIds.set(slug, list);
  }

  const collisions = Array.from(slugToIds.entries()).filter(([, ids]) => ids.length > 1);

  console.log(`Distinct slugs: ${slugToIds.size}`);
  console.log(`Collisions (slug shared by >1 program id): ${collisions.length}\n`);

  for (const [slug, ids] of collisions) {
    console.log(`SLUG COLLISION: "${slug}" ← [${ids.join(', ')}]`);
    for (const id of ids) {
      const d = snap.docs.find((doc) => doc.id === id)!.data();
      console.log(`    ${id}: slug=${d.slug ?? '(none)'} movementPattern=${d.movementPattern ?? '(none)'} name=${JSON.stringify(d.name)} isMaster=${!!d.isMaster}`);
    }
  }

  if (collisions.length === 0) {
    console.log('No collisions found — every program id resolves to a unique slug.');
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
