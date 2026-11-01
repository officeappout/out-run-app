/**
 * crm-timeline.server — one authority's CRM history, for get_crm_authority_timeline.
 *
 * What the CRM really stores (production, 22.10.2026): on authorities/{id}
 *   pipelineStatus   the CURRENT status only (missing = lead). There is NO status-history field.
 *   activityLog[]    231 authorities have one: { type: meeting|email|call|note|task|quote|demo,
 *                    date | createdAt, summary | content | note, gmailUrl? } — shapes vary by writer
 *   tasks[]          { title, status: open|pending|done, dueDate?, createdAt, assignedToName? }
 *   contacts[]       reported as a COUNT only (names / phones / emails are personal data)
 * "Next step" = the open tasks (nothing else is stored). READ-ONLY: isActiveClient is reported,
 * never written (axiom §6). Dates may be Firestore Timestamps (axiom §31) — normalised by toDate().
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from '@/types/admin-types';
import { getIsraelDateKey } from '@/lib/israelTime';
import { authorityNameOf } from './authority-names.server';
import { metaOf, type MetricResult } from './meta';
import { readAuthorityWithCrm } from '@/features/admin/services/authority-crm.server';

export const TIMELINE_ENTRIES_MAX = 8;
export const TIMELINE_TASKS_MAX = 5;
const SUMMARY_MAX = 160;
const CONTACT_TYPES = new Set(['email', 'call', 'meeting']);

export interface TimelineEntry {
  date: string | null;
  type: string;
  summary: string;
}

export interface TimelineTask {
  title: string;
  status: string;
  dueDate: string | null;
}

export interface CrmTimeline {
  authority: { id: string; name: string; type: string | null };
  pipelineStatus: string;
  pipelineLabel: string | null;
  /** READ-ONLY report of the stored flag (axiom §6) */
  isActiveClient: boolean;
  activity: {
    total: number;
    /** newest first */
    recent: TimelineEntry[];
    lastActivityDate: string | null;
    lastEmailDate: string | null;
    lastMeetingDate: string | null;
    lastCallDate: string | null;
    /** days since the latest email / call / meeting (null = none logged) */
    daysSinceLastContact: number | null;
  };
  tasks: { open: number; done: number; nextSteps: TimelineTask[] };
  contactsCount: number;
}

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object') {
    const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof o.toDate === 'function') {
      const d = o.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    const s = typeof o.seconds === 'number' ? o.seconds : typeof o._seconds === 'number' ? o._seconds : null;
    if (s !== null) return new Date(s * 1000);
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const clip = (s: string) => (s.length > SUMMARY_MAX ? `${s.slice(0, SUMMARY_MAX - 1)}…` : s);

/** Pure: raw authority doc → timeline. */
export function buildCrmTimeline(id: string, a: Record<string, unknown>, now: Date): CrmTimeline {
  const rawStatus = typeof a.pipelineStatus === 'string' && a.pipelineStatus ? a.pipelineStatus : 'lead';
  const log = (Array.isArray(a.activityLog) ? a.activityLog : []).flatMap((e) => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    const text = [o.summary, o.content, o.note].find((t) => typeof t === 'string' && t.trim()) as string | undefined;
    return [{ type: typeof o.type === 'string' ? o.type : 'note', at: toDate(o.date) ?? toDate(o.createdAt) ?? toDate(o.addedAt), summary: clip((text ?? '').trim()) }];
  });
  // undated entries sort last; the rest newest first
  log.sort((x, y) => (y.at?.getTime() ?? -Infinity) - (x.at?.getTime() ?? -Infinity));
  const lastOf = (pred: (t: string) => boolean) => log.find((e) => pred(e.type) && e.at)?.at ?? null;
  const lastContact = lastOf((t) => CONTACT_TYPES.has(t));

  const tasksRaw = (Array.isArray(a.tasks) ? a.tasks : []).filter((t): t is Record<string, unknown> => !!t && typeof t === 'object');
  const isDone = (t: Record<string, unknown>) => t.status === 'done';
  const open = tasksRaw.filter((t) => !isDone(t));
  const withDue = (t: Record<string, unknown>) => toDate(t.dueDate);
  // earliest due date first; tasks without a due date after them, newest created first
  open.sort((x, y) => {
    const dx = withDue(x)?.getTime() ?? Infinity;
    const dy = withDue(y)?.getTime() ?? Infinity;
    if (dx !== dy) return dx - dy;
    return (toDate(y.createdAt)?.getTime() ?? 0) - (toDate(x.createdAt)?.getTime() ?? 0);
  });

  return {
    authority: { id, name: authorityNameOf(a.name) ?? id, type: typeof a.type === 'string' ? a.type : null },
    pipelineStatus: rawStatus,
    pipelineLabel: PIPELINE_STATUS_LABELS[rawStatus as PipelineStatus] ?? null,
    isActiveClient: a.isActiveClient === true,
    activity: {
      total: log.length,
      recent: log.slice(0, TIMELINE_ENTRIES_MAX).map((e) => ({ date: day(e.at), type: e.type, summary: e.summary })),
      lastActivityDate: day(log.find((e) => e.at)?.at ?? null),
      lastEmailDate: day(lastOf((t) => t === 'email')),
      lastMeetingDate: day(lastOf((t) => t === 'meeting')),
      lastCallDate: day(lastOf((t) => t === 'call')),
      daysSinceLastContact: lastContact ? Math.max(0, Math.floor((now.getTime() - lastContact.getTime()) / 86_400_000)) : null,
    },
    tasks: {
      open: open.length,
      done: tasksRaw.filter(isDone).length,
      nextSteps: open.slice(0, TIMELINE_TASKS_MAX).map((t) => ({
        title: clip(typeof t.title === 'string' ? t.title.trim() : ''),
        status: typeof t.status === 'string' ? t.status : 'open',
        dueDate: day(withDue(t)),
      })),
    },
    contactsCount: Array.isArray(a.contacts) ? a.contacts.length : 0,
  };
}

export const CRM_TIMELINE_CAVEATS = [
  'the CRM stores only the CURRENT pipeline status — there is no status history or change dates',
  'the activity log is free text typed by people or the CRM agent; it may be incomplete — no entry does not prove no contact happened',
  'next steps = open tasks (the only forward-looking CRM field); isActiveClient and pipelineStatus are reported as stored (read only)',
];

export async function computeCrmTimeline(db: Firestore, authorityId: string, now: Date): Promise<MetricResult<CrmTimeline> | null> {
  // CRM arrays live in authorities/{id}/crm_private/main (legacy main-doc copy as fallback).
  const data = await readAuthorityWithCrm(db, authorityId);
  if (!data) return null;
  const value = buildCrmTimeline(authorityId, data, now);
  return {
    value,
    meta: metaOf('crm_timeline', { from: null, to: getIsraelDateKey(now) }, {
      n: value.activity.total,
      caveats: [...CRM_TIMELINE_CAVEATS, ...(value.activity.total === 0 && value.tasks.open === 0 ? ['no activity log entries and no tasks are stored for this authority'] : [])],
    }),
  };
}
