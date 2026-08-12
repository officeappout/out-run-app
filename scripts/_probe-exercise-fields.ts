import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const IDS = ['OKWZS86a0QZcsdVgtapI', '34JqI5TOOlCgFOW12311', '8vGnuoSH3MMkYKnxjg1P']; // rings-nordic, squat, band-squat
(async () => {
  for (const id of IDS) {
    const d = (await db.collection('exercises').doc(id).get()).data() as any;
    if (!d) { console.log(`${id}: MISSING`); continue; }
    console.log(`\n=== ${id} — ${d.name?.he ?? d.name} ===`);
    console.log('top-level keys:', Object.keys(d).sort().join(', '));
    for (const f of ['equipment', 'requiredUserGear', 'requiredGymEquipment', 'alternativeEquipmentRequirements', 'tags', 'movementGroup', 'mechanicalType', 'sweatLevel', 'symmetry', 'type', 'primaryMuscle']) {
      console.log(`  ${f}:`, JSON.stringify(d[f]));
    }
    const em = d.execution_methods ?? d.executionMethods;
    if (Array.isArray(em)) console.log('  execution_methods[].{location,equipment}:', JSON.stringify(em.map((m: any) => ({ location: m.location, equipment: m.equipment, requiredUserGear: m.requiredUserGear }))));
  }
  process.exit(0);
})();
