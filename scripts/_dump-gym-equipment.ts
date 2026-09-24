import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const c = JSON.parse(raw!);
  admin.initializeApp({ credential: admin.credential.cert(c as any), projectId: c.project_id });
  const db = admin.firestore();

  const snap = await db.collection('gym_equipment').get();
  const rows: { name: string; mg: string[]; rl: string | number; flag: string }[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    const name = typeof data.name === 'string' ? data.name : (data.name?.he ?? d.id);
    const mg: string[] = Array.isArray(data.muscleGroups) ? data.muscleGroups : [];
    const rl = data.recommendedLevel ?? '—';

    let flag = '';
    if (mg.length === 0) flag = '⚠️ EMPTY';
    else if (mg.length === 1 && ['full_body', 'core', 'legs', 'cardio'].includes(mg[0])) flag = '⚠️ GENERIC-ONLY';
    else if (mg.includes('full_body') && mg.length <= 2) flag = '⚠️ GENERIC+1';

    rows.push({ name, mg, rl, flag });
  }

  // Flagged first, then alphabetical
  rows.sort((a, b) => {
    if (a.flag && !b.flag) return -1;
    if (!a.flag && b.flag) return 1;
    return a.name.localeCompare(b.name, 'he');
  });

  console.log(`\ngym_equipment — ${snap.size} docs\n`);
  console.log('שם המתקן'.padEnd(34) + '| muscleGroups[]'.padEnd(58) + '| רמה | הערה');
  console.log('─'.repeat(110));

  for (const r of rows) {
    const mgStr = r.mg.length ? r.mg.join(', ') : '(ריק)';
    const flagStr = r.flag ? r.flag : '';
    console.log(
      r.name.padEnd(34) +
      '| ' + mgStr.padEnd(56) +
      '| ' + String(r.rl).padStart(3) + '  ' +
      '| ' + flagStr
    );
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
