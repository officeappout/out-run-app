/**
 * READ-ONLY, PRODUCTION. No writes, anywhere. Owner-run (David), for HIS OWN uid only.
 *
 * K0 investigation (docs/kelly/K0-INVESTIGATION.md §4): why Kelly doesn't know the schedule,
 * why "מה קלי זוכר" is empty, and what the route tool can use. Prints, for ONE uid:
 *   - the relevant system_config/feature_flags keys
 *   - this week (Sun→Sat, Israel): does a userSchedule day doc exist, what's in it, and what the
 *     recurring template plans for that day (recurringDayPlan — the same core the server
 *     training reminder uses). "doc: MISSING" + "template: training" = a day Kelly can't see.
 *   - ai_coach_memory/{uid}: fact count, extractedUntil, clearedAt, the facts themselves
 *   - ai_coach_threads/{uid}: updatedAt, messageCount, user messages waiting after extractedUntil,
 *     whether the thread is inside the nightly run's 26 h window
 *   - ai_usage/{uid}_{day}.byFeature for the last 14 days (evidence the nightly memory run reached him)
 *   - route origin: userLocations/{uid} age and whether core.anchorLat/Lng exist (NO coordinates printed)
 * Message texts are never printed — counts and dates only.
 *
 * Run:
 *   FIREBASE_SERVICE_ACCOUNT_KEY="$(cat <key>.json)" npx tsx scripts/diagnostics/kelly-k0-owner-check.ts --email office@appout.co.il
 *   (or --uid <uid>)
 */
import * as admin from 'firebase-admin';
import { recurringDayPlan, templateSessionsToMaterialize } from '../../src/features/user/scheduling/utils/recurring-day.core';

