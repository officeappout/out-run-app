/**
 * push-catalog.service — single source of truth for which real push
 * sender/channel/source combinations exist in `functions/src`, which are
 * deployed, and which are measured (write `push_sent` to `push_events`).
 *
 * Extracted from `admin/notifications/page.tsx` (07.10.2026,
 * push-performance instrumentation) so that page AND the new
 * `/admin/journey` Push Performance tab both read ONE list instead of two
 * hand-maintained copies that can silently drift apart — exactly the kind
 * of duplication the 06.10.2026 push tidy-up (PR #170) exists to find and
 * fix. The data below is verbatim from that PR's `CATALOG`, confirmed by
 * grepping every real `sendPush()` call site in `functions/src` — not
 * guessed or re-derived.
 *
 * Deliberately NO React/icon imports here — this module is imported from a
 * server-side API route (`push-performance-summary`) as well as client
 * components. Icon/color choices are presentation-only and stay local to
 * `admin/notifications/page.tsx`'s own `CHANNEL_UI` map.
 *
 * 07.10.2026 follow-up: added the 15th real push type,
 * `onContributionApproved.ts` (channel `contribution_status`) — found
 * during the push-performance investigation, missing from PR #170's
 * original catalog. Catalog entry only, same as every other entry here.
 */

export type ChannelKey =
  | 'progression'
  | 'retention'
  | 'onboarding_dropoff'
  | 'training_reminder'
  | 'encouragement'
  | 'social'
  | 'chat'
  | 'health_milestone'
  | 'community'
  | 'contribution_status';

export interface CatalogSource {
  label: string;
  trigger: string;
  /** Writes a push_sent event to push_events (funnel-measured). */
  measured: boolean;
  /** push_events.category value to sum for this source, when measured. */
  funnelCategory?: string;
  note?: string;
}

export interface CatalogEntry {
  channel: ChannelKey;
  label: string;
  type: 'auto' | 'manual';
  /** Single-source entries only — omit when `sources` is set. */
  trigger?: string;
  /** Multi-source entries only (see module header). */
  sources?: CatalogSource[];
  templateVars?: string[];
  defaultTitle?: string;
  defaultBody?: string;
  rateCapHours?: number;
  deployed: boolean;
  /** Single-source measurement — ignored when `sources` is set. */
  measured?: boolean;
  funnelCategory?: string;
  /**
   * True for the 3 senders confirmed (04.10.2026 audit) to still call FCM
   * directly instead of routing through push.service.ts in their default
   * code path — the per-channel enable toggle in notification_configs
   * writes either way, but isn't guaranteed to be read by these specific
   * senders yet (tracked separately as the `pushRouting_*` migration
   * flags, not part of this catalog).
   */
  bypassesPushService?: boolean;
  note?: string;
}

