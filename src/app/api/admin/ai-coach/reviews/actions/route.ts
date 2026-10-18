/**
 * POST /api/admin/ai-coach/reviews/actions — super admin actions on one flagged issue:
 *
 *   { action: 'mark_fixed' | 'reopen', reviewDocId, issueId }
 *   { action: 'convert', reviewDocId, issueId, assertions? }
 *       → ai_coach_eval_cases/{caseId}: the user message, the earlier turns of that review as
 *         history, a context snapshot (session facts at the time + the user context sheet as
 *         the server tools would build it, area name dropped) and the expected assertions
 *         (defaults from the request parser + the issue category, overridable). The issue is
 *         marked 'converted'. Run it with scripts/ai-coach-evals.ts --firestore.
 *
 * Writes only ai_coach_reviews (issueStatus) and ai_coach_eval_cases; never the coach.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey, getIsraelDayOfWeek, getIsraelHour } from '@/lib/israelTime';
import { getUserContext, type ServerToolContext } from '@/lib/ai/coach/server-tools.server';
import { coachGenderOf, firstNameOf } from '@/lib/ai/coach/persona';
import { AI_COACH_EVAL_CASES, AI_COACH_REVIEWS, type ReviewIssue, type ReviewTurn } from '@/lib/ai/review/review-types';
import { EvalAssertionsSchema, EvalCaseSchema, caseIdFor, defaultAssertions, type EvalCase } from '@/lib/ai/review/eval-case';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DocId = z.string().regex(/^[A-Za-z0-9_-]{5,200}$/);
const IssueId = z.string().regex(/^(precheck|llm)-\d{1,4}$/);

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_fixed'), reviewDocId: DocId, issueId: IssueId }),
  z.object({ action: z.literal('reopen'), reviewDocId: DocId, issueId: IssueId }),
  z.object({ action: z.literal('convert'), reviewDocId: DocId, issueId: IssueId, assertions: EvalAssertionsSchema.optional() }),
]);

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const body = parsed.data;
  const db = getAdminDb();
  const reviewRef = db.collection(AI_COACH_REVIEWS).doc(body.reviewDocId);

  try {
    const snap = await reviewRef.get();
    if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored review, read through field guards
    const review = snap.data() as Record<string, any>;
    const issues: ReviewIssue[] = Array.isArray(review.issues) ? review.issues : [];
    const issue = issues.find((i) => i.id === body.issueId);
    if (!issue) return NextResponse.json({ error: 'issue_not_found' }, { status: 404 });

    if (body.action !== 'convert') {
      await reviewRef.update({
        [`issueStatus.${body.issueId}`]:
          body.action === 'mark_fixed' ? { status: 'fixed', at: Date.now() } : FieldValue.delete(),
      });
      return NextResponse.json({ ok: true });
    }

    // ── convert ─────────────────────────────────────────────────────────────
    const turns: ReviewTurn[] = Array.isArray(review.turns) ? review.turns : [];
    const turn = turns.find((t) => t.turnIndex === issue.turnIndex);
    if (!turn || !turn.userText) return NextResponse.json({ error: 'turn_has_no_user_message' }, { status: 422 });
    const uid = typeof review.uid === 'string' ? review.uid : '';
    const at = new Date(turn.createdAtMs || Date.now());

    const userSnap = uid ? await db.collection('users').doc(uid).get() : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw profile, read through field guards
    const profile = (userSnap?.data() ?? {}) as Record<string, any>;
    let sheet: Record<string, unknown> | undefined;
    if (uid) {
      const toolCtx: ServerToolContext = { db, uid, profile, now: at, knownCards: new Map(), turn: { handoffDone: false } };
      const res = await getUserContext(toolCtx); // read-only
      sheet = { ...(JSON.parse(res.content) as Record<string, unknown>), area: null };
    }

    const history = turns
      .filter((t) => t.turnIndex < issue.turnIndex)
      .flatMap((t) => [
        ...(t.userText ? [{ role: 'user' as const, text: t.userText }] : []),
        ...(t.assistantText ? [{ role: 'assistant' as const, text: t.assistantText }] : []),
      ]);

    const evalCase: EvalCase = EvalCaseSchema.parse({
      id: caseIdFor(body.reviewDocId, issue.id),
      name: `${issue.category}: ${turn.userText.slice(0, 80)}`,
      source: { kind: 'review', reviewDocId: body.reviewDocId, turnIndex: issue.turnIndex, issueId: issue.id, category: issue.category },
      history,
      message: turn.userText.slice(0, 1000),
      context: {
        firstName: firstNameOf(profile.core?.name),
        gender: coachGenderOf(profile.core?.gender),
        todayKey: getIsraelDateKey(at),
        israelDayOfWeek: getIsraelDayOfWeek(at),
        israelHour: getIsraelHour(at),
        ...(sheet ? { sheet } : {}),
      },
      assertions: body.assertions ?? defaultAssertions(turn.userText, issue.category),
    });

    const caseRef = db.collection(AI_COACH_EVAL_CASES).doc(evalCase.id);
    const batch = db.batch();
    batch.set(caseRef, {
      ...JSON.parse(JSON.stringify(evalCase)),
      // Lets account deletion (functions/src/onUserDelete.ts) remove cases built from this user's chat.
      sourceUid: uid,
      issue: { category: issue.category, severity: issue.severity, likelyRootCause: issue.likelyRootCause, suggestedFix: issue.suggestedFix },
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(reviewRef, { [`issueStatus.${issue.id}`]: { status: 'converted', at: Date.now(), caseId: evalCase.id } });
    await batch.commit();
    return NextResponse.json({ ok: true, caseId: evalCase.id, assertions: evalCase.assertions });
  } catch (err) {
    console.error('[ai-review/actions] failed', err);
    return NextResponse.json({ error: 'action_failed' }, { status: 500 });
  }
}
