/**
 * INVESTIGATION (24.09.2026, skill-gate tweak) — read-only.
 * Finds why 'hspu' resolves to 0 authored onboarding levels when the admin
 * panel shows ~15. Lists programs docs related to hspu/handstand push-up,
 * and visual_assessment_content categories with a level count near 15.
 *
 * Run: npx tsx scripts/_investigate-hspu-mismatch.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  console.log('--- programs docs mentioning hspu/handstand ---');
  const progSnap = await db.collection('programs').get();
  for (const doc of progSnap.docs) {
    const p = doc.data();
    const hay = `${p.slug ?? ''} ${p.name?.he ?? ''} ${p.name?.en ?? ''} ${p.movementPattern ?? ''} ${doc.id}`.toLowerCase();
    if (hay.includes('hspu') || hay.includes('handstand')) {
      console.log(`id=${doc.id} slug=${p.slug} movementPattern=${p.movementPattern} name.he=${p.name?.he} name.en=${p.name?.en} isMaster=${p.isMaster}`);
    }
  }

  console.log('\n--- visual_assessment_content: category counts (grouping) ---');
  const contentSnap = await db.collection('visual_assessment_content').get();
  const counts: Record<string, { total: number; onboarding: number; levels: Set<number> }> = {};
  for (const doc of contentSnap.docs) {
    const d = doc.data();
    const cat = d.category ?? '(none)';
    if (!counts[cat]) counts[cat] = { total: 0, onboarding: 0, levels: new Set() };
    counts[cat].total++;
    if (d.showInOnboarding === true) {
      counts[cat].onboarding++;
      if (typeof d.level === 'number' && d.level > 0) counts[cat].levels.add(d.level);
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1].onboarding - a[1].onboarding);
  for (const [cat, info] of entries) {
    if (info.onboarding >= 5) {
      console.log(`category=${cat}  total=${info.total}  showInOnboarding=${info.onboarding}  uniqueLevels=${info.levels.size}  levels=${[...info.levels].sort((a,b)=>a-b).join(',')}`);
    }
  }

  console.log('\n--- sample doc IDs for categories containing "hspu" or matching the ~15-count candidate ---');
  for (const doc of contentSnap.docs) {
    const d = doc.data();
    if (String(d.category ?? '').toLowerCase().includes('hspu')) {
      console.log(`docId=${doc.id} category=${d.category} level=${d.level} showInOnboarding=${d.showInOnboarding} exerciseId=${d.exerciseId}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
