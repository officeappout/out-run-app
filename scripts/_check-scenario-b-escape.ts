/**
 * VERIFICATION (24.09.2026, Slice B — minus-as-escape, Scenario B) — read-only.
 * front_lever + planche selected, front_lever escaped. Confirms planche
 * assesses normally, front_lever completely absent, no phantom.
 *
 * Run: npx tsx scripts/_check-scenario-b-escape.ts <uid>
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const uid = process.argv[2];
  if (!uid) { console.log('Usage: npx tsx scripts/_check-scenario-b-escape.ts <uid>'); return; }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { console.log('User doc does not exist:', uid); return; }
  const data = snap.data()!;
  const p = data.progression ?? {};

  console.log('=== Scenario B verification ===');
  console.log('currentProgramId:', data.currentProgramId ?? p.currentProgramId);
  console.log('tracks.planche:', JSON.stringify(p.tracks?.planche ?? null));
  console.log('tracks.pull:', JSON.stringify(p.tracks?.pull ?? null));
  console.log('tracks.core:', JSON.stringify(p.tracks?.core ?? null));
  console.log('tracks.front_lever:', JSON.stringify(p.tracks?.front_lever ?? null));
  console.log('skillFocusIds:', JSON.stringify(p.skillFocusIds ?? null));
  console.log('activePrograms:', JSON.stringify(p.activePrograms ?? null, null, 2));
  console.log('assignedResults:', JSON.stringify(data.assignedResults ?? null, null, 2));

  console.log('');
  console.log('=== Verdicts ===');
  console.log('planche.currentLevel === 5:', p.tracks?.planche?.currentLevel === 5 ? 'PASS' : `FAIL (got ${p.tracks?.planche?.currentLevel})`);
  console.log('pull.currentLevel === 4:', p.tracks?.pull?.currentLevel === 4 ? 'PASS' : `FAIL (got ${p.tracks?.pull?.currentLevel})`);
  console.log('front_lever ABSENT from tracks:', !p.tracks?.front_lever ? 'PASS' : `FAIL — front_lever track exists: ${JSON.stringify(p.tracks?.front_lever)}`);
  console.log('front_lever ABSENT from skillFocusIds:', !(p.skillFocusIds ?? []).includes('front_lever') ? 'PASS' : 'FAIL');
  const hasFrontLeverProgram = (p.activePrograms ?? []).some((ap: any) => ap.id === 'front_lever' || ap.templateId === 'front_lever');
  console.log('no front_lever entry in activePrograms:', !hasFrontLeverProgram ? 'PASS' : 'FAIL');
  const hasFrontLeverResult = (data.assignedResults ?? []).some((r: any) => r.programId === 'front_lever');
  console.log('no front_lever entry in assignedResults:', !hasFrontLeverResult ? 'PASS' : `FAIL: ${JSON.stringify(data.assignedResults)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
