/**
 * AI coach — server tools (Admin SDK). Inputs arrive already zod-validated by the turn
 * engine (validateToolInput); every tool re-scopes to the verified uid, never to anything
 * the model passed in.
 *
 * Read-only, except handoff_to_human. kelly_unified_v1 ON: sets needsHuman + the summary on
 * ai_coach_threads/{uid} (the team replies in the same conversation). OFF (below): one
 * message into the user's EXISTING support DM with
 * the human Kelly team (chats/{[uid, KELLY_UID].sort().join('_')}), same document shapes as
 * /api/social/kelly-welcome-bot. Admins see it in their master inbox as awaiting a reply.
 * At most one handoff per turn.
 */
import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey, getIsraelDayOfWeek } from '@/lib/israelTime';
import { KELLY_NAME, KELLY_UID } from '@/features/social/services/kelly-welcome-bot.service';
import { renderCoachNoteSentences } from '@/features/workout-engine/services/coach-note';
import type { DecisionRecord } from '@/features/workout-engine/services/decision-record';
import {
  RANGE_DAYS,
  buildUserContextSheet,
  daysBetween,
  sheetScheduleEntry,
  summarizeProgress,
  weekKeys,
  type ProgressRange,
  type RawScheduleEntry,
  type RawWorkout,
  type UserContextSheet,
} from './context-sheet';
import { firstNameOf } from './persona';
import { markNeedsHuman, type StoredCard } from './thread-store.server';
import type { ToolExecResult } from './turn-engine';
import { recommendToday, recommendWeek, runAdvisor, sheetPlanFromTurn } from './schedule-advisor.server';
import { appHelpToolResult, type GetAppHelpInputT } from './app-help/retrieve';
import { proposeScheduleChange } from './schedule-proposal/propose.server';
import type { ProposeScheduleChangeInputT, StoredProposal } from './schedule-proposal/types';
import { executeRound4Tool, isRound4Tool, type Round4ToolContext } from './round4/execute.server';

export interface ServerToolContext {
  db: Firestore;
  uid: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  profile: Record<string, any>;
  now: Date;
  /** Cards shown in this conversation (recent history + this turn), by workoutId. */
  knownCards: Map<string, StoredCard>;
  /** Mutable per-turn flags. `proposal`: the schedule proposal prepared this turn (phase 2). */
  turn: { handoffDone: boolean; proposal?: StoredProposal | null };
  /** system_config/feature_flags.ai_coach_schedule_advisor (route.ts). Off → the advisor tools don't exist. */
  scheduleAdvisor?: boolean;
  /**
   * enable_home_v2 for this user (route.ts, runsByTypeFor: the live flag, or super admin):
   * the advisor places the run week by slot type — the week home shows. Absent = ordinal.
   */
  runsByType?: boolean;
  /**
   * kelly_unified_v1 ON: handoff_to_human flags the unified thread (needsHuman + summary)
   * instead of writing into the old chats/ DM. Absent/false = the old behaviour.
   */
  unified?: boolean;
  /** system_config/feature_flags.ai_coach_phase2 (route.ts). Off → get_app_help / propose_schedule_change don't exist. */
  phase2?: boolean;
  /**
   * Kelly round 4 (ai_coach_round4, route.ts): the sheet, flags and per-turn state the round 4
   * tools use. Absent → plan_aerobic_session / find_nearby_parks / get_weather / start_tutorial
   * don't exist and get_app_help reads only the original entries.
   */
  round4?: Pick<Round4ToolContext, 'sheet' | 'flags' | 'state'>;
}

const json = (v: unknown): ToolExecResult => ({ content: JSON.stringify(v) });

