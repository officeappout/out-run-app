/**
 * scripts/qa/register-testers.ts — puts the tester accounts of the mission files on the roster
 * demo_registry/testers { uids } (mintDemoTesterToken signs only uids listed there), and puts
 * every tester account into the state its missions start in (`precondition`, lib/seed):
 *   1. reset — every Firestore doc of the account is deleted (lib/seed/reset.ts);
 *   2. seed  — unless `fresh`, the onboarded state is written with the demo world's builders
 *              (lib/seed/tester-state.ts): users doc, streak, schedule, some history.
 * Idempotent: run it again before a sweep and every account is back in its starting state
 * (a mission that finished a workout / onboarding doesn't leak into the next run).
 *
 *   npx tsx scripts/qa/register-testers.ts --project appout-1 --dry-run
 *   npx tsx scripts/qa/register-testers.ts --project appout-1 --confirm "רשום את הבודקים"
 *   (--only demo_qa_ds_str_plan_se,demo_qa_ds_all_i13   — just these accounts)
 *
 * Same target rules as scripts/demo (explicit --project, FIREBASE_SERVICE_ACCOUNT_KEY from
 * .env.local whose project matches, or --emulator). Writes only demo_qa_* docs that pass the
 * demo-world allowlist, plus the roster. Reads (read-only) the running workout templates + pace
 * map for the running program. The demo purge removes all of it.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { DEMO_REGISTRY, DEMO_TESTERS_DOC } from '@/lib/demo-control/paths';
import { normalizeCategory } from '@/features/workout-engine/core/services/running-admin.service';
import type { PaceMapConfig, RunWorkoutTemplate } from '@/features/workout-engine/core/types/running.types';
import { closeDemoTarget, describeDemoTarget, loadEnvLocal, openDemoTarget, parseDemoArgs, requireConfirm } from '../demo/lib/target';
import { loadPersonasAndMissions, testerStates } from './lib/files';
import { isTesterUid } from './lib/demo-guard';
import type { Persona } from './lib/missions';
import type { Precondition } from './lib/seed/preconditions';
import { SEED_SPECS } from './lib/seed/preconditions';
import { executeTesterReset, planTesterReset } from './lib/seed/reset';
import { buildTesterState, type TesterIdentity } from './lib/seed/tester-state';
import type { RunAssets } from './lib/seed/run-plan';

export const REGISTER_CONFIRM_PHRASE = 'רשום את הבודקים';

interface Account {
  uid: string;
  precondition: Precondition;
  who: TesterIdentity;
  missions: string[];
}

function accountsOf(personas: Map<string, Persona>, missions: ReturnType<typeof loadPersonasAndMissions>['missions']): Account[] {
  const byUid = new Map<string, Account>();
  for (const row of testerStates(missions)) {
    const m = missions.find((x) => x.id === row.mission)!;
    const p = personas.get(m.persona)!;
    const acc = byUid.get(row.uid) ?? { uid: row.uid, precondition: row.precondition, who: { name: p.name, age: p.age, gender: p.gender ?? 'female' }, missions: [] };
    acc.missions.push(row.mission);
    byUid.set(row.uid, acc);
  }
  return Array.from(byUid.values()).sort((a, b) => a.uid.localeCompare(b.uid));
}

/** Read-only: the running workout templates + pace map (what the onboarding reads). */
async function loadRunAssets(db: Firestore): Promise<RunAssets> {
  const [tpl, pace] = await Promise.all([db.collection('runWorkoutTemplates').get(), db.collection('config').doc('paceMapConfig').get()]);
  const templates = tpl.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, category: normalizeCategory(data.category) } as RunWorkoutTemplate;
  });
  return { templates, paceMap: pace.exists ? (pace.data() as PaceMapConfig) : null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseDemoArgs(process.argv.slice(2));
  const { personas, missions } = loadPersonasAndMissions();
  let accounts = accountsOf(personas, missions);
  if (!accounts.every((a) => isTesterUid(a.uid))) throw new Error('a mission uid is not demo_qa_*');
  const only = args.values['--only']?.split(',').map((s) => s.trim()).filter(Boolean);
  if (only?.length) {
    const unknown = only.filter((u) => !accounts.some((a) => a.uid === u));
    if (unknown.length) throw new Error(`--only: not a tester of any mission: ${unknown.join(', ')}`);
    accounts = accounts.filter((a) => only.includes(a.uid));
  }

  const now = new Date();
  console.log('בודקים (חשבון → מצב התחלה → משימות):');
  for (const a of accounts) {
    const n = buildTesterState(a.uid, a.precondition, a.who, now, null).length;
    console.log(`  ${a.uid} → ${a.precondition}${a.precondition === 'fresh' ? '' : ` (${n} מסמכים)`} → ${a.missions.join(', ')}`);
  }
  if (args.dryRun) return;

  await loadEnvLocal();
  requireConfirm(args, REGISTER_CONFIRM_PHRASE, 'רישום הבודקים');
  const t = await openDemoTarget(args);
  try {
    console.log(`יעד: ${describeDemoTarget(t)}`);
    await t.db.collection(DEMO_REGISTRY).doc(DEMO_TESTERS_DOC).set({ uids: FieldValue.arrayUnion(...accounts.map((a) => a.uid)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log('נרשם ברשימת הבודקים.');

    const needsRun = accounts.some((a) => a.precondition !== 'fresh' && SEED_SPECS[a.precondition].runPlan);
    const runAssets = needsRun ? await loadRunAssets(t.db) : null;
    if (runAssets) console.log(`תבניות ריצה: ${runAssets.templates.length}`);

    for (const a of accounts) {
      const reset = await planTesterReset(t.db, a.uid);
      const deleted = await executeTesterReset(t.db, reset);
      if (reset.skipped.length) console.log(`  ${a.uid}: לא נמחקו (משותפים): ${reset.skipped.join(', ')}`);
      const docs = buildTesterState(a.uid, a.precondition, a.who, new Date(), runAssets);
      for (let i = 0; i < docs.length; i += 400) {
        const batch = t.db.batch();
        for (const d of docs.slice(i, i + 400)) batch.set(t.db.doc(d.path), d.data);
        await batch.commit();
        if (!t.emulator) await sleep(500); // gentle on the production triggers
      }
      console.log(`  ${a.uid}: נמחקו ${deleted}, נכתבו ${docs.length} (${a.precondition})`);
    }
    console.log('הבודקים מוכנים.');
  } finally {
    await closeDemoTarget(t);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
