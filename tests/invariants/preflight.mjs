/**
 * preflight.mjs — config guard for the workout invariants gate.
 *
 * The gate loads firebase init from `.env.local` (via `node --env-file`). If that
 * file is missing/empty, `--env-file` aborts with an obscure node error BEFORE the
 * runner starts — which reads like an invariant regression. This runs first and
 * fails with a CLEAR, distinct message so a config gap is never mistaken for a bug.
 *
 * Exit 2 = configuration error (not an invariant failure, which is exit 1).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.cwd(), '.env.local');
const fail = (why) => {
  console.error('\n🚫 חסר .env.local — הגדרה נדרשת.');
  console.error(`   ${why}`);
  console.error('   הגייט טוען את אתחול firebase מ-.env.local בשורש הריפו.');
  console.error('   צור/העתק אותו (ב-worktree: מהצ׳קאאוט הראשי) ואז הרץ שוב.');
  console.error('   ⚠️  זהו כשל תצורה — לא רגרסיה של invariant.\n');
  process.exit(2);
};

if (!existsSync(path)) fail(`הקובץ לא נמצא: ${path}`);
const body = readFileSync(path, 'utf8');
if (!body.trim()) fail(`הקובץ ריק: ${path}`);
if (!/FIREBASE/i.test(body)) fail(`חסרות הגדרות firebase (NEXT_PUBLIC_FIREBASE_*) ב-${path}`);