async function readWorkouts(ctx: ServerToolContext, sinceMs: number | null, limit: number): Promise<RawWorkout[]> {
  let q = ctx.db.collection('workouts').where('userId', '==', ctx.uid);
  if (sinceMs !== null) q = q.where('date', '>=', Timestamp.fromMillis(sinceMs));
  const snap = await q.orderBy('date', 'desc').limit(limit).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      date: x.date?.toDate?.() ?? null,
      workoutType: x.workoutType ?? x.activityType,
      category: x.category,
      durationSec: x.duration,
    };
  });
}

async function readSchedule(ctx: ServerToolContext, dates: string[]): Promise<RawScheduleEntry[]> {
  if (dates.length === 0) return [];
  const refs = dates.map((d) => ctx.db.collection('userSchedule').doc(`${ctx.uid}_${d}`));
  const snaps = await ctx.db.getAll(...refs);
  const out: RawScheduleEntry[] = [];
  snaps.forEach((s, i) => {
    if (!s.exists) return;
    const entries = (s.data()?.entries ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      if (e?.override === true && e?.type === 'rest') continue;
      out.push({
        date: dates[i],
        type: e.type,
        programIds: e.programIds,
        startTime: e.startTime,
        completed: e.completed,
        title: e.title,
        scheduledCategories: e.scheduledCategories,
        plannedRun: e.plannedRun,
      });
    }
  });
  return out;
}

async function readAreaName(ctx: ServerToolContext): Promise<string | null> {
  const id = ctx.profile?.core?.neighborhoodId || ctx.profile?.core?.authorityId;
  if (typeof id !== 'string' || !id) return null;
  try {
    const snap = await ctx.db.collection('authorities').doc(id).get();
    const name = snap.data()?.name;
    if (typeof name === 'string') return name;
    if (name && typeof name.he === 'string') return name.he;
  } catch {
    /* area is optional */
  }
  return null;
}

export interface ProgramIndex {
  resolveSlug: (id: string) => string;
  subProgramsBySlug: Record<string, string[]>;
}

const PROGRAM_INDEX_TTL_MS = 10 * 60_000;
let programIndexCache: { at: number; index: ProgramIndex } | null = null;

/** Same slug rule as the client's id→slug map (program-hierarchy.utils getIdToSlugMap). */
function slugOfProgram(id: string, d: Record<string, unknown>): string {
  if (typeof d.slug === 'string' && d.slug) return d.slug;
  if (typeof d.movementPattern === 'string' && d.movementPattern) return d.movementPattern;
  if (typeof d.name === 'string' && d.name) return d.name.toLowerCase().replace(/[\s-]+/g, '_');
  return id;
}

/**
 * Program id → slug and parent → subPrograms, for the assessment gaps (activePrograms /
 * tracks mix raw Firestore ids and slugs). Read-only, cached per server instance; on a
 * failure the gaps fall back to slugs as stored + the engine's static parent lists.
 */
export async function loadProgramIndex(db: Firestore, now = Date.now()): Promise<ProgramIndex | null> {
  if (programIndexCache && now - programIndexCache.at < PROGRAM_INDEX_TTL_MS) return programIndexCache.index;
  try {
    const snap = await db.collection('programs').get();
    const idToSlug = new Map<string, string>();
    const rawSubs: Array<[string, string[]]> = [];
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const slug = slugOfProgram(d.id, data);
      idToSlug.set(d.id, slug);
      const subs = Array.isArray(data.subPrograms) ? data.subPrograms.filter((x): x is string => typeof x === 'string') : [];
      if (subs.length) rawSubs.push([slug, subs]);
    }
    const resolveSlug = (id: string) => idToSlug.get(id) ?? id;
    const subProgramsBySlug: Record<string, string[]> = {};
    for (const [slug, subs] of rawSubs) subProgramsBySlug[slug] = subs.map(resolveSlug);
    const index = { resolveSlug, subProgramsBySlug };
    programIndexCache = { at: now, index };
    return index;
  } catch (err) {
    console.warn('[ai-coach] program index unavailable', err);
    return null;
  }
}

