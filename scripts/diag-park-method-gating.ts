/**
 * scripts/diag-park-method-gating.ts — READ ONLY.
 *
 * Reproduces the ContextualEngine.findMatchingMethod PARK branch for specific
 * exercises, using the REAL gear helpers (normalizeGearId / satisfiesGearRequirement
 * / isGearOptional / ESSENTIAL_PARK_GEAR), seeded from live Firestore gear docs.
 *
 * Answers the A/B question for the "park exercise shows a home method" bug:
 *   A) park method exists but is BLOCKED (missing gear) → root = park equipment
 *      mapping / inventory (NOT preferMedia).
 *   B) park method PASSES gating → if a home method is still shown, root = preferMedia.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import {
  normalizeGearId,
  isGearOptional,
  satisfiesGearRequirement,
  seedEquipmentCaches,
  ESSENTIAL_PARK_GEAR,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';

const TARGET_NAME_SUBSTRINGS = ['לאנג', 'פסודו', 'פלאנץ']; // front lunge · pseudo-planche lean

// Mirror of ContextualEngine.findMatchingMethod park-branch constants/helpers.
const SURFACE_GEAR_AT_PARK = new Set(['mat', 'yoga_mat', 'wall', 'chair']);

function collectMethodGear(m: any): string[] {
  const raw: string[] = [];
  if (m.equipmentIds?.length) raw.push(...m.equipmentIds);
  else if (m.equipmentId) raw.push(m.equipmentId);
  if (m.gearIds?.length) raw.push(...m.gearIds);
  else if (m.gearId) raw.push(m.gearId);
  return raw.filter(Boolean).map(normalizeGearId);
}
function hasMedia(m: any): boolean {
  return !!(m?.media?.mainVideoUrl || m?.media?.imageUrl ||
    m?.media?.previewVideo?.he?.videoId || m?.media?.previewVideo?.en?.videoId);
}
function requiredGear(m: any): string[] {
  return collectMethodGear(m).filter(
    id => id !== 'bodyweight' && id !== 'none' && !SURFACE_GEAR_AT_PARK.has(id) && !isGearOptional(id),
  );
}
// Exact mirror of the POST-ec59d74 preferMedia (Bunny-aware + exact-location).
function preferMedia(list: any[], exactLocation?: string): any {
  if (!list.length) return null;
  const exact = exactLocation ? list.filter(m => m.location === exactLocation) : [];
  return exact.find(hasMedia) ?? exact[0] ?? list.find(hasMedia) ?? list[0] ?? null;
}

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  // Seed the real caches with live gear/gym docs so normalizeGearId resolves
  // Firestore IDs exactly like the engine does at runtime.
  const [gearSnap, gymSnap] = await Promise.all([
    db.collection('gear_definitions').get(),
    db.collection('gym_equipment').get(),
  ]);
  const gearDefs = gearSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const gymEquip = gymSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  seedEquipmentCaches(gearDefs as any, gymEquip as any);
  console.log(`seeded caches: ${gearDefs.length} gear_definitions, ${gymEquip.length} gym_equipment\n`);

  // Two park inventories to evaluate against:
  //   • ESSENTIAL — the catastrophic-fallback baseline the engine injects when a
  //     park has no resolved inventory (what most sparse parks effectively get).
  const essential = [...ESSENTIAL_PARK_GEAR];

  const exSnap = await db.collection('exercises').get();
  const targets = exSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(e => {
      const he = e?.name?.he ?? e?.name ?? '';
      return TARGET_NAME_SUBSTRINGS.some(s => typeof he === 'string' && he.includes(s));
    });

  console.log(`matched ${targets.length} exercise(s): ${targets.map(t => t?.name?.he ?? t.id).join(' | ')}\n`);

  for (const ex of targets) {
    const name = ex?.name?.he ?? ex?.name ?? ex.id;
    const methods: any[] = ex.execution_methods ?? ex.executionMethods ?? [];
    const parkCandidates = methods.filter(m => m.location === 'park' || m.locationMapping?.includes('park'));

    console.log('══════════════════════════════════════════════════════════════');
    console.log(`▶ ${name}  (id=${ex.id})`);
    console.log('  ALL methods:');
    for (const m of methods) {
      console.log(`    - "${m.methodName ?? '?'}"  location=${m.location ?? '?'}  mapping=${JSON.stringify(m.locationMapping ?? null)}  gear=${JSON.stringify(collectMethodGear(m))}  media=${hasMedia(m)}`);
    }

    if (parkCandidates.length === 0) {
      console.log('  ⛔ NO park-tagged method → engine falls back to bodyweight/home media.');
      console.log('     ROOT: data gap (add a park method), not preferMedia.\n');
      continue;
    }

    console.log(`\n  PARK methods gating (inventory = ESSENTIAL_PARK_GEAR = ${JSON.stringify(essential)}):`);
    let anyPassed = false;
    for (const m of parkCandidates) {
      const req = requiredGear(m);
      const missing = req.filter(reqId => !satisfiesGearRequirement(reqId, essential.map(normalizeGearId)));
      const passed = missing.length === 0;
      if (passed) anyPassed = true;
      console.log(`    - "${m.methodName ?? '?'}"  requiredGear=${JSON.stringify(req)}  missing=${JSON.stringify(missing)}  → ${passed ? '✅ PASSED' : '❌ BLOCKED'}  media=${hasMedia(m)}`);
    }

    // POST-FIX selection: what the current (ec59d74) engine returns for park.
    const gated = parkCandidates.filter(m => requiredGear(m).every(r => satisfiesGearRequirement(r, essential.map(normalizeGearId))));
    const selected = gated.length > 0 ? preferMedia(gated, 'park') : null;

    console.log('\n  ⇒ VERDICT:');
    if (!anyPassed) {
      console.log('     CASE A — all park methods BLOCKED at a baseline park.');
      console.log('     ROOT = park equipment mapping/inventory (the missingGear above), NOT preferMedia.');
      console.log('     (If the user\'s actual park stocks that gear, it would pass — confirm the park inventory.)');
    } else {
      console.log('     CASE B — a park method PASSES gating.');
      console.log(`     POST-ec59d74 preferMedia(gated,'park') SELECTS: "${selected?.methodName ?? '?'}"  location=${selected?.location ?? '?'}  media=${hasMedia(selected)}`);
      console.log(selected?.location === 'park'
        ? '     ✅ FIXED — engine now selects the PARK method (Bunny). No home-in-park.'
        : '     ⚠️ still not park — investigate selection further.');
    }
    console.log('');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
