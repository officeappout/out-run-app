/**
 * Journey → "מה גורם להישאר" (retention drivers). Pure, unit-tested.
 *
 * Cohort: real users who signed up long enough ago for the retention window
 * to have fully passed. "Retained" = at least one real workout between day
 * RETAIN_FROM and day RETAIN_TO after signup. For each first-week behaviour,
 * compare the retention of users who did it vs. those who didn't.
 *
 * This is correlation, not causation (users who'd stay anyway may also be
 * the ones who join groups) — the UI says so. A behaviour is shown with
 * numbers only when BOTH groups have at least MIN_SAMPLE users.
 */

export const FIRST_WEEK_DAYS = 7;
export const RETAIN_FROM = 14;
export const RETAIN_TO = 28;
export const MIN_SAMPLE = 30;

export type DriverKey =
  | 'trainedInPark'
  | 'trainedWithGroup'
  | 'twoPlusWorkouts'
  | 'fullCompletion'
  | 'setReminder'
  | 'plannedSession'
  | 'joinedGroup'
  | 'pushEnabled'
  | 'invited'
  | 'hasProgram'
  | 'runningUnlocked';

export const DRIVER_LABELS: Record<DriverKey, string> = {
  trainedInPark: 'התאמן בפארק בשבוע הראשון',
  trainedWithGroup: 'התאמן עם קבוצה בשבוע הראשון',
  twoPlusWorkouts: '2 אימונים ומעלה בשבוע הראשון',
  fullCompletion: 'השלים אימון מלא בשבוע הראשון',
  setReminder: 'קבע תזכורת בשבוע הראשון',
  plannedSession: 'תכנן אימון בשבוע הראשון',
  joinedGroup: 'חבר בקבוצה',
  pushEnabled: 'התראות פעילות',
  invited: 'הזמין חבר או הגיע מהזמנה',
  hasProgram: 'רשום לתוכנית אימונים',
  runningUnlocked: 'פתח את הריצה',
};

export interface DriverWorkout {
  at: Date;
  parkId: string | null;
  groupId: string | null;
  setsCompleted: number | null;
  setsPlanned: number | null;
}

export interface DriverUser {
  uid: string;
  createdAt: Date;
  /** real workouts only (isRealWorkoutCompletion), any order */
  workouts: DriverWorkout[];
  reminderSetAt: Date[];
  plannedSessionAt: Date[];
  /** current-state flags (not time-boxed: the data has no history for them) */
  inGroup: boolean;
  pushEnabled: boolean;
  invited: boolean;
  hasProgram: boolean;
  runningUnlocked: boolean;
}

export interface DriverRow {
  key: DriverKey;
  label: string;
  withCount: number;
  withoutCount: number;
  /** % retained among users with / without the behaviour; null below MIN_SAMPLE */
  withPct: number | null;
  withoutPct: number | null;
  /** withPct / withoutPct, 1 decimal; null when not computable */
  lift: number | null;
  enoughData: boolean;
}

export interface RetentionDriversResponse {
  cohortSize: number;
  retainedPct: number | null;
  window: { retainFrom: number; retainTo: number; firstWeekDays: number; minSample: number };
  cohortFrom: string;
  cohortTo: string;
  drivers: DriverRow[];
}

const DAY = 24 * 60 * 60 * 1000;
const inDays = (d: Date, start: Date, fromDay: number, toDay: number) => {
  const ms = d.getTime() - start.getTime();
  return ms >= fromDay * DAY && ms <= toDay * DAY;
};
const pct1 = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function isRetained(u: DriverUser): boolean {
  return u.workouts.some((w) => inDays(w.at, u.createdAt, RETAIN_FROM, RETAIN_TO));
}

export function driverFlags(u: DriverUser): Record<DriverKey, boolean> {
  const week = u.workouts.filter((w) => inDays(w.at, u.createdAt, 0, FIRST_WEEK_DAYS));
  const inWeek = (dates: Date[]) => dates.some((d) => inDays(d, u.createdAt, 0, FIRST_WEEK_DAYS));
  return {
    trainedInPark: week.some((w) => !!w.parkId),
    trainedWithGroup: week.some((w) => !!w.groupId),
    twoPlusWorkouts: week.length >= 2,
    fullCompletion: week.some((w) => w.setsPlanned != null && w.setsPlanned > 0 && (w.setsCompleted ?? 0) >= w.setsPlanned),
    setReminder: inWeek(u.reminderSetAt),
    plannedSession: inWeek(u.plannedSessionAt),
    joinedGroup: u.inGroup,
    pushEnabled: u.pushEnabled,
    invited: u.invited,
    hasProgram: u.hasProgram,
    runningUnlocked: u.runningUnlocked,
  };
}

export function aggregateRetentionDrivers(
  users: DriverUser[],
  cohort: { from: Date; to: Date },
): RetentionDriversResponse {
  const keys = Object.keys(DRIVER_LABELS) as DriverKey[];
  const tally = new Map(keys.map((k) => [k, { w: 0, wr: 0, o: 0, or: 0 }]));
  let retained = 0;

  for (const u of users) {
    const r = isRetained(u);
    if (r) retained += 1;
    const flags = driverFlags(u);
    for (const k of keys) {
      const t = tally.get(k)!;
      if (flags[k]) {
        t.w += 1;
        if (r) t.wr += 1;
      } else {
        t.o += 1;
        if (r) t.or += 1;
      }
    }
  }

  const drivers: DriverRow[] = keys.map((k) => {
    const t = tally.get(k)!;
    const enoughData = t.w >= MIN_SAMPLE && t.o >= MIN_SAMPLE;
    const withPct = enoughData ? pct1(t.wr, t.w) : null;
    const withoutPct = enoughData ? pct1(t.or, t.o) : null;
    const lift = withPct != null && withoutPct != null && withoutPct > 0 ? Math.round((withPct / withoutPct) * 10) / 10 : null;
    return { key: k, label: DRIVER_LABELS[k], withCount: t.w, withoutCount: t.o, withPct, withoutPct, lift, enoughData };
  });

  // strongest first; behaviours without enough data at the bottom
  drivers.sort((a, b) => {
    if (a.enoughData !== b.enoughData) return a.enoughData ? -1 : 1;
    return (b.lift ?? 0) - (a.lift ?? 0);
  });

  return {
    cohortSize: users.length,
    retainedPct: pct1(retained, users.length),
    window: { retainFrom: RETAIN_FROM, retainTo: RETAIN_TO, firstWeekDays: FIRST_WEEK_DAYS, minSample: MIN_SAMPLE },
    cohortFrom: cohort.from.toISOString(),
    cohortTo: cohort.to.toISOString(),
    drivers,
  };
}
