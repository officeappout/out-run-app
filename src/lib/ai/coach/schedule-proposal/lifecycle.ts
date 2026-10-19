/**
 * Kelly phase 2 — the proposal's life cycle, decided purely (the API route runs it inside a
 * Firestore transaction). Idempotent by design:
 *
 *   confirm   pending → applying (returns the plan, ONCE). applied → "already" (no plan, no
 *             second write). applying → in_progress, unless the claim is older than
 *             CLAIM_STALE_MS (the device died mid-write: it may be claimed again).
 *             Refused: dismissed, expired, a this-week day already passed, or a schedule that
 *             changed since the proposal (stale).
 *   applied   applying → applied (applied → applied is a no-op).
 *   failed    applying → pending (the user may tap "אשר" again).
 *   dismiss   pending → dismissed (dismissed → no-op; applying / applied → refused).
 */
import { CLAIM_STALE_MS, type ProposalStatus, type StoredProposal } from './types';
import type { SchedulePlan } from '@/features/schedule/services/scheduleBuilderSave.plan';

export type ProposalAction = 'confirm' | 'applied' | 'failed' | 'dismiss';

export type TransitionResult =
  | { ok: true; status: ProposalStatus; patch: Partial<StoredProposal> | null; plan?: SchedulePlan; already?: boolean }
  | { ok: false; httpStatus: 404 | 409 | 410; error: 'not_found' | 'dismissed' | 'in_progress' | 'expired' | 'stale' | 'not_applying' | 'already_applied' };

export interface TransitionCtx {
  nowMs: number;
  /** Israel 'YYYY-MM-DD' today. */
  todayKey: string;
  /** scheduleFingerprint of the user's CURRENT profile (confirm only). */
  fingerprint?: string;
}

export function decideTransition(p: StoredProposal | null, proposalId: string, action: ProposalAction, ctx: TransitionCtx): TransitionResult {
  if (!p || p.id !== proposalId) return { ok: false, httpStatus: 404, error: 'not_found' };
  switch (action) {
    case 'confirm': {
      if (p.status === 'applied') return { ok: true, status: 'applied', patch: null, already: true };
      if (p.status === 'dismissed') return { ok: false, httpStatus: 409, error: 'dismissed' };
      if (p.status === 'applying' && ctx.nowMs - (p.claimedAtMs ?? 0) < CLAIM_STALE_MS) return { ok: false, httpStatus: 409, error: 'in_progress' };
      if (ctx.nowMs > p.expiresAtMs) return { ok: false, httpStatus: 410, error: 'expired' };
      if (p.plan.scope === 'this_week' && p.plan.dayOverrides.some((o) => o.date < ctx.todayKey)) return { ok: false, httpStatus: 410, error: 'expired' };
      if (ctx.fingerprint !== undefined && ctx.fingerprint !== p.fingerprint) return { ok: false, httpStatus: 409, error: 'stale' };
      return { ok: true, status: 'applying', patch: { status: 'applying', claimedAtMs: ctx.nowMs }, plan: p.plan };
    }
    case 'applied':
      if (p.status === 'applied') return { ok: true, status: 'applied', patch: null, already: true };
      if (p.status !== 'applying') return { ok: false, httpStatus: 409, error: 'not_applying' };
      return { ok: true, status: 'applied', patch: { status: 'applied', appliedAtMs: ctx.nowMs } };
    case 'failed':
      if (p.status !== 'applying') return { ok: false, httpStatus: 409, error: 'not_applying' };
      return { ok: true, status: 'pending', patch: { status: 'pending' } };
    case 'dismiss':
      if (p.status === 'dismissed') return { ok: true, status: 'dismissed', patch: null, already: true };
      if (p.status === 'applied') return { ok: false, httpStatus: 409, error: 'already_applied' };
      if (p.status === 'applying') return { ok: false, httpStatus: 409, error: 'in_progress' };
      return { ok: true, status: 'dismissed', patch: { status: 'dismissed' } };
  }
}