/** The user sheet (also pre-loaded into every turn's system prompt by the route). */
export async function loadUserContextSheet(ctx: ServerToolContext): Promise<UserContextSheet> {
  const todayKey = getIsraelDateKey(ctx.now);
  const week = weekKeys(todayKey, getIsraelDayOfWeek(ctx.now));
  const [workouts, weekSchedule, areaName, programIndex, advisor] = await Promise.all([
    readWorkouts(ctx, null, 5),
    readSchedule(ctx, week),
    readAreaName(ctx),
    loadProgramIndex(ctx.db, ctx.now.getTime()),
    // Schedule advisor (flag): the plan section + the derived "done" for today. A failure
    // here never costs the sheet — it is simply built without them, as before.
    ctx.scheduleAdvisor
      ? runAdvisor(ctx).catch((err) => {
          console.warn('[ai-coach] schedule advisor unavailable this turn', err);
          return null;
        })
      : Promise.resolve(null),
  ]);
  return buildUserContextSheet({
    profile: ctx.profile,
    workouts,
    weekSchedule,
    todayKey,
    areaName,
    now: ctx.now,
    ...(programIndex ?? {}),
    ...(advisor ? { plan: sheetPlanFromTurn(advisor), doneToday: advisor.today.doneToday } : {}),
  });
}

export async function getUserContext(ctx: ServerToolContext): Promise<ToolExecResult> {
  return json(await loadUserContextSheet(ctx));
}

/** The stored exercise list of a card shown in this conversation (no device round trip). */
export function getWorkoutDetails(ctx: ServerToolContext, input: { workoutId: string }): ToolExecResult {
  const card = ctx.knownCards.get(input.workoutId);
  if (!card) return { content: 'No workout with this id was shown in this conversation.', isError: true };
  if (!card.exercises?.length) {
    return json({ workoutId: card.workoutId, title: card.title, minutes: card.minutes, location: card.location, note: 'The exercise list of this older card was not saved. Suggest building it again.' });
  }
  return json({
    workoutId: card.workoutId,
    title: card.title,
    minutes: card.minutes,
    requestedMinutes: card.requestedMinutes,
    location: card.location,
    levelCeiling: card.levelCeiling,
    exercises: card.exercises,
  });
}

export async function getProgress(ctx: ServerToolContext, input: { range: ProgressRange }): Promise<ToolExecResult> {
  const since = ctx.now.getTime() - RANGE_DAYS[input.range] * 86_400_000;
  const [workouts, programIndex] = await Promise.all([readWorkouts(ctx, since, 200), loadProgramIndex(ctx.db, ctx.now.getTime())]);
  return json(summarizeProgress(input.range, workouts, ctx.profile, ctx.now, programIndex ?? undefined));
}

export async function getSchedule(ctx: ServerToolContext, input: { from: string; to: string }): Promise<ToolExecResult> {
  const days = daysBetween(input.from, input.to);
  const entries = await readSchedule(ctx, days);
  return json({ from: input.from, to: input.to, entries: entries.map(sheetScheduleEntry) });
}

export function explainWorkout(ctx: ServerToolContext, input: { workoutId: string }): ToolExecResult {
  const card = ctx.knownCards.get(input.workoutId);
  if (!card) return { content: 'No workout with this id was shown in this conversation.', isError: true };
  const record = card.decisionRecord as DecisionRecord | null | undefined;
  if (!record || record.v !== 1) {
    return json({ title: card.title, minutes: card.minutes, exercises: card.exerciseCount, reasons: [], note: 'No engine explanation is available for this workout.' });
  }
  return json({
    title: card.title,
    minutes: card.minutes,
    exercises: card.exerciseCount,
    // Hebrew sentences rendered from the record by the same renderer the app uses
    // ("דגשי האימון"); every number in them comes from the record.
    coachNote: renderCoachNoteSentences(record),
    reasons: record.reasons,
    expect: record.expect,
  });
}

