/**
 * Journey → "הצטרפות והפעלה" additions (pure, unit-tested):
 *   1. where onboarding stalls — signups in range still mid-onboarding,
 *      grouped by the step they're on now (the app doesn't emit per-step
 *      events, so this is a current snapshot of users.onboardingStep)
 *   2. the road to the first workout — of signups in range, how many
 *      reached each step within their first 7 days (analytics_events)
 *   3. who to nudge — finished onboarding ≥3 days ago and never trained
 */

export const FIRST_WEEK_DAYS = 7;
export const NUDGE_AFTER_DAYS = 3;

export const STEP_LABELS: Record<string, string> = {
  PERSONA: 'בחירת מטרה',
  PERSONAL_STATS: 'פרטים אישיים',
  LOCATION: 'מיקום',
  EQUIPMENT: 'ציוד',
  SCHEDULE: 'לוח זמנים',
  HEALTH_DECLARATION: 'הצהרת בריאות',
  ACCOUNT_SECURE: 'אבטחת חשבון',
  PROCESSING: 'עיבוד',
  ACCESS_CODE: 'קוד גישה',
  HISTORY: 'היסטוריה',
  SOCIAL_MAP: 'מפה חברתית',
  COMMUNITY: 'קהילה',
  SUMMARY: 'סיכום',
  ASSESSMENT: 'הערכה',
  IDENTITY: 'פרופיל',
};

/** the road to the first workout, in order */
export const FIRST_WORKOUT_STEPS: { event: string; label: string }[] = [
  { event: 'recommendation_shown', label: 'ראו המלצה לאימון' },
  { event: 'workout_detail_viewed', label: 'נכנסו לאימון' },
  { event: 'workout_start_pressed', label: 'לחצו "התחל"' },
  { event: 'workout_session_started', label: 'האימון התחיל' },
  { event: 'workout_complete', label: 'סיימו אימון' },
];

export interface ActivationUser {
  uid: string;
  name: string;
  createdAt: Date;
  onboardingStatus: string | null; // 'ONBOARDING' | 'COMPLETED' | …
  onboardingStep: string | null;
  onboardingCompletedAt: Date | null;
  hasRealWorkout: boolean;
}

export interface ActivationEvent {
  userId: string;
  eventName: string;
  at: Date;
  status?: string | null; // permission_location_status
}

export interface JourneyActivationResponse {
  signups: number;
  stuck: { step: string; label: string; count: number }[];
  stuckTotal: number;
  firstWorkout: { event: string; label: string; users: number }[];
  locationPermission: { granted: number; denied: number };
  nudge: { count: number; sample: { uid: string; name: string; daysSince: number }[] };
}

const DAY = 24 * 60 * 60 * 1000;

export function aggregateJourneyActivation(
  users: ActivationUser[],
  events: ActivationEvent[],
  now = new Date(),
): JourneyActivationResponse {
  // 1. stuck mid-onboarding
  const stuckMap = new Map<string, number>();
  for (const u of users) {
    if (u.onboardingStatus === 'COMPLETED' || u.onboardingStep === 'COMPLETED') continue;
    const step = u.onboardingStep || 'UNKNOWN';
    stuckMap.set(step, (stuckMap.get(step) ?? 0) + 1);
  }
  const stuck = Array.from(stuckMap.entries())
    .map(([step, count]) => ({ step, label: STEP_LABELS[step] ?? (step === 'UNKNOWN' ? 'לא ידוע' : step), count }))
    .sort((a, b) => b.count - a.count);

  // 2. first-week road to the first workout (distinct users per step)
  const createdBy = new Map(users.map((u) => [u.uid, u.createdAt]));
  const reached = new Map<string, Set<string>>(FIRST_WORKOUT_STEPS.map((s) => [s.event, new Set()]));
  let granted = 0;
  let denied = 0;
  const permissionSeen = new Set<string>();
  for (const e of events) {
    const created = createdBy.get(e.userId);
    if (!created) continue;
    const ms = e.at.getTime() - created.getTime();
    if (ms < 0 || ms > FIRST_WEEK_DAYS * DAY) continue;
    reached.get(e.eventName)?.add(e.userId);
    if (e.eventName === 'permission_location_status' && !permissionSeen.has(e.userId) && (e.status === 'granted' || e.status === 'denied')) {
      permissionSeen.add(e.userId);
      if (e.status === 'granted') granted += 1;
      else denied += 1;
    }
  }

  // 3. finished onboarding, no real workout, ≥ NUDGE_AFTER_DAYS
  const nudgeUsers = users
    .filter((u) => (u.onboardingStatus === 'COMPLETED' || u.onboardingStep === 'COMPLETED') && !u.hasRealWorkout)
    .map((u) => ({ u, since: u.onboardingCompletedAt ?? u.createdAt }))
    .filter(({ since }) => now.getTime() - since.getTime() >= NUDGE_AFTER_DAYS * DAY)
    .map(({ u, since }) => ({ uid: u.uid, name: u.name, daysSince: Math.floor((now.getTime() - since.getTime()) / DAY) }))
    .sort((a, b) => a.daysSince - b.daysSince); // freshest first — the easiest to win back

  return {
    signups: users.length,
    stuck,
    stuckTotal: stuck.reduce((s, x) => s + x.count, 0),
    firstWorkout: FIRST_WORKOUT_STEPS.map((s) => ({ ...s, users: reached.get(s.event)!.size })),
    locationPermission: { granted, denied },
    nudge: { count: nudgeUsers.length, sample: nudgeUsers.slice(0, 15) },
  };
}
