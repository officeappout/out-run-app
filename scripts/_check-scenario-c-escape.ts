/**
 * VERIFICATION (24.09.2026, Slice B — minus-as-escape, Scenario C) — read-only.
 * front_lever + one_arm_pullup selected (both pull-deriving — substituted for
 * muscle_up, which is currently gated "בקרוב" and not selectable via the
 * picker). front_lever escaped. Confirms one_arm_pullup still drives pull
 * with no phantom, no duplicate pull slider/track.
 *
 * Run: npx tsx scripts/_check-scenario-c-escape.ts <uid>
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const uid = process.argv[2];
  if (!uid) { console.log('Usage: npx tsx scripts/_check-scenario-c-escape.ts <uid>'); return; }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { console.log('User doc does not exist:', uid); return; }
  const data = snap.data()!;
  const p = data.progression ?? {};

  console.log('=== Scenario C verification ===');
  console.log('currentProgramId:', data.currentProgramId ?? p.currentProgramId);
  console.log('tracks.one_arm_pullup:', JSON.stringify(p.tracks?.one_arm_pullup ?? null));
  console.log('tracks.pull:', JSON.stringify(p.tracks?.pull ?? null));
  console.log('tracks.core:', JSON.stringify(p.tracks?.core ?? null));
  console.log('tracks.front_lever:', JSON.stringify(p.tracks?.front_lever ?? null));
  console.log('activePrograms:', JSON.stringify(p.activePrograms ?? null, null, 2));
  console.log('assignedResults:', JSON.stringify(data.assignedResults ?? null, null, 2));

  console.log('');
  console.log('=== Verdicts ===');
  console.log('one_arm_pullup.currentLevel === 7:', p.tracks?.one_arm_pullup?.currentLevel === 7 ? 'PASS' : `FAIL (got ${p.tracks?.one_arm_pullup?.currentLevel})`);
  console.log('front_lever ABSENT from tracks:', !p.tracks?.front_lever ? 'PASS' : `FAIL: ${JSON.stringify(p.tracks?.front_lever)}`);
  const hasFrontLeverProgram = (p.activePrograms ?? []).some((ap: any) => ap.id === 'front_lever' || ap.templateId === 'front_lever');
  console.log('no front_lever entry in activePrograms:', !hasFrontLeverProgram ? 'PASS' : 'FAIL');
  const hasFrontLeverResult = (data.assignedResults ?? []).some((r: any) => r.programId === 'front_lever');
  console.log('no front_lever entry in assignedResults:', !hasFrontLeverResult ? 'PASS' : `FAIL: ${JSON.stringify(data.assignedResults)}`);
  // No duplicate/phantom literal 'pull' track from THIS write — pull.currentLevel
  // should either be absent (untouched) or match a PRIOR real value (from
  // scenarios A/B), never a NEW value derived from this run (since no literal
  // pull slider should have appeared at all).
  console.log('pull track (informational — should be untouched by this run, one_arm_pullup drives pull via the existing +9 formula at read time, not a literal track write here):', JSON.stringify(p.tracks?.pull ?? null));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
