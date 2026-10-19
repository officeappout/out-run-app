/**
 * Generation review — the nightly run (Admin SDK). Called by POST /api/admin/generation-review/run,
 * which the generationReviewScheduler Cloud Function hits every morning (05:30 Israel) and a
 * super admin can hit from the panel ("הרץ עכשיו").
 *
 *   1. generation_log where reviewed == false, oldest first, ≤ maxSessions per call
 *   2. per session: the invariant rules (pure) → generation_reviews/{logId} when anything fired
 *      or the user reported it; the log is marked reviewed; generation_review_stats/{log.day}
 *      gets the increments — one batch per session
 *   3. enable_generation_review_llm: a Sonnet "does this make sense" pass on a small sample
 *      (reported → flagged → rest), under assertAiBudget + a daily cap of its own
 *   4. stops on the time budget (the route has 60 s) and reports `remaining`
 *
 * A report that arrives after the review flips the log back to reviewed:false — the next run
 * re-reviews it (stats then count only the new reports).
 */
import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AiUnavailableError, aiDayKey, assertAiBudget, getAiModel, loadAiConfig } from '@/lib/ai/anthropic.server';
import { runInvariants, type Finding } from '../invariants';
import { loadGenerationReviewConfig } from '../server/gate.server';
import {
  GENERATION_LOG,
  GENERATION_REVIEWS,
  GENERATION_REVIEW_RETENTION_DAYS,
  GENERATION_REVIEW_STATS,
  GENERATION_TYPES,
  type GenerationInput,
  type GenerationOutput,
  type GenerationType,
} from '../types';
import { deltaForSession, type GenStatsDelta } from './stats';
import { GEN_LLM_DAILY_SESSIONS, GEN_LLM_DEFAULT_DAILY_USD, pickLlmSample } from './llm-prompt';
import { judgeSession, type CallLlm } from './llm.server';

const DAY_MS = 86_400_000;
export const GEN_REVIEW_MAX_SESSIONS_PER_RUN = 400;

export type GenReviewStop = 'time' | 'kill_switch' | 'over_budget' | 'llm_budget' | null;

export interface RunGenReviewOptions {
  maxSessions?: number;
  timeBudgetMs?: number;
  dryRun?: boolean;
  now?: Date;
}

export interface RunGenReviewResult {
  day: string;
  reviewed: number;
  flagged: number;
  failed: number;
  llmReviewed: number;
  remaining: boolean;
  stoppedBy: GenReviewStop;
  costUsd: number;
  /** dryRun only: the findings per log id. */
  dryRun?: Array<{ logId: string; type: string; findings: Finding[] }>;
}

