'use client';

/**
 * Kelly phase 2 — the confirm card's "אשר" / "בטל" (flag ai_coach_phase2).
 *
 *   confirm  POST {confirm} → the server releases the plan ONCE (owner, fresh, unchanged
 *            schedule) → the EXISTING schedule-builder save executor writes it on this
 *            device (saveScheduleProposal: the same writer as the builder's approve button,
 *            under the user's own rules) → POST {applied | failed}
 *   dismiss  POST {dismiss}
 *
 * Kelly never calls this: only the user's tap on the card does.
 */
import { auth } from '@/lib/firebase';
import { saveScheduleProposal } from '@/features/schedule/services/scheduleBuilderSave';
import type { SchedulePlan } from '@/features/schedule/services/scheduleBuilderSave.plan';

export type ProposalOutcome = 'applied' | 'dismissed' | 'stale' | 'expired' | 'busy' | 'failed' | 'offline';

async function post(body: Record<string, string>): Promise<{ status: number; data: Record<string, unknown> }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { status: 401, data: {} };
  const res = await fetch('/api/ai-coach/schedule-proposal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

function failureOf(status: number, error: unknown): ProposalOutcome {
  if (error === 'stale') return 'stale';
  if (error === 'expired' || status === 410) return 'expired';
  if (error === 'in_progress') return 'busy';
  if (error === 'dismissed') return 'dismissed';
  return 'failed';
}

export async function confirmScheduleProposal(messageId: string, proposalId: string): Promise<ProposalOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const uid = auth.currentUser?.uid;
  if (!uid) return 'failed';
  const ids = { messageId, proposalId };
  try {
    const claim = await post({ ...ids, action: 'confirm' });
    if (claim.status !== 200) return failureOf(claim.status, claim.data.error);
    if (claim.data.already === true) return 'applied';
    const plan = claim.data.plan as SchedulePlan | undefined;
    if (!plan || (plan.scope !== 'this_week' && plan.scope !== 'from_now')) {
      await post({ ...ids, action: 'failed' });
      return 'failed';
    }
    // Strength-only plans: running days are never in a chat proposal, so no running time.
    const outcome = await saveScheduleProposal(plan, { uid, runningTime: '' });
    await post({ ...ids, action: outcome.ok ? 'applied' : 'failed' });
    return outcome.ok ? 'applied' : 'failed';
  } catch (err) {
    console.warn('[ai-coach] schedule proposal confirm failed', err);
    try {
      await post({ ...ids, action: 'failed' });
    } catch {
      /* the claim expires on its own (CLAIM_STALE_MS) */
    }
    return 'failed';
  }
}

export async function dismissScheduleProposal(messageId: string, proposalId: string): Promise<ProposalOutcome> {
  try {
    const r = await post({ messageId, proposalId, action: 'dismiss' });
    return r.status === 200 ? 'dismissed' : failureOf(r.status, r.data.error);
  } catch {
    return 'offline';
  }
}