export const PUSH_CATALOG: CatalogEntry[] = [
  {
    channel: 'progression',
    label: 'עליית רמה',
    type: 'auto',
    trigger: 'onChange users/{uid}.progression.globalLevel',
    templateVars: ['{level}'],
    defaultTitle: 'עלית לרמה {level}! 🎉',
    defaultBody: 'המשיכו כך — כל אימון מקדם אתכם!',
    rateCapHours: 24,
    deployed: true,
    measured: false,
  },
  {
    channel: 'retention',
    label: 'חזרה לשגרה',
    type: 'auto',
    trigger: 'Scheduler — כל יום 10:00',
    templateVars: ['{name}', '{days_since}'],
    defaultTitle: '{name}, {days_since} ימים בלי אימון',
    defaultBody: 'הגוף שלך מחכה לך. אפילו 15 דקות ישנו את מצב הרוח שלך.',
    rateCapHours: 48,
    deployed: true,
    measured: false,
  },
  {
    channel: 'onboarding_dropoff',
    label: 'נשירת הרשמה',
    type: 'auto',
    trigger: 'Scheduler — כל 30 דקות',
    deployed: true,
    measured: false,
    bypassesPushService: true,
  },
  {
    channel: 'training_reminder',
    label: 'תזכורת אימון',
    type: 'auto',
    rateCapHours: 22,
    deployed: true,
    sources: [
      {
        label: 'תזכורת קבועה יומית',
        trigger: 'Scheduler — כל יום 07:30 (trainingReminderScheduler)',
        measured: true,
        funnelCategory: 'ScheduledWorkout',
      },
      {
        label: 'משבצת אישית שהוגדרה בהגדרות',
        trigger: 'Sweep כל 5 דק\' — slot שהמשתמש קבע (reminderSweepScheduler, pass 1)',
        measured: true,
        funnelCategory: 'ReminderSweep',
      },
      {
        label: 'לפני אימון מתוזמן (~10 דק\')',
        trigger: 'Sweep כל 5 דק\' — startTime מדויק מ-userSchedule (reminderSweepScheduler, pass 2, נוסף 06.10.2026)',
        measured: true,
        funnelCategory: 'ReminderSweepWorkout',
        note: 'דגל reminderSweepWorkoutEntriesEnabled הודלק 06.10.2026 — טרם אומת שליחה אמיתית',
      },
    ],
  },
  {
    channel: 'encouragement',
    label: 'עידוד מהעירייה',
    type: 'manual',
    trigger: 'שליחה ידנית מהפאנל',
    deployed: true,
    bypassesPushService: true,
  },
  {
    channel: 'social',
    label: 'פעילות חברתית — קודוס והצטרפות לקבוצה',
    type: 'auto',
    rateCapHours: 24,
    deployed: true,
    sources: [
      {
        label: 'קודוס שהתקבל',
        trigger: 'onCreate — קודוס חדש (onKudosCreated)',
        measured: false,
      },
      {
        label: 'ברוכים הבאים לקבוצה',
        trigger: 'onCreate community_groups/{groupId}/members/{uid} (onGroupMemberJoin)',
        measured: false,
      },
      {
        label: 'התראת מנהל קבוצה',
        trigger: 'אותו טריגר — להתראת המנהל (onGroupMemberJoin)',
        measured: false,
      },
    ],
  },
  {
    channel: 'chat',
    label: 'הודעה בצ\'אט',
    type: 'auto',
    trigger: 'onCreate chats/{chatId}/messages',
    deployed: true,
    measured: false,
    bypassesPushService: true,
    note: 'תוכן נגזר מהודעה עצמה',
  },
  {
    channel: 'health_milestone',
    label: 'תזכורת יעד צעדים',
    type: 'auto',
    trigger: 'Scheduler — כל יום 18:00 (stepGoalNudgeScheduler)',
    deployed: true,
    measured: true,
    funnelCategory: 'Daily_Goal',
    note: 'לפי נתוני 04.10.2026 הייתה מוגבלת ל-uid בדיקה יחיד (feature_flags.stepGoalTestUids) — יש לאמת מול Firestore אם זה עדיין המצב',
  },
  {
    channel: 'community',
    label: 'פעילות קרובה (SOCIAL — "מישהו מתאמן לידך")',
    type: 'auto',
    trigger: 'onCreate planned_sessions/{sessionId} (onPlannedActivityCreated)',
    rateCapHours: 2,
    deployed: true,
    measured: true,
    funnelCategory: 'Future_Partner_Plan',
    note: 'דגל feature_flags.socialActivityNearbyPushEnabled — ערך חי לא אומת בסשן האודיט האחרון',
  },
  {
    channel: 'contribution_status',
    label: 'אישור תרומת מיקום',
    type: 'auto',
    trigger: 'onUpdate user_contributions/{id} — status→approved, type:\'new_location\' בלבד (onContributionApproved)',
    rateCapHours: 0,
    deployed: true,
    measured: false,
  },
];

/**
 * Normalizes any catalog entry to its real source list — a single-source
 * entry (no `sources` array) becomes a 1-item list built from its own
 * top-level fields, so callers never need to branch on which shape an
 * entry used.
 */
export function getCatalogSources(entry: CatalogEntry): CatalogSource[] {
  if (entry.sources) return entry.sources;
  return [{
    label: entry.label,
    trigger: entry.trigger ?? '',
    measured: entry.measured ?? false,
    funnelCategory: entry.funnelCategory,
    note: entry.note,
  }];
}

export interface FlatPushSource {
  channel: ChannelKey;
  entryLabel: string;
  source: CatalogSource;
}

export const ALL_PUSH_SOURCES: FlatPushSource[] = PUSH_CATALOG.flatMap((entry) =>
  getCatalogSources(entry).map((source) => ({ channel: entry.channel, entryLabel: entry.label, source })),
);

/**
 * Real total push-type count today — replaces the old hardcoded "12"
 * PushFunnelSection.tsx used to show (stale well before this file existed;
 * it predates the 2 reminderSweepScheduler sources entirely — see
 * `.claude/knowledge/push-notifications-audit-2026-10-04.md`).
 */
export const TOTAL_PUSH_TYPE_COUNT = ALL_PUSH_SOURCES.length;

/**
 * push_events.category values that are actually measured today — the only
 * categories a push_sent/post_push_outcome row could ever carry. Used to
 * tell "known type, genuinely has no data yet" apart from "a category
 * appeared in push_events that isn't in this catalog at all" (a drift
 * signal worth surfacing, not silently absorbing).
 */
export const MEASURED_FUNNEL_CATEGORIES = ALL_PUSH_SOURCES
  .filter((s) => s.source.measured && s.source.funnelCategory)
  .map((s) => s.source.funnelCategory!);

/** Reverse lookup: push_events.category → which catalog source it belongs to. */
export const CATEGORY_TO_SOURCE: Record<string, FlatPushSource> = Object.fromEntries(
  ALL_PUSH_SOURCES
    .filter((s) => s.source.measured && s.source.funnelCategory)
    .map((s) => [s.source.funnelCategory!, s]),
);
