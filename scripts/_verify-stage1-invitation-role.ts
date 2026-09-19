import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-outrun-test';

async function main() {
  const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  await testEnv.clearFirestore();

  const BEFORE_FIX_UID = 'managerBeforeFix'; // role:'admin' present — old (buggy) shape
  const AFTER_FIX_UID = 'managerAfterFix';   // role absent — new (fixed) shape
  const VICTIM_UID = 'victimInAuthorityB';

  // Seed final-state docs directly (bypassing rules) — this isolates the
  // question that actually matters: given each doc SHAPE, what can that
  // user read/write? Not: does the write RPC itself succeed (that's a
  // separate, pre-existing rules-robustness issue, noted below).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', BEFORE_FIX_UID), {
      id: BEFORE_FIX_UID,
      role: 'admin', // the OLD unconditional write
      core: { name: 'Manager (pre-fix)', authorityId: 'authorityA', isApproved: true },
    });
    await setDoc(doc(db, 'users', AFTER_FIX_UID), {
      id: AFTER_FIX_UID,
      // no role field — the FIX
      core: { name: 'Manager (post-fix)', authorityId: 'authorityA', isApproved: true },
    });
    await setDoc(doc(db, 'users', VICTIM_UID), {
      id: VICTIM_UID,
      core: { name: 'Victim', authorityId: 'authorityB', isApproved: true },
    });
  });

  console.log('=== BEFORE FIX (role:"admin" present) — cross-tenant access ===');
  {
    const ctx = testEnv.authenticatedContext(BEFORE_FIX_UID, { email: 'manager-a@city-a.example' });
    const victimRef = doc(ctx.firestore(), 'users', VICTIM_UID);
    try {
      await assertSucceeds(getDoc(victimRef));
      console.log('  READ victim (authorityB): SUCCEEDED — confirms the vulnerability existed');
    } catch { console.log('  READ victim: denied (unexpected)'); }
    try {
      await assertSucceeds(updateDoc(victimRef, { 'core.name': 'tampered-by-before-fix-manager' }));
      console.log('  WRITE victim (authorityB): SUCCEEDED — confirms the vulnerability existed');
    } catch { console.log('  WRITE victim: denied (unexpected)'); }
  }

  console.log('');
  console.log('=== AFTER FIX (role field absent) — cross-tenant access ===');
  {
    const ctx = testEnv.authenticatedContext(AFTER_FIX_UID, { email: 'manager-a@city-a.example' });
    const victimRef = doc(ctx.firestore(), 'users', VICTIM_UID);
    try {
      await assertFails(getDoc(victimRef));
      console.log('  READ victim (authorityB): DENIED — fix works');
    } catch { console.log('  READ victim: SUCCEEDED — FIX DID NOT WORK'); }
    try {
      await assertFails(updateDoc(victimRef, { 'core.name': 'tampered-by-after-fix-manager' }));
      console.log('  WRITE victim (authorityB): DENIED — fix works');
    } catch { console.log('  WRITE victim: SUCCEEDED — FIX DID NOT WORK'); }
  }

  console.log('');
  console.log('=== AFTER FIX — sanity: can still read own doc, and workouts collection same pattern ===');
  {
    const ctx = testEnv.authenticatedContext(AFTER_FIX_UID, { email: 'manager-a@city-a.example' });
    const selfRef = doc(ctx.firestore(), 'users', AFTER_FIX_UID);
    try {
      await assertSucceeds(getDoc(selfRef));
      console.log('  READ own doc: succeeded (no regression)');
    } catch { console.log('  READ own doc: FAILED (regression!)'); }
  }

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'workouts', 'victimWorkout1'), {
      userId: VICTIM_UID, activityType: 'running', distance: 5000,
    });
  });
  {
    const beforeCtx = testEnv.authenticatedContext(BEFORE_FIX_UID, { email: 'manager-a@city-a.example' });
    const afterCtx = testEnv.authenticatedContext(AFTER_FIX_UID, { email: 'manager-a@city-a.example' });
    const beforeRef = doc(beforeCtx.firestore(), 'workouts', 'victimWorkout1');
    const afterRef = doc(afterCtx.firestore(), 'workouts', 'victimWorkout1');
    try { await assertSucceeds(getDoc(beforeRef)); console.log('  BEFORE FIX: read victim workout — SUCCEEDED (vulnerability confirmed on workouts too)'); }
    catch { console.log('  BEFORE FIX: read victim workout — denied (unexpected)'); }
    try { await assertFails(getDoc(afterRef)); console.log('  AFTER FIX: read victim workout — DENIED (fix works on workouts too)'); }
    catch { console.log('  AFTER FIX: read victim workout — SUCCEEDED (fix did not work)'); }
  }

  await testEnv.cleanup();
  process.exit(0);
}

main().catch(e => { console.error('SCRIPT FAILED:', e); process.exit(1); });
