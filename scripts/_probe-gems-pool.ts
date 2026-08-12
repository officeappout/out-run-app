import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const GEMS = ['3dIrpJQHp5QbimPVTZDk','4GVlUbVr5r9gNdUCKagI','4kww5BB13UkNaaAjZKS0','7mRRX85Hfx5sQ6oCl7YE','AdIAFteC2tmYWTPaaDtl','BcsFnuiLx1fZY2SIVhoC','GSPTjOAgRueyZZPkryqe','T1XghOTmtU74SeRRg9vb','ZYssXGqyPrIgvV1vXJcn','eEqv5jF3JkNduEM9Qgp7','f4ZbXHOaV5lRTC9JQPkk','nunGVGOEmOMnxiwh7jcu','v6DZcJA4vW0tjZTA0bUU'];
const he = (n: any) => (typeof n === 'string' ? n : n?.he ?? '?');
(async () => {
  for (const id of GEMS) {
    const d = (await db.collection('exercises').doc(id).get()).data() as any;
    if (!d) { console.log(`${id}: MISSING`); continue; }
    const tp = Array.isArray(d.targetPrograms) ? d.targetPrograms.map((t:any)=>`${t.programId}@L${t.level}`) : [];
    console.log(`${he(d.name).padEnd(28)} role=${d.exerciseRole ?? 'main'} sym=${d.symmetry ?? '—'} programIds=${JSON.stringify(d.programIds ?? [])} targetPrograms=${JSON.stringify(tp)} recLvl=${d.recommendedLevel ?? '—'}`);
  }
  process.exit(0);
})();
