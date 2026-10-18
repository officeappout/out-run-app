/**
 * AI coach review — the daily run (Admin SDK). Called by POST /api/admin/ai-coach/reviews/run,
 * which the aiCoachReviewScheduler Cloud Function hits every morning (06:00 Israel) and a super
 * admin can hit from the panel ("run now").
 *
 *   1. gates: app_config/ai.reviewBudgetUsd > 0, assertAiBudget (kill switch + global budget),
 *      today's review spend < reviewBudgetUsd
 *   2. threads updated since their review cursor (ai_coach_review_cursors/{uid}), oldest first,
 *      at most `maxThreads` (the scheduler keeps the whole run ≤ 200)
 *   3. per thread: skip users who opted out (users/{uid}.core.aiReviewOptOut === true — read from
 *      the raw doc, no settings toggle yet — or core.analyticsOptOut === true);
 *      new messages → turns → deterministic pre-checks → one grader call (AI_MODEL_SMART,
 *      structured JSON) → ai_coach_reviews/{uid}_{reviewId} + ai_coach_review_stats/{day}
 *      increments + the cursor, in one batch
 *   4. stops early on the time budget (the route has 60 s) and reports `remaining`
 *
 * Read-only towards the coach: it never touches ai_coach_threads, prompts or flags.
 * Privacy: only the first name + gender go to the grader; typed emails / phones are masked
 * (transcript.ts). Reviews expire after 90 days (TTL on expireAt).
 */
import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  AiUnavailableError,
  aiDayKey,
  assertAiBudget,
  getAiModel,
  getAnthropicClient,
  loadAiConfig,
  recordAiUsage,
  withPromptCaching,
} from '@/lib/ai/anthropic.server';
import { estimateCostUsd, usageFromSdk } from '@/lib/ai/ai-pricing';
import { AI_COACH_THREADS } from '@/lib/ai/coach/thread-store.server';
import { coachGenderOf, firstNameOf } from '@/lib/ai/coach/persona';
import { GRADER_SYSTEM_PROMPT, gradeTurns, type CallGrader } from './grader';
import { mergeIssues, runPrechecks } from './prechecks';
import {
  AI_COACH_REVIEWS,
  AI_COACH_REVIEW_CURSORS,
  AI_COACH_REVIEW_STATS,
  AI_REVIEW_FEATURE,
  AI_REVIEW_LEDGER_UID,
  AI_REVIEW_MAX_MESSAGES_PER_THREAD,
  AI_REVIEW_MAX_THREADS_PER_RUN,
  AI_REVIEW_RETENTION_DAYS,
  type ReviewDoc,
} from './review-types';
import { deltaForReview, type StatsDelta } from './stats';
import { messagesToTurns, type RawThreadMessage } from './transcript';

/** Threads untouched for longer than this are not looked at (keeps the query bounded). */
const LOOKBACK_DAYS = 7;
/** A turn this fresh may still be in flight (client tool round trip) — leave it for tomorrow. */
const SETTLE_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

export type ReviewStop = 'review_off' | 'kill_switch' | 'over_budget' | 'review_budget' | 'time' | 'cap' | null;

export interface RunReviewOptions {
  maxThreads?: number;
  /** Stop starting new threads after this long (ms). */
  timeBudgetMs?: number;
  concurrency?: number;
  dryRun?: boolean;
  now?: Date;
}

export interface RunReviewResult {
  day: string;
  reviewed: number;
  skippedOptOut: number;
  skippedNoNew: number;
  failed: number;
  remaining: boolean;
  stoppedBy: ReviewStop;
  costUsd: number;
  reviewDocIds: string[];
  /** dryRun only: what would have been written. */
  dryRunDocs?: ReviewDoc[];
}

function msOf(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' ? v : 0;
}

