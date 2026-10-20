/**
 * One tick of the demo world's life (layer A). Called every 30 minutes by
 * demoSimulatorTick; testable on the emulator with an injected clock and LLM.
 *
 *   1. enable_demo_users off → no-op; the first tick after a switch-off removes the
 *      engine's presence pings (nothing else is touched, history stays until purge).
 *   2. One read round: registry (personas, tenants, viewers), config, control, the
 *      engine's state, today's usage. The same 30-minute slot never runs twice.
 *   3. Personas locked by an active tester session are skipped entirely.
 *   4. Caps (demo_registry/config): workouts / messages / writes per day for the engine,
 *      LLM calls per day (engine + shared total) and the shared daily $ cap. Reached →
 *      that part stops for the day (the LLM falls back to the sentence bank).
 *   5. Activity (activity.ts) then social (social.ts); every write passes the allowlist
 *      + registry check (writer.ts).
 *   6. Usage (FieldValue.increment on totals + bySource.life.*) and the engine's state.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { DEMO_REGISTRY_COLLECTION } from '../lib/demo-world';
import { runActivity, ensureSchedules } from './activity';
import { FLAGS_DOC, LIFE_SOURCE, LIFE_STATE_DOC, llmAllowed, lockedUids, parseFlags, parseLifeConfig, parseLifeState, parseUsageToday, usdOf } from './config';
import type { LifeLlm } from './llm';
import { parseLifePersonas, type LifePersona } from './persona';
import { parseChat, runSocial, TextSource, type ChatDoc } from './social';
import { israelParts } from './time';
import { GuardedWriter, type RegistryView } from './writer';

export interface TickDeps {
  db: Firestore;
  nowMs: number;
  /** The LLM client, or null when the secret is missing (→ sentence bank). Only used when demo_life_llm is on. */
  llm: LifeLlm | null;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

export interface TickReport {
  status: 'off' | 'off-cleaned' | 'duplicate' | 'no-personas' | 'write-cap' | 'ran';
  tickKey: string;
  personas: number;
  locked: number;
  workouts: number;
  posts: number;
  dayDocs: number;
  streaks: number;
  presenceSet: number;
  presenceCleared: number;
  schedulesRolled: number;
  replies: number;
  messages: number;
  kudos: number;
  joins: number;
  feedback: number;
  llmCalls: number;
  llmFallbacks: number;
  writes: number;
  capsHit: string[];
}

const REG = DEMO_REGISTRY_COLLECTION;
/** Daily rolls (group joins, app feedback) happen on the noon tick. */
export const DAILY_ROLL_MINUTE = 12 * 60;

export function tickKeyOf(nowMs: number): { key: string; slot: number } {
  const p = israelParts(nowMs);
  const slot = Math.floor(p.minuteOfDay / 30) * 30;
  return { key: `${p.date}T${String(Math.floor(slot / 60)).padStart(2, '0')}${String(slot % 60).padStart(2, '0')}`, slot };
}

function emptyReport(status: TickReport['status'], tickKey: string): TickReport {
  return { status, tickKey, personas: 0, locked: 0, workouts: 0, posts: 0, dayDocs: 0, streaks: 0, presenceSet: 0, presenceCleared: 0, schedulesRolled: 0, replies: 0, messages: 0, kudos: 0, joins: 0, feedback: 0, llmCalls: 0, llmFallbacks: 0, writes: 0, capsHit: [] };
}

const strSet = (v: unknown) => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);