/** GenStatsDelta → a Firestore merge payload of increments. */
export function genStatsIncrements(day: string, d: GenStatsDelta): Record<string, unknown> {
  const inc = (n: number) => FieldValue.increment(n);
  const map = (m: Record<string, number | undefined>) =>
    Object.fromEntries(Object.entries(m).filter(([, v]) => v).map(([k, v]) => [k, inc(v as number)]));
  return {
    day,
    sessions: inc(d.sessions),
    flagged: inc(d.flagged),
    findings: inc(d.findings),
    reports: inc(d.reports),
    llmReviewed: inc(d.llmReviewed),
    llmCostUsd: inc(d.llmCostUsd),
    byRule: map(d.byRule),
    byType: map(d.byType),
    flaggedByType: map(d.flaggedByType),
    bySeverity: map(d.bySeverity),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored log, read through field guards
type Raw = Record<string, any>;

function isType(v: unknown): v is GenerationType {
  return typeof v === 'string' && (GENERATION_TYPES as readonly string[]).includes(v);
}

export async function runGenerationReview(
  db: Firestore,
  opts: RunGenReviewOptions = {},
  deps: { callLlm?: CallLlm } = {},
): Promise<RunGenReviewResult> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const today = aiDayKey(now);
  const maxSessions = Math.min(Math.max(opts.maxSessions ?? GEN_REVIEW_MAX_SESSIONS_PER_RUN, 0), GEN_REVIEW_MAX_SESSIONS_PER_RUN);
  const timeBudgetMs = opts.timeBudgetMs ?? 45_000;
  const result: RunGenReviewResult = {
    day: today, reviewed: 0, flagged: 0, failed: 0, llmReviewed: 0, remaining: false, stoppedBy: null, costUsd: 0,
    ...(opts.dryRun ? { dryRun: [] } : {}),
  };

  // ── 1. Rules pass ─────────────────────────────────────────────────────────
  const snap = await db.collection(GENERATION_LOG).where('reviewed', '==', false).orderBy('createdAt', 'asc').limit(maxSessions).get();
  if (snap.size >= maxSessions && maxSessions > 0) result.remaining = true;
  const llmCandidates: Array<{ logId: string; type: GenerationType; input: GenerationInput; output: GenerationOutput; findings: Finding[]; reported: boolean }> = [];

  for (const doc of snap.docs) {
    if (Date.now() - started > timeBudgetMs) {
      result.stoppedBy = 'time';
      result.remaining = true;
      break;
    }
    try {
      const log = doc.data() as Raw;
      if (!isType(log.type) || !log.output || !log.input) {
        if (!opts.dryRun) await doc.ref.update({ reviewed: true, reviewError: 'malformed' });
        result.failed++;
        continue;
      }
      const session = { type: log.type, input: log.input as GenerationInput, output: log.output as GenerationOutput };
      const findings = runInvariants(session);
      const reports: Raw[] = Array.isArray(log.reports) ? log.reports : [];
      const firstReview = !(typeof log.reviewCount === 'number' && log.reviewCount > 0);
      const newReports = Math.max(0, reports.length - (typeof log.reportsCounted === 'number' ? log.reportsCounted : 0));
      const flagged = findings.length > 0 || reports.length > 0;
      const day = typeof log.day === 'string' ? log.day : today;

      if (opts.dryRun) {
        result.dryRun!.push({ logId: doc.id, type: log.type, findings });
      } else {
        const batch = db.batch();
        if (flagged) {
          batch.set(db.collection(GENERATION_REVIEWS).doc(doc.id), {
            logId: doc.id,
            uid: typeof log.uid === 'string' ? log.uid : null,
            type: log.type,
            generator: log.generator ?? null,
            appVersion: log.appVersion ?? null,
            platform: log.platform ?? null,
            day,
            findings: JSON.parse(JSON.stringify(findings)),
            ruleIds: Array.from(new Set(findings.map((f) => f.ruleId))),
            maxSeverity: findings[0]?.severity ?? 0,
            reported: reports.length > 0,
            reports: reports.slice(-10),
            input: log.input,
            output: log.output,
            outcome: log.outcome ?? null,
            reviewedAt: Timestamp.fromMillis(now.getTime()),
            createdAt: log.createdAt ?? Timestamp.fromMillis(now.getTime()),
            expireAt: Timestamp.fromMillis(now.getTime() + GENERATION_REVIEW_RETENTION_DAYS * DAY_MS),
          }, { merge: true });
        }
        batch.update(doc.ref, { reviewed: true, reviewCount: FieldValue.increment(1), reportsCounted: reports.length });
        batch.set(db.collection(GENERATION_REVIEW_STATS).doc(day), genStatsIncrements(day, deltaForSession(log.type, findings, { firstReview, newReports })), { merge: true });
        await batch.commit();
      }
      result.reviewed++;
      if (flagged) {
        result.flagged++;
        llmCandidates.push({ logId: doc.id, ...session, findings, reported: reports.length > 0 });
      }
    } catch (err) {
      result.failed++;
      console.error(`[generation-review] log ${doc.id} failed`, err instanceof Error ? err.message : err);
    }
  }

  // ── 2. Optional LLM pass ─────────────────────────────────────────────────
  const cfg = await loadGenerationReviewConfig(db, now.getTime());
  if (!cfg.llmOn || llmCandidates.length === 0 || opts.dryRun) return result;
  const aiConfig = await loadAiConfig(db);
  try {
    await assertAiBudget(db, { config: aiConfig, now });
  } catch (err) {
    if (err instanceof AiUnavailableError) return { ...result, stoppedBy: result.stoppedBy ?? (err.reason === 'kill_switch' ? 'kill_switch' : 'over_budget') };
    throw err;
  }
  const rawCap = (await db.collection('app_config').doc('ai').get().catch(() => null))?.data()?.generationReviewBudgetUsd;
  const capUsd = typeof rawCap === 'number' && rawCap >= 0 ? rawCap : GEN_LLM_DEFAULT_DAILY_USD;
  const todaySnap = await db.collection(GENERATION_REVIEW_STATS).doc(today).get();
  let spent = Number(todaySnap.data()?.llmCostUsd) || 0;
  const doneToday = Number(todaySnap.data()?.llmReviewed) || 0;
  const model = getAiModel('smart');

  for (const c of pickLlmSample(llmCandidates, GEN_LLM_DAILY_SESSIONS - doneToday)) {
    if (spent >= capUsd) {
      result.stoppedBy ??= 'llm_budget';
      break;
    }
    if (Date.now() - started > timeBudgetMs + 10_000) break;
    try {
      const j = await judgeSession(model, c, { call: deps.callLlm, now });
      spent += j.costUsd;
      result.costUsd += j.costUsd;
      result.llmReviewed++;
      const batch = db.batch();
      batch.set(db.collection(GENERATION_REVIEWS).doc(c.logId), {
        llm: j.output ? { ...j.output, model, atMs: now.getTime() } : { error: j.error, model, atMs: now.getTime() },
      }, { merge: true });
      batch.set(db.collection(GENERATION_REVIEW_STATS).doc(today), { day: today, llmReviewed: FieldValue.increment(1), llmCostUsd: FieldValue.increment(j.costUsd) }, { merge: true });
      await batch.commit();
    } catch (err) {
      console.error(`[generation-review] llm ${c.logId} failed`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}
