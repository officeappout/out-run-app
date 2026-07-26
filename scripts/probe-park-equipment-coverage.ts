/**
 * scripts/probe-park-equipment-coverage.ts — READ ONLY, throwaway (do not commit).
 *
 * Phase-א.0 data-coverage check: how many production parks carry real equipment,
 * and how many of those equipment ids reference a real gym_equipment master doc
 * (with an iconKey = a canonical gear stem the live cache/normalizeGearId resolves).
 * Admin SDK only — no app imports (tsx-safe).
 *
 * Usage: npx tsx scripts/probe-park-equipment-coverage.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  const [parksSnap, gymSnap] = await Promise.all([
    db.collection('parks').get(),
    db.collection('gym_equipment').get(),
  ]);

  const gymById = new Map<string, { name?: string; iconKey?: string }>();
  gymSnap.docs.forEach((d) => {
    const x = d.data() as any;
    gymById.set(d.id, { name: x.name, iconKey: x.iconKey });
  });

  let parksTotal = 0;
  let withEquip = 0;
  let primaryWithEquip = 0;
  const refCount = new Map<string, number>(); // equipmentId → # of park references

  parksSnap.docs.forEach((d) => {
    const p = d.data() as any;
    parksTotal++;
    const eq = Array.isArray(p.gymEquipment) ? p.gymEquipment : [];
    if (eq.length === 0) return;
    withEquip++;
    const sportTypes = Array.isArray(p.sportTypes) ? p.sportTypes : [];
    const isPrimary =
      sportTypes.some((t: string) => ['calisthenics', 'functional', 'crossfit'].includes(t)) ||
      p.category === 'gym_park';
    if (isPrimary) primaryWithEquip++;
    for (const e of eq) {
      const id = e?.equipmentId;
      if (id) refCount.set(id, (refCount.get(id) ?? 0) + 1);
    }
  });

  const distinct = Array.from(refCount.keys());
  const existMaster = distinct.filter((id) => gymById.has(id));
  const haveIcon = existMaster.filter((id) => !!gymById.get(id)!.iconKey);
  const totalRefs = Array.from(refCount.values()).reduce((a, b) => a + b, 0);
  const resolvableRefs = distinct
    .filter((id) => gymById.get(id)?.iconKey)
    .reduce((a, id) => a + refCount.get(id)!, 0);
  const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : '0.0');

  console.log('\n════════ PARK EQUIPMENT COVERAGE (prod) ════════');
  console.log(`parks total ...................... ${parksTotal}`);
  console.log(`gym_equipment master docs ........ ${gymSnap.size}`);
  console.log(`parks w/ non-empty gymEquipment .. ${withEquip}  (${pct(withEquip, parksTotal)}%)`);
  console.log(`  └ PRIMARY (gym_park/calisth.) .. ${primaryWithEquip}  ← the hybrid station pool`);
  console.log(`distinct equipmentIds referenced . ${distinct.length}`);
  console.log(`  └ reference a real master doc .. ${existMaster.length}  (${pct(existMaster.length, distinct.length)}%)`);
  console.log(`  └ ...with an iconKey (canonical) ${haveIcon.length}  (${pct(haveIcon.length, distinct.length)}%)`);
  console.log(`total equipment references ....... ${totalRefs}`);
  console.log(`  └ resolvable (have iconKey) .... ${resolvableRefs}  (${pct(resolvableRefs, totalRefs)}%)`);
  console.log('════════════════════════════════════════════════\n');
  if (haveIcon.length > 0) {
    console.log('sample resolvable equipment:', haveIcon.slice(0, 8).map((id) => `${gymById.get(id)!.name ?? '?'}→${gymById.get(id)!.iconKey}`).join(' · '));
  }
  if (existMaster.length < distinct.length) {
    const orphans = distinct.filter((id) => !gymById.has(id)).slice(0, 5);
    console.log('sample ORPHAN equipmentIds (no master doc):', orphans.join(', '));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
