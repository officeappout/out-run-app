/**
 * Kelly phase 2 — schedule changes from chat: the tool input, the stored proposal and its
 * life cycle. Pure.
 *
 *   propose_schedule_change (server tool, READ-ONLY) → a proposal on Kelly's reply
 *   the app shows a confirm card → "אשר" → POST /api/ai-coach/schedule-proposal {confirm}
 *     → the server re-checks (owner, pending, not expired, schedule unchanged) and CLAIMS it
 *     (pending → applying, once) → the device writes it through the EXISTING schedule-builder
 *     save executor (saveScheduleProposal) → {applied} | {failed}
 *   "בטל" → {dismiss}
 *
 * Kelly never writes a schedule; only the user's tap does, through the same writer the
 * schedule builder's own "approve" button uses.
 */
import { z } from 'zod';
import type { SchedulePlan, SaveScope } from '@/features/schedule/services/scheduleBuilderSave.plan';

export const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type WeekdayEn = (typeof WEEKDAYS_EN)[number];

export const ProposeScheduleChangeInput = z
  .object({
    scope: z.enum(['this_week', 'from_now']),
    /** Move the strength session of `from` to `to` (a swap when `to` already has one). */
    moves: z
      .array(z.object({ from: z.enum(WEEKDAYS_EN), to: z.enum(WEEKDAYS_EN) }).refine((m) => m.from !== m.to, { message: 'from and to must differ' }))
      .max(3)
      .optional(),
    /** Strength days per week (the advisor arranges them by the schedule rules). */
    strengthDays: z.number().int().min(1).max(6).optional(),
  })
  .refine((v) => (v.moves?.length ?? 0) > 0 || typeof v.strengthDays === 'number', { message: 'give moves or strengthDays' })
  .refine((v) => !((v.moves?.length ?? 0) > 0 && typeof v.strengthDays === 'number'), { message: 'moves or strengthDays, not both' });
export type ProposeScheduleChangeInputT = z.infer<typeof ProposeScheduleChangeInput>;

export type ProposalStatus = 'pending' | 'applying' | 'applied' | 'dismissed';

/** Stored on the assistant message as `proposal` (server writes only). */
export interface StoredProposal {
  id: string;
  status: ProposalStatus;
  scope: SaveScope;
  /** Hebrew: "הצעה לשינוי בלו״ז השבוע". */
  title: string;
  /** Hebrew, one line per changed day. */
  lines: string[];
  /** What the executor writes (scheduleBuilderSave.plan.ts). Strength only: running is never touched. */
  plan: SchedulePlan;
  /** The schedule the proposal was built on; a changed schedule makes it stale. */
  fingerprint: string;
  createdAtMs: number;
  expiresAtMs: number;
  claimedAtMs?: number;
  appliedAtMs?: number;
}

/** What the app renders (no plan, no fingerprint). */
export interface ProposalView {
  id: string;
  status: ProposalStatus;
  scope: SaveScope;
  title: string;
  lines: string[];
}

export function proposalView(p: Pick<StoredProposal, 'id' | 'status' | 'scope' | 'title' | 'lines'>): ProposalView {
  return { id: p.id, status: p.status, scope: p.scope, title: p.title, lines: [...p.lines] };
}

const STATUSES: readonly ProposalStatus[] = ['pending', 'applying', 'applied', 'dismissed'];

/** A stored message's `proposal` → the view, or null (shape re-checked: never trust the wire). */
export function parseProposalView(raw: unknown): ProposalView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !STATUSES.includes(r.status as ProposalStatus)) return null;
  if (r.scope !== 'this_week' && r.scope !== 'from_now') return null;
  const lines = Array.isArray(r.lines) ? r.lines.filter((l): l is string => typeof l === 'string').slice(0, 8).map((l) => l.slice(0, 120)) : [];
  return { id: r.id, status: r.status as ProposalStatus, scope: r.scope, title: typeof r.title === 'string' ? r.title.slice(0, 80) : '', lines };
}

/** A proposal is valid for a day (Israel); a this-week one also dies with its week. */
export const PROPOSAL_TTL_MS = 24 * 3_600_000;
/** An "applying" claim older than this is considered abandoned (the device died mid-write). */
export const CLAIM_STALE_MS = 2 * 60_000;
