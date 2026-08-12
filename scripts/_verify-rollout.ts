import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
(async () => {
  const progs = await db.collection('programs').get();
  const idOf = (slug: string) => progs.docs.find(p => (p.data() as any).slug === slug || (p.data() as any).movementPattern === slug)?.id;
  for (const [slug, lvl] of [['pull',22],['core',4],['full_body',15],['push',25]] as [string,number][]) {
    const id = idOf(slug); if (!id) { console.log(`${slug}: not found`); continue; }
    const d = (await db.collection('programLevelSettings').doc(`${id}_level_${lvl}`).get()).data() as any;
    console.log(`${slug}@L${lvl}: preferredProtocols=${JSON.stringify(d?.preferredProtocols)} tabataProbability=${d?.tabataProbability}`);
  }
  process.exit(0);
})();