export async function handoffToHuman(ctx: ServerToolContext, input: { summary: string }): Promise<ToolExecResult> {
  if (ctx.turn.handoffDone) return { content: 'Already sent to the coaching team in this turn.', isError: true };
  if (ctx.unified) {
    // Unified Kelly: the team answers in THIS conversation (admin queue "קלי · ממתינים למענה").
    await markNeedsHuman(ctx.db, ctx.uid, input.summary, ctx.now.getTime());
    ctx.turn.handoffDone = true;
    return json({ sent: true, note: 'A person from the OUT team will reply here, in this same chat.' });
  }
  const uid = ctx.uid;
  const name = firstNameOf(ctx.profile?.core?.name) || 'משתמש';
  const text = `סיכום מקלי AI: ${input.summary.replace(/\s+/g, ' ').trim()}`.slice(0, 600);
  const chatRef = ctx.db.collection('chats').doc([uid, KELLY_UID].sort().join('_'));
  const messageRef = chatRef.collection('messages').doc();

  await ctx.db.runTransaction(async (tx) => {
    const chatSnap = await tx.get(chatRef);
    if (!chatSnap.exists) {
      tx.set(chatRef, {
        participants: [uid, KELLY_UID],
        participantNames: { [uid]: name, [KELLY_UID]: KELLY_NAME },
        lastMessage: text,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSenderId: uid,
        unreadCount: { [uid]: 0, [KELLY_UID]: 1 },
        createdAt: FieldValue.serverTimestamp(),
        type: 'dm',
      });
    } else {
      tx.update(chatRef, {
        lastMessage: text,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSenderId: uid,
        [`unreadCount.${KELLY_UID}`]: FieldValue.increment(1),
      });
    }
    // Sent in the USER's name (it is their request) and marked as coming from the AI chat.
    tx.set(messageRef, {
      senderUid: uid,
      senderName: name,
      text,
      sentAt: FieldValue.serverTimestamp(),
      readBy: [uid],
      type: 'text',
      source: 'ai_coach_handoff',
    });
  });
  ctx.turn.handoffDone = true;
  return json({ sent: true });
}

export async function executeServerTool(ctx: ServerToolContext, name: string, input: unknown): Promise<ToolExecResult> {
  switch (name) {
    case 'get_user_context':
      return getUserContext(ctx);
    case 'get_progress':
      return getProgress(ctx, input as { range: ProgressRange });
    case 'get_schedule':
      return getSchedule(ctx, input as { from: string; to: string });
    case 'get_workout_details':
      return getWorkoutDetails(ctx, input as { workoutId: string });
    case 'explain_workout':
      return explainWorkout(ctx, input as { workoutId: string });
    case 'handoff_to_human':
      return handoffToHuman(ctx, input as { summary: string });
    case 'recommend_week':
      if (!ctx.scheduleAdvisor) return { content: `unknown tool ${name}`, isError: true };
      return json(await recommendWeek(ctx));
    case 'recommend_today':
      if (!ctx.scheduleAdvisor) return { content: `unknown tool ${name}`, isError: true };
      return json(await recommendToday(ctx));
    case 'get_app_help':
      if (!ctx.phase2) return { content: `unknown tool ${name}`, isError: true };
      return json(appHelpToolResult(input as GetAppHelpInputT, ctx.round4 ? { round4: true } : {}));
    case 'propose_schedule_change':
      if (!ctx.phase2) return { content: `unknown tool ${name}`, isError: true };
      return proposeScheduleChange(ctx, input as ProposeScheduleChangeInputT);
    default:
      if (ctx.round4 && isRound4Tool(name)) {
        return executeRound4Tool({ db: ctx.db, uid: ctx.uid, profile: ctx.profile, now: ctx.now, ...ctx.round4 }, name, input);
      }
      return { content: `unknown tool ${name}`, isError: true };
  }
}