/** StatsDelta → a Firestore merge payload of increments. */
export function statsIncrements(day: string, d: StatsDelta): Record<string, unknown> {
  const inc = (n: number) => FieldValue.increment(n);
  const map = (m: Record<string, number | undefined>) =>
    Object.fromEntries(Object.entries(m).filter(([, v]) => v).map(([k, v]) => [k, inc(v as number)]));
  return {
    day,
    reviews: inc(d.reviews),
    turns: inc(d.turns),
    issues: inc(d.issues),
    flaggedTurns: inc(d.flaggedTurns),
    scoreSum: inc(d.scoreSum),
    scoreCount: inc(d.scoreCount),
    costUsd: inc(d.costUsd),
    graderErrors: inc(d.graderErrors),
    byCategory: map(d.byCategory),
    byRootCause: map(d.byRootCause),
    bySeverity: map(d.bySeverity),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

const defaultGrader: CallGrader = (params) => getAnthropicClient().messages.create(params);

export async function runAiCoachReview(
  db: Firestore,
  opts: RunReviewOptions = {},
  deps: { callGrader?: CallGrader } = {},
): Promise<RunReviewResult> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const day = aiDayKey(now);
  const maxThreads = Math.min(Math.max(opts.maxThreads ?? AI_REVIEW_MAX_THREADS_PER_RUN, 0), AI_REVIEW_MAX_THREADS_PER_RUN);
  const timeBudgetMs = opts.timeBudgetMs ?? 45_000;
  const callGrader = deps.callGrader ?? defaultGrader;
  const result: RunReviewResult = {
    day,
    reviewed: 0,
    skippedOptOut: 0,
    skippedNoNew: 0,
    failed: 0,
    remaining: false,
    stoppedBy: null,
    costUsd: 0,
    reviewDocIds: [],
    ...(opts.dryRun ? { dryRunDocs: [] } : {}),
  };

  // ── 1. Gates ─────────────────────────────────────────────────────────────
  const config = await loadAiConfig(db);
  if (config.reviewBudgetUsd <= 0) return { ...result, stoppedBy: 'review_off' };
  try {
    await assertAiBudget(db, { config, now });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { ...result, stoppedBy: err.reason === 'kill_switch' ? 'kill_switch' : 'over_budget' };
    }
    throw err;
  }
  const statsSnap = await db.collection(AI_COACH_REVIEW_STATS).doc(day).get();
  const spentRaw = statsSnap.exists ? statsSnap.data()?.costUsd : 0;
  let spent = typeof spentRaw === 'number' && Number.isFinite(spentRaw) ? spentRaw : 0;
  if (spent >= config.reviewBudgetUsd) return { ...result, stoppedBy: 'review_budget' };

  // ── 2. Candidates ────────────────────────────────────────────────────────
  const since = Timestamp.fromMillis(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const tSnap = await db
    .collection(AI_COACH_THREADS)
    .where('updatedAt', '>=', since)
    .orderBy('updatedAt', 'asc')
    .limit(AI_REVIEW_MAX_THREADS_PER_RUN * 3)
    .get();
  const threads = tSnap.docs.map((d) => ({ uid: d.id, updatedAtMs: msOf(d.data()?.updatedAt) }));
  const cursorSnaps = threads.length
    ? await db.getAll(...threads.map((t) => db.collection(AI_COACH_REVIEW_CURSORS).doc(t.uid)))
    : [];
  const cursors = new Map(cursorSnaps.map((s) => [s.id, msOf(s.data()?.reviewedUntil)]));
  const due = threads.filter((t) => t.updatedAtMs > (cursors.get(t.uid) ?? 0));
  const queue = due.slice(0, maxThreads);
  if (due.length > queue.length) result.remaining = true;

  const model = getAiModel('smart');
  const system = withPromptCaching({ system: GRADER_SYSTEM_PROMPT }).system;
  const settleBefore = now.getTime() - SETTLE_MS;

  // ── 3. Per thread ────────────────────────────────────────────────────────
  const reviewOne = async (uid: string): Promise<void> => {
    const cursorRef = db.collection(AI_COACH_REVIEW_CURSORS).doc(uid);
    const userSnap = await db.collection('users').doc(uid).get();
    const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;
    if (core.aiReviewOptOut === true || core.analyticsOptOut === true) {
      result.skippedOptOut++;
      if (!opts.dryRun) await cursorRef.set({ reviewedUntil: Timestamp.fromMillis(now.getTime()), optedOut: true }, { merge: true });
      return;
    }

    const from = cursors.get(uid) ?? 0;
    const mSnap = await db
      .collection(AI_COACH_THREADS)
      .doc(uid)
      .collection('messages')
      .where('createdAt', '>', Timestamp.fromMillis(from))
      .orderBy('createdAt', 'asc')
      .limit(AI_REVIEW_MAX_MESSAGES_PER_THREAD)
      .get();
    const msgs: RawThreadMessage[] = mSnap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter((m) => msOf(m.data.createdAt) <= settleBefore)
      // Unified Kelly: team replies and app messages are not the AI's turns — never graded.
      .filter((m) => m.data.source !== 'human' && m.data.source !== 'system');
    if (!msgs.some((m) => m.data.role === 'assistant')) {
      result.skippedNoNew++;
      return;
    }
    // Never end a review on a dangling user message — it is reviewed with its reply next time.
    while (msgs.length && msgs[msgs.length - 1].data.role !== 'assistant') msgs.pop();

    const turns = messagesToTurns(msgs);
    const pre = runPrechecks(turns);
    const ctx = { firstName: firstNameOf(core.name), gender: coachGenderOf(core.gender) };

    let graded: Awaited<ReturnType<typeof gradeTurns>> | null = null;
    let costUsd = 0;
    if (spent < config.reviewBudgetUsd) {
      graded = await gradeTurns(callGrader, { model, system, turns, ctx, pre });
      if (graded.message) {
        const usage = usageFromSdk(graded.message.usage);
        costUsd = estimateCostUsd(model, usage);
        spent += costUsd;
        result.costUsd += costUsd;
        if (!opts.dryRun) await recordAiUsage(AI_REVIEW_LEDGER_UID, model, usage, { feature: AI_REVIEW_FEATURE, now });
      }
    }

    const reviewId = `${day}-${msOf(msgs[msgs.length - 1].data.createdAt).toString(36)}`;
    const docId = `${uid}_${reviewId}`;
    const review: ReviewDoc = {
      uid,
      reviewId,
      day,
      firstName: ctx.firstName,
      turns,
      issues: mergeIssues(pre, graded?.ok ? graded.output.issues : []),
      issueStatus: {},
      score: graded?.ok ? graded.output.score : null,
      summary: graded?.ok ? graded.output.summary : '',
      graderError: graded ? (graded.ok ? null : graded.error) : 'review_budget',
      model: graded ? model : null,
      costUsd,
      coveredFromMs: msOf(msgs[0].data.createdAt),
      coveredUntilMs: msOf(msgs[msgs.length - 1].data.createdAt),
      createdAtMs: now.getTime(),
    };

    if (opts.dryRun) {
      result.dryRunDocs!.push(review);
    } else {
      const batch = db.batch();
      // Firestore rejects `undefined`; the JSON round trip also flattens tool inputs.
      batch.set(db.collection(AI_COACH_REVIEWS).doc(docId), {
        ...JSON.parse(JSON.stringify(review)),
        createdAt: Timestamp.fromMillis(now.getTime()),
        expireAt: Timestamp.fromMillis(now.getTime() + AI_REVIEW_RETENTION_DAYS * DAY_MS),
      });
      batch.set(db.collection(AI_COACH_REVIEW_STATS).doc(day), statsIncrements(day, deltaForReview(review)), { merge: true });
      batch.set(cursorRef, { reviewedUntil: Timestamp.fromMillis(review.coveredUntilMs), lastReviewDocId: docId }, { merge: true });
      await batch.commit();
    }
    result.reviewDocIds.push(docId);
    result.reviewed++;
  };

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 6));
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      if (Date.now() - started > timeBudgetMs) {
        result.stoppedBy ??= 'time';
        result.remaining = true;
        return;
      }
      if (spent >= config.reviewBudgetUsd) {
        result.stoppedBy ??= 'review_budget';
        result.remaining = true;
        return;
      }
      const t = queue[next++];
      try {
        await reviewOne(t.uid);
      } catch (err) {
        // API / Firestore failure: nothing stored, cursor not moved — retried next run.
        result.failed++;
        console.error(`[ai-review] thread ${t.uid} failed`, err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (!result.stoppedBy && due.length > queue.length) result.stoppedBy = 'cap';
  return result;
}