const MEMORY_LOOKBACK_MS = 26 * 3_600_000; // src/lib/ai/coach/memory/run.server.ts
const EXTRACT_PAGE = 120; // src/lib/ai/coach/memory/extract.server.ts (limit)
const FLAG_KEYS = [
  'kelly_unified_v1', 'ai_coach_enabled', 'ai_coach_schedule_advisor', 'ai_coach_phase2', 'ai_coach_memory', 'ai_coach_round4',
  'ai_coach_proactive', 'ai_coach_proactive_llm', 'ai_coach_free_for_all', 'demo_kelly', 'enable_home_v2',
  'enable_graphhopper_routes', 'enable_loops_prefer_official', 'enable_route_quality_v1',
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function israelDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore values
function iso(v: any): string {
  if (!v) return '—';
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (typeof v === 'number') return v > 0 ? new Date(v).toISOString() : '0 (never)';
  return String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore values
function ms(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  return null;
}

async function main() {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  if (!key?.project_id) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
    process.exit(1);
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
  const db = admin.firestore();

  let uid = arg('uid');
  const email = arg('email');
  if (!uid && email) uid = (await admin.auth().getUserByEmail(email)).uid;
  if (!uid) {
    console.error('Pass --email <your email> or --uid <your uid>');
    process.exit(1);
  }
  const now = new Date();
  console.log(`uid: ${uid}   now: ${now.toISOString()}\n`);

  // ── Flags ────────────────────────────────────────────────────────────────
  const flags = (await db.collection('system_config').doc('feature_flags').get()).data() ?? {};
  console.log('=== Flags (system_config/feature_flags) ===');
  for (const k of FLAG_KEYS) console.log(`  ${k.padEnd(32)} ${k in flags ? JSON.stringify(flags[k]) : '(absent → code default)'}`);

  // ── Profile bits ─────────────────────────────────────────────────────────
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  const life = user.lifestyle ?? {};
  const running = user.running ?? {};
  const template = life.recurringTemplate ?? null;
  const runningProgramId: string | null = running?.activeProgram?.programId ?? null;
  console.log('\n=== Profile (schedule sources the HOME screen uses) ===');
  console.log(`  lifestyle.primaryTrack      ${JSON.stringify(life.primaryTrack ?? null)}`);
  console.log(`  lifestyle.scheduleDays      ${JSON.stringify(life.scheduleDays ?? null)}`);
  console.log(`  lifestyle.recurringTemplate ${JSON.stringify(template)}`);
  console.log(`  lifestyle.reminders         ${JSON.stringify(life.reminders ?? null)}`);
  console.log(`  running.activeProgram       ${running?.activeProgram ? `programId=${runningProgramId} schedule entries=${Array.isArray(running.activeProgram.schedule) ? running.activeProgram.schedule.length : 0} startDate=${iso(running.activeProgram.startDate)}` : '(none)'}`);
  console.log(`  core.demo                   ${JSON.stringify(user.core?.demo ?? null)}   core.isSuperAdmin ${JSON.stringify(user.core?.isSuperAdmin ?? null)}`);

  // ── This week: docs vs template ──────────────────────────────────────────
  const today = israelDateKey(now);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDays(today, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  const snaps = await db.getAll(...week.map((d) => db.collection('userSchedule').doc(`${uid}_${d}`)));
  console.log('\n=== This week: what Kelly reads (userSchedule docs) vs what the template plans ===');
  let missingPlanned = 0;
  snaps.forEach((s, i) => {
    const date = week[i];
    const entries: Array<Record<string, unknown>> = s.exists && Array.isArray(s.data()?.entries) ? s.data()!.entries : [];
    const docLine = s.exists
      ? entries.map((e) => `${e.type}${e.source ? `/${e.source}` : ''}${e.override ? '/override' : ''}${e.completed ? '/done' : ''}[${(e.programIds as string[] | undefined)?.join(',') ?? ''}]${e.plannedRun ? '+plannedRun' : ''}`).join(' ') || '(empty entries)'
      : 'MISSING';
    const plan = recurringDayPlan(template, date, life.reminders, runningProgramId);
    const planLine = plan.kind === 'training' ? `training: ${plan.sessions.map((x) => `${x.programId}(${x.category})`).join(', ')}` : plan.kind;
    const unseen = templateSessionsToMaterialize(template, date, s.exists ? entries : null, life.reminders, runningProgramId);
    if (unseen.length) missingPlanned += unseen.length;
    console.log(`  ${date}${date === today ? ' (today)' : '        '}  doc: ${docLine}`);
    console.log(`  ${' '.repeat(18)}template: ${planLine}${unseen.length ? `   ← ${unseen.length} session(s) Kelly does NOT see` : ''}`);
  });
  console.log(`  → template sessions this week invisible to Kelly: ${missingPlanned}`);
  if (running?.activeProgram) console.log('  (running days are placed on home from running.activeProgram.schedule by slot type — not in these docs unless the bridge seeded the template)');

  // ── Memory ───────────────────────────────────────────────────────────────
  const mem = (await db.collection('ai_coach_memory').doc(uid).get()).data();
  const extractedUntil = typeof mem?.extractedUntil === 'number' ? mem.extractedUntil : 0;
  console.log('\n=== Memory (ai_coach_memory/{uid}) — what "מה קלי זוכר" shows ===');
  if (!mem) console.log('  (no document — the nightly run has never written for this uid)');
  else {
    const facts = Array.isArray(mem.facts) ? mem.facts : [];
    console.log(`  facts: ${facts.length}   extractedUntil: ${iso(extractedUntil)}   clearedAt: ${iso(mem.clearedAt)}   updatedAt: ${iso(mem.updatedAt)}`);
    for (const f of facts) console.log(`   - [${f?.category}] ${f?.text}`);
  }

  // ── Thread ───────────────────────────────────────────────────────────────
  const threadRef = db.collection('ai_coach_threads').doc(uid);
  const thread = (await threadRef.get()).data();
  console.log('\n=== Thread (ai_coach_threads/{uid}) ===');
  if (!thread) console.log('  (no thread)');
  else {
    const upd = ms(thread.updatedAt);
    console.log(`  updatedAt: ${iso(thread.updatedAt)}   messageCount: ${thread.messageCount ?? '—'}   summary: ${thread.summary ? `${String(thread.summary).length} chars` : 'none'}`);
    const total = (await threadRef.collection('messages').count().get()).data().count;
    const after = await threadRef.collection('messages').where('createdAt', '>', admin.firestore.Timestamp.fromMillis(extractedUntil)).orderBy('createdAt', 'asc').get();
    const userAfter = after.docs.filter((d) => {
      const x = d.data();
      return x.source === 'user' || (x.source === undefined && x.role === 'user');
    });
    const newest = after.docs.length ? after.docs[after.docs.length - 1].get('createdAt') : null;
    console.log(`  messages stored now: ${total}   messages after extractedUntil: ${after.size} (user-written: ${userAfter.length})   newest: ${iso(newest)}`);
    if (after.size > EXTRACT_PAGE) {
      console.log(`  ⚠ more than ${EXTRACT_PAGE} messages pending: the nightly pass reads the OLDEST ${EXTRACT_PAGE} first (backlog bug, K0 §2.3.3) — ~${Math.ceil(after.size / EXTRACT_PAGE)} chat-nights to reach today's`);
    }
    const next0330 = (() => {
      // Next 03:30 Israel, approximated as 00:30 UTC (IDT) — good enough for the window check.
      const d = new Date(now);
      d.setUTCHours(0, 30, 0, 0);
      if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
    if (upd !== null) console.log(`  inside the next nightly run's 26 h window (~${next0330.toISOString()}): ${next0330.getTime() - upd <= MEMORY_LOOKBACK_MS ? 'yes' : 'NO'}`);
  }

  // ── Nightly run evidence ─────────────────────────────────────────────────
  console.log('\n=== AI usage ledger (ai_usage/{uid}_{day}.byFeature), last 14 days ===');
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const usage = await db.getAll(...days.map((d) => db.collection('ai_usage').doc(`${uid}_${d}`)));
  let memoryRuns = 0;
  usage.forEach((u, i) => {
    if (!u.exists) return;
    const by = u.get('byFeature') ?? {};
    if (by.ai_coach_memory) memoryRuns += by.ai_coach_memory;
    console.log(`  ${days[i]}  ${JSON.stringify(by)}`);
  });
  console.log(`  → ai_coach_memory calls for this uid in 14 days: ${memoryRuns}${memoryRuns === 0 ? '  (the nightly run never extracted for you: scheduler not deployed / secret missing / thread outside the window / budget stop — check Cloud Functions logs "[kellyMemoryScheduler] done")' : ''}`);

  // ── Route origin (no coordinates) ────────────────────────────────────────
  console.log('\n=== Route origin for plan_aerobic_session (no coordinates printed) ===');
  const loc = (await db.collection('userLocations').doc(uid).get()).data();
  const locAt = ms(loc?.updatedAt);
  console.log(`  userLocations updatedAt: ${iso(loc?.updatedAt)}${locAt !== null ? ` (${Math.round((now.getTime() - locAt) / 86_400_000)} days ago; used if ≤ 14)` : ''}`);
  console.log(`  core.anchorLat/Lng present: ${typeof user.core?.anchorLat === 'number' && typeof user.core?.anchorLng === 'number'}`);
  console.log(`  core.authorityId: ${user.core?.authorityId ?? '—'} (city centre only → Kelly skips the GraphHopper loop search)`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
