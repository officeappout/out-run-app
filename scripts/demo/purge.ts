/**
 * scripts/demo/purge.ts — deletes the whole demo world.
 *
 * DRY RUN BY DEFAULT: lists every document that would be deleted (and every viewer doc
 * that would only be cleaned), writes nothing.
 *
 *   npx tsx scripts/demo/purge.ts --project <id> [--emulator]                              # dry run
 *   npx tsx scripts/demo/purge.ts --project <id> [--emulator] --confirm "מחק את עולם הדמו"  # delete
 *
 * --summary prints counts per collection instead of every path.
 */
import { PURGE_CONFIRM_PHRASE } from './lib/config';
import { executePurge, planPurge, summarizePlan } from './lib/purge-plan';
import { closeDemoTarget, describeDemoTarget, loadEnvLocal, openDemoTarget, parseDemoArgs, requireConfirm } from './lib/target';

async function main() {
  const args = parseDemoArgs(process.argv.slice(2));
  await loadEnvLocal();
  const real = args.confirm !== null;
  if (real) requireConfirm(args, PURGE_CONFIRM_PHRASE, 'מחיקת עולם הדמו');
  const t = await openDemoTarget(args);
  console.log(`יעד: ${describeDemoTarget(t)}${real ? '' : ' — הרצה יבשה, לא נמחק כלום'}`);
  try {
    const plan = await planPurge(t.db);
    if (!args.flags.has('--summary')) plan.deletes.forEach((p) => console.log(`  מחיקה  ${p}`));
    plan.updates.forEach((u) => console.log(`  ניקוי  ${u.path} (${u.describe})`));
    if (plan.testerUids.length) console.log(`  כניסה  ${plan.testerUids.length} חשבונות Auth של בודקים (${plan.testerUids.join(', ')})`);
    console.log(`\n${plan.uids.length} משתמשי דמו · ${plan.deletes.length} מסמכים למחיקה · ${plan.updates.length} מסמכי צופים לניקוי`);
    console.table(summarizePlan(plan));
    if (plan.problems.length) {
      console.error(`\nעצירה — ${plan.problems.length} בעיות, לא נמחק כלום:\n${plan.problems.join('\n')}`);
      process.exitCode = 2;
      return;
    }
    if (!real) {
      console.log(`\nכדי למחוק באמת: --confirm "${PURGE_CONFIRM_PHRASE}"`);
      return;
    }
    await executePurge(t.db, plan, (s) => console.log(s));
    if (plan.testerUids.length && (!t.emulator || process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
      // AI tester sign-in records (demo_qa_* only — the plan never lists anything else).
      const { getAuth } = await import('firebase-admin/auth');
      const r = await getAuth(t.app).deleteUsers(plan.testerUids);
      console.log(`חשבונות כניסה של בודקים: נמחקו ${r.successCount}, נכשלו ${r.failureCount}`);
    }
    const after = await planPurge(t.db);
    console.log(after.deletes.length ? `נשארו ${after.deletes.length} מסמכים — הרץ שוב.` : 'עולם הדמו נמחק. לא נשאר כלום.');
  } finally {
    await closeDemoTarget(t);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
