/**
 * scripts/demo/add-viewer.ts <email|uid> — lets one of the owner's TEST accounts see the
 * demo world (demo_registry/viewers + managerIds of the demo authorities).
 *
 *   npx tsx scripts/demo/add-viewer.ts cali.appout@gmail.com --project appout-1
 *   npx tsx scripts/demo/add-viewer.ts cali.appout@gmail.com --project appout-1 --groups   # also join the demo groups + chats
 *   npx tsx scripts/demo/add-viewer.ts <uid> --project <id> --emulator
 *
 * An email is resolved to its uid with Firebase Auth at run time (never hard-coded).
 * On the emulator pass a uid (the Auth emulator is not started).
 */
import { addViewer } from './lib/viewer';
import { closeDemoTarget, describeDemoTarget, loadEnvLocal, openDemoTarget, parseDemoArgs } from './lib/target';

async function main() {
  const args = parseDemoArgs(process.argv.slice(2));
  const who = args.positional[0];
  if (!who) throw new Error('שימוש: add-viewer.ts <email|uid> --project <id> [--emulator] [--groups]');
  await loadEnvLocal();
  const t = await openDemoTarget(args);
  console.log(`יעד: ${describeDemoTarget(t)}`);
  try {
    let uid = who;
    let name: string | undefined;
    if (who.includes('@')) {
      if (t.emulator) throw new Error('באמולטור יש להעביר uid, לא אימייל');
      const { getAuth } = await import('firebase-admin/auth');
      const user = await getAuth(t.app).getUserByEmail(who);
      uid = user.uid;
      name = user.displayName ?? undefined;
      console.log(`${who} → ${uid}`);
    }
    const r = await addViewer(t.db, uid, { groups: args.flags.has('--groups'), name });
    console.log(`הצופה ${r.uid} נוסף ל-demo_registry/viewers`);
    console.log(`מנהל ב: ${r.managerOf.join(', ') || '— (הרץ קודם את seed.ts)'}`);
    if (args.flags.has('--groups')) console.log(`קבוצות: ${r.groups.join(', ') || '—'}`);
  } finally {
    await closeDemoTarget(t);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
