/**
 * VERIFICATION (24.09.2026, Slice B — minus-as-escape, Scenario A) — read-only.
 * Confirms the escaped front_lever produced NO phantom derivation and the
 * real pull assessment (level 6) landed correctly.
 *
 * Run: npx tsx scripts/_check-scenario-a-escape.ts <uid>
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const uid = process.argv[2];
  if (!uid) { console.log('Usage: npx tsx scripts/_check-scenario-a-escape.ts <uid>'); return; }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { console.log('User doc does not exist:', uid); return; }
  const data = snap.data()!;
  const p = data.progression ?? {};

  console.log('=== Scenario A verification ===');
  console.log('currentProgramId:', data.currentProgramId ?? p.currentProgramId ?? '(not found at top or progression level)');
  console.log('tracks.pull:', JSON.stringify(p.tracks?.pull ?? null));
  console.log('tracks.front_lever:', JSON.stringify(p.tracks?.front_lever ?? null));
  console.log('domains.pull:', JSON.stringify(p.domains?.pull ?? null));
  console.log('domains.front_lever:', JSON.stringify(p.domains?.front_lever ?? null));
  console.log('domains.legs:', JSON.stringify(p.domains?.legs ?? null));
  console.log('domains.core:', JSON.stringify(p.domains?.core ?? null));
  console.log('skillFocusIds:', JSON.stringify(p.skillFocusIds ?? null));
  console.log('activePrograms:', JSON.stringify(p.activePrograms ?? null, null, 2));
  console.log('assignedResults:', JSON.stringify(data.assignedResults ?? null, null, 2));

  console.log('');
  console.log('=== Verdicts ===');
  console.log('pull.currentLevel === 6 (real, not phantom 15):', p.tracks?.pull?.currentLevel === 6 ? 'PASS' : `FAIL (got ${p.tracks?.pull?.currentLevel})`);
  console.log('front_lever ABSENT from tracks:', !p.tracks?.front_lever ? 'PASS' : 'FAIL — front_lever track exists');
  console.log('front_lever ABSENT from skillFocusIds:', !(p.skillFocusIds ?? []).includes('front_lever') ? 'PASS' : 'FAIL');
  console.log('currentProgramId is not front_lever:', (data.currentProgramId ?? p.currentProgramId) !== 'front_lever' ? 'PASS' : 'FAIL');
  const hasFrontLeverProgram = (p.activePrograms ?? []).some((ap: any) => ap.id === 'front_lever' || ap.templateId === 'front_lever');
  console.log('no front_lever entry in activePrograms:', !hasFrontLeverProgram ? 'PASS' : 'FAIL');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
