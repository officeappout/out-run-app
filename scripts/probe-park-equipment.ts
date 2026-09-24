/**
 * scripts/probe-park-equipment.ts — READ ONLY. For a park (by name substring),
 * dump its gymEquipment raw ids + the canonical gear ids after normalize, so we can
 * see whether the equipment flows to the hybrid station or falls through (machines).
 * Usage: npx tsx scripts/probe-park-equipment.ts "מבצע קדש"
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react');

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const needle = process.argv[2] ?? 'מבצע קדש';

  const parks = (await db.collection('parks').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const matches = parks.filter((p) => String(p.name ?? '').includes(needle));
  if (!matches.length) { console.log(`no park name contains "${needle}"`); return; }

  const gymEquip = (await db.collection('gym_equipment').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const gymById = new Map(gymEquip.map((g) => [g.id, g]));
  const { seedEquipmentCaches, normalizeGearIds } = await import('../src/features/workout-engine/shared/utils/gear-mapping.utils');
  seedEquipmentCaches([], gymEquip as any);

  for (const p of matches) {
    const raw = (p.gymEquipment ?? []).map((e: any) => e.equipmentId).filter(Boolean);
    const canonical = Array.from(new Set(normalizeGearIds(raw)));
    console.log(`\n══ "${p.name}" (${p.id}) · ${raw.length} equipment ══`);
    console.log(`  RAW ids     : ${raw.join(', ') || '(none)'}`);
    console.log(`  CANONICAL   : ${canonical.join(', ') || '(none)'}`);
    console.log(`  per-item:`);
    for (const e of (p.gymEquipment ?? [])) {
      const g = gymById.get(e.equipmentId);
      const norm = normalizeGearIds([e.equipmentId]);
      const translated = norm.length > 0 && norm[0] !== String(e.equipmentId).toLowerCase();
      console.log(`    ${e.equipmentId}  name="${g?.name ?? '?'}" type=${g?.type ?? '?'} → ${norm.join('/')} ${translated ? '✓' : '✗(fell through / machine?)'}`);
    }
    const usable = canonical.filter((c) => /^[a-z][a-z_]+$/.test(c) && c.length < 20);
    console.log(`  → station availableEquipment = [${usable.join(', ')}]  ${usable.length ? 'REAL ✓' : 'EMPTY → bodyweight'}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