export async function runLifeTick(deps: TickDeps): Promise<TickReport> {
  const { db, nowMs } = deps;
  const log = deps.log ?? (() => {});
  const now = israelParts(nowMs);
  const { key: tickKey, slot } = tickKeyOf(nowMs);
  const stateRef = db.collection(REG).doc(LIFE_STATE_DOC);

  // ── 1. master switch ─────────────────────────────────────────────────────────────
  const flags = parseFlags((await db.doc(FLAGS_DOC).get()).data());
  if (!flags.enabled) {
    const state = parseLifeState((await stateRef.get()).data());
    if (!state.presenceUids.length) return emptyReport('off', tickKey);
    // Switched off: no demo dot may stay "live" on the map. Path-guarded delete of our own pings.
    const w = new GuardedWriter(db, { personaUids: new Set(state.presenceUids.filter((u) => u.startsWith('demo_'))), viewerUids: new Set(), groupIds: new Set(), chatIds: new Set() });
    const batch = db.batch();
    for (const uid of state.presenceUids) if (uid.startsWith('demo_')) w.add(batch, 'delete', `presence/${uid}`);
    batch.set(stateRef, { presenceUids: [], updatedAt: new Date(nowMs) }, { merge: true });
    await batch.commit();
    const r = emptyReport('off-cleaned', tickKey);
    r.presenceCleared = state.presenceUids.length;
    return r;
  }

  // ── 2. one read round ────────────────────────────────────────────────────────────
  const usageRef = db.doc(`${REG}/usage/days/${now.date}`);
  const [personasSnap, tenantsSnap, viewersSnap, configSnap, controlSnap, stateSnap, usageSnap] = await db.getAll(
    db.doc(`${REG}/personas`),
    db.doc(`${REG}/tenants`),
    db.doc(`${REG}/viewers`),
    db.doc(`${REG}/config`),
    db.doc(`${REG}/control`),
    stateRef,
    usageRef,
  );
  const state = parseLifeState(stateSnap.data());
  if (state.lastTickKey === tickKey) return emptyReport('duplicate', tickKey);

  const all = parseLifePersonas(personasSnap.data());
  const report = emptyReport('ran', tickKey);
  if (!all.length) {
    log('[demoLife] registry has no persona life blocks — re-run the seed (scripts/demo/seed.ts) first');
    await stateRef.set({ lastTickAtMs: nowMs, lastTickKey: tickKey, updatedAt: new Date(nowMs) }, { merge: true });
    return { ...report, status: 'no-personas' };
  }
  const tenants = tenantsSnap.data() ?? {};
  const reg: RegistryView = {
    personaUids: new Set(all.map((p) => p.uid)),
    viewerUids: strSet(viewersSnap.data()?.uids),
    groupIds: new Set(Array.from(strSet(tenants.groupIds)).filter((g) => g.startsWith('demo-'))),
    chatIds: strSet(tenants.chatIds),
  };
  const config = parseLifeConfig(configSnap.data());
  const used = parseUsageToday(usageSnap.data());
  const locked = lockedUids(controlSnap.data(), nowMs);
  const personas = all.filter((p) => !locked.has(p.uid));
  report.personas = personas.length;
  report.locked = all.length - personas.length;
  const groupsOf = (p: LifePersona) => Array.from(new Set([...p.groupIds, ...(state.joined[p.uid] ?? [])])).filter((g) => reg.groupIds.has(g));

  const w = new GuardedWriter(db, reg);
  if (used.life.writes >= config.caps.maxWritesPerDay) {
    report.capsHit.push('writes');
    report.status = 'write-cap';
  }

  // ── 3. activity ──────────────────────────────────────────────────────────────────
  const firstTickToday = state.lastTickAtMs === null || israelParts(state.lastTickAtMs).date !== now.date;
  let presenceUids = state.presenceUids;
  let finished: Awaited<ReturnType<typeof runActivity>>['finished'] = [];
  if (report.status === 'ran') {
    const sched = await ensureSchedules(w, personas, now.date, now.dow, firstTickToday);
    report.schedulesRolled = sched.rolled;
    const act = await runActivity(w, {
      personas,
      nowMs,
      lastTickAtMs: state.lastTickAtMs,
      todaySchedules: sched.todayDocs,
      workoutBudget: Math.max(0, config.caps.maxWorkoutsPerDay - used.life.workouts),
      groupsOf,
      // A locked persona's presence belongs to the tester now — never delete it.
      presenceUids: state.presenceUids.filter((u) => !locked.has(u) && reg.personaUids.has(u)),
    });
    finished = act.finished;
    presenceUids = act.presenceUids;
    Object.assign(report, {
      workouts: act.counters.workouts,
      posts: act.counters.posts,
      dayDocs: act.counters.dayDocs,
      streaks: act.counters.streaks,
      presenceSet: act.counters.presenceSet,
      presenceCleared: act.counters.presenceCleared,
    });
    if (act.counters.workoutCapHit) report.capsHit.push('workouts');
  }

  // ── 4. social ────────────────────────────────────────────────────────────────────
  const text = new TextSource(flags.llm ? deps.llm : null, (calls) => llmAllowed(config.caps, { ...used, llmCallsTotal: used.llmCallsTotal + calls, life: { ...used.life, llmCalls: used.life.llmCalls + calls } }), log);
  let chatSeen = state.chatSeen;
  let joined = state.joined;
  if (report.status === 'ran') {
    const chatIds = Array.from(reg.chatIds);
    const chatSnaps = chatIds.length ? await db.getAll(...chatIds.map((c) => db.doc(`chats/${c}`))) : [];
    const chats = chatSnaps.map((s) => parseChat(s.id, s.data())).filter((c): c is ChatDoc => !!c);
    const social = await runSocial(w, {
      nowMs,
      date: now.date,
      minuteOfDay: now.minuteOfDay,
      tickKey,
      personas,
      personaByUid: new Map(personas.map((p) => [p.uid, p])),
      allPersonaUids: reg.personaUids,
      chats,
      chatSeen: state.chatSeen,
      finished,
      groupsOf,
      messageBudget: Math.max(0, config.caps.maxMessagesPerDay - used.life.messages),
      dailyRollTick: slot === DAILY_ROLL_MINUTE,
      text,
    });
    chatSeen = social.chatSeen;
    joined = { ...state.joined };
    for (const j of social.joins) joined[j.uid] = Array.from(new Set([...(joined[j.uid] ?? []), j.groupId]));
    Object.assign(report, { replies: social.replies, messages: social.messages, kudos: social.kudos, joins: social.joins.length, feedback: social.feedback });
    if (social.messageCapHit) report.capsHit.push('messages');
  }
  if (deps.llm && flags.llm && !llmAllowed(config.caps, { ...used, llmCallsTotal: used.llmCallsTotal + text.calls, life: { ...used.life, llmCalls: used.life.llmCalls + text.calls } })) report.capsHit.push('llm');
  report.llmCalls = text.calls;
  report.llmFallbacks = text.fallbacks;

  // ── 5. usage + state ─────────────────────────────────────────────────────────────
  const stateWrites = 1;
  const usageWrites = 1;
  report.writes = w.writes + stateWrites + usageWrites;
  const inc = FieldValue.increment;
  const usd = text.calls ? usdOf(config.price, text.usage) : null;
  const life: Record<string, unknown> = {
    firestoreWritesEst: inc(report.writes),
    workouts: inc(report.workouts),
    messages: inc(report.replies + report.messages),
  };
  const top: Record<string, unknown> = { firestoreWritesEst: inc(report.writes), updatedAt: FieldValue.serverTimestamp() };
  if (text.calls) {
    Object.assign(life, { llmCalls: inc(text.calls), inputTokens: inc(text.usage.inputTokens), outputTokens: inc(text.usage.outputTokens), cachedTokens: inc(text.usage.cachedTokens), model: deps.llm?.model ?? config.model });
    Object.assign(top, { llmCalls: inc(text.calls), inputTokens: inc(text.usage.inputTokens), outputTokens: inc(text.usage.outputTokens), cachedTokens: inc(text.usage.cachedTokens) });
    if (usd !== null) {
      life.usdEstimate = inc(usd);
      top.usdEstimate = inc(usd);
    }
  }
  const batch = db.batch();
  batch.set(usageRef, { ...top, bySource: { [LIFE_SOURCE]: life } }, { merge: true });
  batch.set(stateRef, { lastTickAtMs: nowMs, lastTickKey: tickKey, presenceUids, chatSeen, joined, lastReport: { ...report }, updatedAt: new Date(nowMs) }, { merge: false });
  await batch.commit();
  return report;
}
