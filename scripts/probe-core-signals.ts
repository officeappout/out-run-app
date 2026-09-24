/**
 * scripts/probe-core-signals.ts — READ ONLY. Resolves why core_candidate=27 but
 * ~180 exercises carry a core "extra" signal. Maps targetPrograms doc-IDs to the
 * `programs` collection, tallies legacy programIds slugs, and splits the near-miss set.
 * NO writes. Usage: npx tsx scripts/probe-core-signals.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) { const c = JSON.parse(raw); admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return; }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'appout-1' });
}
const CORE_MUSCLES = new Set(['abs', 'core', 'obliques']);
const toArr = (v: any): any[] => (Array.isArray(v) ? v : []);

async function main() {
  initFirebase();
  const db = admin.firestore();

  // ── programs collection: id -> {slug, name, movementPattern} ──
  const progSnap = await db.collection('programs').get();
  const prog = new Map<string, any>();
  for (const d of progSnap.docs) {
    const p = d.data() as any;
    prog.set(d.id, { slug: p.slug ?? '', name: p.name?.he ?? p.name?.en ?? p.name ?? '', mp: p.movementPattern ?? p.movement_pattern ?? '' });
  }
  console.log(`programs collection: ${progSnap.size} docs`);
  // which program docs are "core"?
  const coreProgIds = new Set<string>();
  console.log('\n── programs where slug/movementPattern relates to core ──');
  for (const [id, v] of prog) {
    if (v.slug === 'core' || v.mp === 'core' || /core|בטן|ליבה|abs/i.test(String(v.name)) || /core/i.test(String(v.slug))) {
      coreProgIds.add(id);
      console.log(`  ${id}  slug=${v.slug}  mp=${v.mp}  name=${v.name}`);
    }
  }
  if (coreProgIds.size === 0) console.log('  (none found)');

  // ── exercises pass ──
  const exSnap = await db.collection('exercises').get();
  const legacySlug = new Map<string, number>();
  let tpToCoreProg = 0;         // exercises whose targetPrograms references a core program doc
  let legacyCore = 0;           // legacy programIds contains 'core' slug
  let secondaryCore = 0;        // secondaryMuscles has abs/core/obliques
  let primaryCore = 0;          // primaryMuscle is a core muscle
  let mvGroupCore = 0;          // movementGroup === 'core'
  const distinctTpProgIds = new Map<string, number>();

  const unionCore = new Set<string>(); // any-signal core set
  const tpCoreExamples: string[] = [];

  for (const doc of exSnap.docs) {
    const ex = doc.data() as any;
    const programIds = toArr(ex.programIds).map(String);
    const targetPrograms = toArr(ex.targetPrograms);
    const secondary = toArr(ex.secondaryMuscles).map(String);
    const primaryMuscle = String(ex.primaryMuscle ?? '');
    const movementGroup = String(ex.movementGroup ?? '');

    for (const s of programIds) legacySlug.set(s, (legacySlug.get(s) ?? 0) + 1);
    for (const t of targetPrograms) {
      const pid = String(t?.programId ?? '');
      if (pid) distinctTpProgIds.set(pid, (distinctTpProgIds.get(pid) ?? 0) + 1);
    }

    const tpCore = targetPrograms.some((t: any) => coreProgIds.has(String(t?.programId ?? '')));
    const lCore = programIds.includes('core');
    const sCore = secondary.some((s) => CORE_MUSCLES.has(s));
    const pCore = CORE_MUSCLES.has(primaryMuscle);
    const mCore = movementGroup === 'core';

    if (tpCore) { tpToCoreProg++; if (tpCoreExamples.length < 12) tpCoreExamples.push(`${ex.name?.he ?? doc.id}`); }
    if (lCore) legacyCore++;
    if (sCore) secondaryCore++;
    if (pCore) primaryCore++;
    if (mCore) mvGroupCore++;

    if (tpCore || lCore || sCore || pCore || mCore) unionCore.add(doc.id);
  }

  console.log('\n── legacy programIds slug distribution (top 20) ──');
  [...legacySlug.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([s, c]) => console.log(`  ${String(c).padStart(4)}  ${s}`));

  console.log('\n── targetPrograms programId → program doc (top 15 by usage) ──');
  [...distinctTpProgIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([pid, c]) => {
    const v = prog.get(pid);
    const isCore = coreProgIds.has(pid) ? '  ⟵ CORE' : '';
    console.log(`  ${String(c).padStart(4)}  ${pid}  → ${v ? `slug=${v.slug} mp=${v.mp} name=${v.name}` : '(no program doc)'}${isCore}`);
  });

  console.log('\n── core signal tallies (each condition, overlapping) ──');
  console.log(`  primaryMuscle ∈ {abs,core,obliques}:        ${primaryCore}`);
  console.log(`  movementGroup = 'core':                     ${mvGroupCore}`);
  console.log(`  targetPrograms → a CORE program doc:        ${tpToCoreProg}`);
  console.log(`  legacy programIds contains 'core':          ${legacyCore}`);
  console.log(`  secondaryMuscles has abs/core/obliques:     ${secondaryCore}`);
  console.log(`  ──────────────────────────────────────────`);
  console.log(`  UNION (any core signal):                    ${unionCore.size}`);
  console.log(`  STRICT rule (primary|mvGroup|tp='core'|mg): 27 (from inventory)`);

  console.log('\n── examples: exercises whose targetPrograms → a CORE program doc ──');
  tpCoreExamples.forEach((n) => console.log(`  • ${n}`));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
