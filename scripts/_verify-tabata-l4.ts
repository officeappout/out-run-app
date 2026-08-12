import * as admin from 'firebase-admin';
import { buildTabataBlock } from '../src/features/workout-engine/logic/protocols/tabata.block';
import type { Exercise } from '../src/features/content/exercises/core/exercise.types';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const GEMS = new Set(['3dIrpJQHp5QbimPVTZDk','4GVlUbVr5r9gNdUCKagI','4kww5BB13UkNaaAjZKS0','7mRRX85Hfx5sQ6oCl7YE','AdIAFteC2tmYWTPaaDtl','BcsFnuiLx1fZY2SIVhoC','GSPTjOAgRueyZZPkryqe','T1XghOTmtU74SeRRg9vb','ZYssXGqyPrIgvV1vXJcn','eEqv5jF3JkNduEM9Qgp7','f4ZbXHOaV5lRTC9JQPkk','nunGVGOEmOMnxiwh7jcu','v6DZcJA4vW0tjZTA0bUU']);
const he = (n: any) => (typeof n === 'string' ? n : n?.he ?? '?');

(async () => {
  const snap = await db.collection('exercises').get();
  const pool: Exercise[] = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as Exercise)
    .filter((e) => (e.tags ?? []).includes('hiit_friendly'));
  console.log(`\nLoaded ${pool.length} hiit_friendly exercises. Simulating an L4 user, 40 blocks:\n`);

  let formed = 0, withGem = 0;
  const freq = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < 40; i++) {
    const target: any[] = [];
    const block = buildTabataBlock('tabata', target, { tabataPool: pool, userLevel: 4 });
    if (!block) continue;
    formed++;
    const members = block.exerciseIds;
    if (members.some((id) => GEMS.has(id))) withGem++;
    for (const id of members) freq.set(id, (freq.get(id) ?? 0) + 1);
    if (samples.length < 6) {
      const names = target.filter((e) => e.protocolBlock === 'tabata').map((e) => `${he(e.exercise.name)}${GEMS.has(e.exercise.id) ? '★' : ''}`);
      samples.push(`  [${names.join(', ')}]`);
    }
  }

  console.log(`Blocks formed: ${formed}/40   ·   blocks containing ≥1 gem (★): ${withGem}/${formed}\n`);
  console.log('Sample blocks (★ = one of the 13 orphan gems):');
  samples.forEach((s) => console.log(s));
  const gemsSeen = [...freq.entries()].filter(([id]) => GEMS.has(id));
  console.log(`\nDistinct gems that appeared: ${gemsSeen.length}/13`);
  process.exit(0);
})();
