/**
 * AI coach — the compact, PII-free user sheets the server tools return. Pure.
 *
 * Allow-list only: every field below is picked explicitly from the profile. NEVER sent:
 * full name (first name only), email, phone, photo, birth date (an age band instead),
 * coordinates (anchorLat/Lng, commute.workLocation), ids of other people, tokens, tenant /
 * unit / authority ids (a coarse area NAME instead).
 */
import { PROGRAM_NAME_HE } from '@/features/workout-engine/services/coach-note';
import { coachGenderOf, firstNameOf, type CoachGender } from './persona';
import { deriveAssessmentGaps, type AssessmentGap } from './assessment-gaps';
import type { SheetPlan } from './schedule-tools';

export interface RawWorkout {
  date: Date | null;
  workoutType?: unknown;
  category?: unknown;
  /** seconds, as stored on workouts/{id}.duration */
  durationSec?: unknown;
}

export interface RawScheduleEntry {
  date: string;
  type?: unknown;
  programIds?: unknown;
  startTime?: unknown;
  completed?: unknown;
  title?: unknown;
  /** ['strength' | 'cardio' | 'maintenance' | 'walking'] */
  scheduledCategories?: unknown;
  /** Planned run settings ({ goal: { type: 'time', value: minutes } … }). */
  plannedRun?: unknown;
}

export interface SheetWorkout {
  date: string;
  type: string;
  minutes: number;
}

/** generate_workout settings for a planned entry ("בנה את האימון של היום"). */
export interface SheetBuildNow {
  /** Planned minutes when the entry has them; null → the coach picks a sensible default. */
  durationMin: number | null;
  /** Base domains of the entry's program(s); empty → full body / engine decides. */
  domains: string[];
}

export interface SheetScheduleEntry {
  date: string;
  /** Hebrew weekday name ("שני"), derived from `date`. */
  weekday?: string;
  type: string;
  /** Hebrew program names (unknown program ids are left out: never an id in a reply). */
  programs: string[];
  /** What kind of session: strength, cardio, walking, maintenance (null = not stated). */
  kind?: string | null;
  startTime: string | null;
  /** Planned length in minutes, when the entry states one (a planned run with a time goal). */
  plannedMinutes?: number | null;
  completed: boolean;
  title: string | null;
  /** Set on a strength / training entry the coach can build right now. */
  buildNow?: SheetBuildNow | null;
}

export interface SheetPersona {
  /** Hebrew label in the user's grammar ("עובד משרד" / "עובדת משרד"). */
  label: string;
  /** One plain-Hebrew line: who this persona is and what the app does with it. */
  meaning: string;
}

/**
 * Persona id → label (male / female) + meaning. Labels follow the onboarding PersonaStep;
 * the meanings describe the user's routine and say only that the app fits workouts to it.
 */
export const PERSONA_SHEET: Record<string, { male: string; female: string; meaning: string }> = {
  parent: { male: 'אבא', female: 'אמא', meaning: 'הורה עם שגרה עמוסה, אז האפליקציה מתאימה לך אימונים קצרים וגמישים שנכנסים בין הבית לילדים' },
  student: { male: 'סטודנט', female: 'סטודנטית', meaning: 'סטודנט, אז האפליקציה מתאימה לך אימונים גמישים סביב לימודים ומבחנים' },
  pupil: { male: 'תלמיד', female: 'תלמידה', meaning: 'תלמיד, אז האפליקציה מתאימה לך אימונים סביב יום הלימודים' },
  office_worker: { male: 'עובד משרד', female: 'עובדת משרד', meaning: 'עובד במשרד ויושב הרבה, אז האפליקציה מתאימה לך אימונים לפני או אחרי העבודה ותרגילים שאפשר לעשות גם במשרד' },
  military: { male: 'צה״ל', female: 'צה״ל', meaning: 'משרת בצה״ל, בסדיר, בקבע או במילואים, אז האפליקציה מתאימה לך אימונים לשגרה צבאית ולשמירה על כושר' },
  vatikim: { male: 'גיל הזהב', female: 'גיל הזהב', meaning: 'בגיל הזהב, אז האפליקציה מתאימה לך אימונים מתונים ששומרים על כוח, יציבות ותנועה' },
  pro_athlete: { male: 'ספורטאי קצה', female: 'ספורטאית קצה', meaning: 'ספורטאי שמתאמן ברמה גבוהה, אז האפליקציה מתאימה לך אימונים תובעניים' },
};

/** Goal ids → Hebrew (onboarding.goal.* and the selected-goals labels). */
export const GOAL_HE: Record<string, string> = {
  healthy_lifestyle: 'אורח חיים בריא',
  performance_boost: 'שיפור ביצועים',
  weight_loss: 'ירידה במשקל',
  skill_mastery: 'שליטה במיומנויות',
  glutes_abs: 'חיטוב ישבן ובטן',
  skills: 'שיפור טכניקה',
  mass_building: 'בניית מסה',
  fat_loss: 'ירידה בשומן',
};

export function goalsHebrew(mainGoal: unknown, selected: unknown): string[] {
  const ids = [typeof mainGoal === 'string' ? mainGoal : null, ...(Array.isArray(selected) ? selected : [])];
  const out: string[] = [];
  for (const id of ids) {
    const he = typeof id === 'string' ? GOAL_HE[id] : undefined;
    if (he && !out.includes(he)) out.push(he);
  }
  return out.slice(0, 5);
}

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** Sign-up training days: lifestyle.scheduleDays (Hebrew letters) or the recurring template's non-empty days. */
export function trainingDaysOf(life: Record<string, unknown>): string[] {
  const letters = new Set<string>();
  if (Array.isArray(life.scheduleDays)) for (const d of life.scheduleDays) if (typeof d === 'string') letters.add(d.trim());
  const tpl = life.recurringTemplate;
  if (letters.size === 0 && tpl && typeof tpl === 'object') {
    for (const [k, v] of Object.entries(tpl as Record<string, unknown>)) if (Array.isArray(v) && v.length > 0) letters.add(k);
  }
  return DAY_LETTERS.map((l, k) => (letters.has(l) ? WEEKDAY_NAMES_HE[k] : null)).filter((x): x is (typeof WEEKDAY_NAMES_HE)[number] => !!x);
}

export function sheetPersonas(raw: unknown, gender: CoachGender): SheetPersona[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetPersona[] = [];
  for (const p of raw) {
    const id = (p as { id?: unknown } | null)?.id;
    const def = typeof id === 'string' ? PERSONA_SHEET[id] : undefined;
    if (!def || out.some((x) => x.meaning === def.meaning)) continue;
    out.push({ label: gender === 'female' ? def.female : def.male, meaning: def.meaning });
  }
  return out.slice(0, 4);
}

export interface UserContextSheet {
  firstName: string;
  gender: CoachGender;
  ageBand: string | null;
  goals: { mainGoal: string | null; selected: string[] };
  primaryTrack: string | null;
  programs: Array<{ id: string; name: string | null; level: number; percentToNext: number | null }>;
  injuries: string[];
  streakDays: number | null;
  lastWorkouts: SheetWorkout[];
  today: SheetScheduleEntry[];
  thisWeek: SheetScheduleEntry[];
  preferredTrainingTime: string | null;
  equipment: { home: string[]; office: string[]; outdoor: string[] };
  area: string | null;
  /**
   * The persona(s) the user picked at sign-up (users/{uid}.personas, ids only: the answers,
   * e.g. a military unit, are never read). Hebrew label + what it means, in plain words, so
   * Kelly can answer "מה הפרסונה שלי?". Absent on sheets built before this field existed.
   */
  personas?: SheetPersona[];
  /** Main goal + selected goals in Hebrew ("אורח חיים בריא", "בניית מסה"). Absent on older sheets. */
  goalsHe?: string[];
  /** Weekdays the user said they train on (Hebrew names, from the sign-up schedule). */
  trainingDays?: string[];
  /** The daily step goal (progression.dailyStepGoal), null when unset. */
  dailyStepGoal?: number | null;
  /**
   * Programs the user trains (or whose parent they train) but never checked a level for:
   * the progress tab's "עוד לא בדקת רמה". Kelly may suggest the mini level check once.
   * Absent on sheets built before this field existed.
   */
  assessmentGaps?: AssessmentGap[];
  /**
   * Schedule advisor (only with ai_coach_schedule_advisor): recurring strength weekdays, the
   * running plan's current week, today's mode + the one makeup on offer (never a list of
   * misses), whether today's session is already done, WHO weekly targets so far.
   */
  plan?: SheetPlan;
}

const str = (v: unknown, max = 40): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strList = (v: unknown, cap: number, max = 40): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, cap) : [];

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export function ageBandOf(birthDate: unknown, now: Date): string | null {
  const d = toDate(birthDate);
  if (!d) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  if (age < 18) return null; // the gate already requires adult; never echo a minor's age
  if (age < 30) return '18-29';
  if (age < 45) return '30-44';
  if (age < 60) return '45-59';
  return '60+';
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function programName(id: string): string | null {
  return PROGRAM_NAME_HE[id] ?? null;
}

export function sheetWorkout(w: RawWorkout): SheetWorkout | null {
  if (!w.date) return null;
  const sec = num(w.durationSec) ?? 0;
  return {
    date: isoDay(w.date),
    type: str(w.workoutType) ?? str(w.category) ?? 'workout',
    minutes: Math.round(sec / 60),
  };
}

export const WEEKDAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export function weekdayOfKey(isoDayKey: string): string | undefined {
  const t = Date.parse(`${isoDayKey}T12:00:00Z`);
  return Number.isFinite(t) ? WEEKDAY_NAMES_HE[new Date(t).getUTCDay()] : undefined;
}

/** Program id → the base domains generate_workout takes. Unknown ids → none. */
const PROGRAM_DOMAINS: Record<string, string[]> = {
  push: ['push'],
  pull: ['pull'],
  legs: ['legs'],
  core: ['core'],
  upper_body: ['push', 'pull'],
  calisthenics_upper: ['push', 'pull'],
  lower_body: ['legs'],
  full_body: [],
};

function plannedMinutesOf(e: RawScheduleEntry): number | null {
  const goal = (e.plannedRun as { goal?: { type?: unknown; value?: unknown } } | undefined)?.goal;
  if (goal?.type === 'time' && typeof goal.value === 'number' && goal.value > 0 && goal.value <= 600) return Math.round(goal.value);
  return null;
}

function kindOf(e: RawScheduleEntry): string | null {
  const cats = strList(e.scheduledCategories, 4, 20);
  if (e.plannedRun) return 'cardio';
  for (const k of ['strength', 'cardio', 'walking', 'maintenance']) if (cats.includes(k)) return k;
  return null;
}

export function sheetScheduleEntry(e: RawScheduleEntry): SheetScheduleEntry {
  const ids = strList(e.programIds, 6, 60);
  const type = str(e.type) ?? 'training';
  const kind = kindOf(e);
  const plannedMinutes = plannedMinutesOf(e);
  const completed = e.completed === true;
  // Only a strength-style session can be built by generate_workout (runs and walks can't).
  const buildable = type === 'training' && !completed && (kind === null || kind === 'strength');
  const domains = Array.from(new Set(ids.flatMap((id) => PROGRAM_DOMAINS[id] ?? [])));
  return {
    date: e.date,
    weekday: weekdayOfKey(e.date),
    type,
    programs: ids.map((id) => programName(id)).filter((x): x is string => !!x),
    kind,
    startTime: str(e.startTime, 5),
    plannedMinutes,
    completed,
    title: str(e.title, 60),
    buildNow: buildable
      ? { durationMin: plannedMinutes !== null ? Math.min(90, Math.max(5, plannedMinutes)) : null, domains }
      : null,
  };
}

export interface BuildSheetInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  profile: Record<string, any>;
  workouts: RawWorkout[];
  /** Entries for the Sunday-anchored week containing today. */
  weekSchedule: RawScheduleEntry[];
  todayKey: string;
  areaName: string | null;
  now: Date;
  /** Raw program id → slug, for the assessment gaps. Default: identity. */
  resolveSlug?: (id: string) => string;
  /** Parent slug → subPrograms (slug space), for the assessment gaps. */
  subProgramsBySlug?: Readonly<Record<string, readonly string[]>>;
  /** Schedule advisor plan section (flag on only). */
  plan?: SheetPlan;
  /**
   * Derived "done" for today (bug #8, flag on only): nothing ever marks a recurring strength
   * entry completed, so a strength / run WORKOUT logged today marks today's matching
   * entries done here — no "build today's workout" after it was already trained.
   */
  doneToday?: { strength: boolean; run: boolean };
}

export function buildUserContextSheet(i: BuildSheetInput): UserContextSheet {
  const p = i.profile ?? {};
  const core = p.core ?? {};
  const prog = p.progression ?? {};
  const life = p.lifestyle ?? {};
  const eq = p.equipment ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  const tracks = prog.tracks && typeof prog.tracks === 'object' ? (prog.tracks as Record<string, any>) : {};
  // Track keys may be raw program doc ids: resolve them to a slug for the Hebrew name.
  const nameOf = (id: string): string | null => {
    if (programName(id)) return programName(id);
    try {
      return i.resolveSlug ? programName(i.resolveSlug(id)) : null;
    } catch {
      return null;
    }
  };
  const programs = Object.keys(tracks)
    .sort()
    .map((id) => ({
      id,
      name: nameOf(id),
      level: num(tracks[id]?.currentLevel) ?? 0,
      percentToNext: num(tracks[id]?.percent),
    }))
    // A program with no Hebrew name (a raw Firestore id) can't be named to the user: owner
    // review 18.10.2026, "יש גם שתי תוכניות ברמות 21 ו-15 בלי שם מוגדר". Left out.
    .filter((x) => x.level > 0 && !!x.name)
    // A raw id and its slug key can both exist: one line per program name (the higher level).
    .filter((x, k, all) => !all.some((y, j) => y.name === x.name && (y.level > x.level || (y.level === x.level && j < k))))
    // The cap applies AFTER the filter (owner sheet: 13 tracks, raw ids sorted first, so the
    // named ones were cut).
    .slice(0, 10);

  const week = i.weekSchedule.map(sheetScheduleEntry).map((e) => {
    if (!i.doneToday || e.date !== i.todayKey || e.completed || e.type !== 'training') return e;
    const done = e.kind === 'cardio' ? i.doneToday.run : e.kind === 'walking' || e.kind === 'maintenance' ? false : i.doneToday.strength;
    return done ? { ...e, completed: true, buildNow: null } : e;
  });

  const gender = coachGenderOf(core.gender);
  return {
    firstName: firstNameOf(core.name),
    gender,
    ageBand: ageBandOf(core.birthDate, i.now),
    goals: { mainGoal: str(core.mainGoal), selected: strList(p.selectedGoals, 5) },
    primaryTrack: str(life.primaryTrack),
    programs,
    injuries: strList(p.health?.injuries, 10),
    streakDays: num(prog.currentStreak),
    lastWorkouts: i.workouts.map(sheetWorkout).filter((x): x is SheetWorkout => !!x).slice(0, 5),
    today: week.filter((e) => e.date === i.todayKey),
    thisWeek: week,
    preferredTrainingTime: str(life.trainingTime, 5) ?? str(life.reminders?.strengthTime, 5),
    equipment: {
      home: strList(eq.home, 20, 64),
      office: strList(eq.office, 20, 64),
      outdoor: strList(eq.outdoor, 20, 64),
    },
    area: str(i.areaName),
    personas: sheetPersonas(p.personas, gender),
    goalsHe: goalsHebrew(core.mainGoal, p.selectedGoals),
    trainingDays: trainingDaysOf(life),
    dailyStepGoal: num(prog.dailyStepGoal),
    assessmentGaps: deriveAssessmentGaps({ profile: p, resolveSlug: i.resolveSlug, subProgramsBySlug: i.subProgramsBySlug }),
    ...(i.plan ? { plan: i.plan } : {}),
  };
}

// ─── get_progress ────────────────────────────────────────────────────────────

export type ProgressRange = 'week' | 'month' | 'quarter';
export const RANGE_DAYS: Record<ProgressRange, number> = { week: 7, month: 30, quarter: 90 };

export interface ProgressSummary {
  range: ProgressRange;
  days: number;
  workouts: number;
  totalMinutes: number;
  activeDays: number;
  byType: Record<string, { workouts: number; minutes: number }>;
  programs: UserContextSheet['programs'];
  streakDays: number | null;
  /** Programs without a level yet (mention briefly when relevant). */
  assessmentGaps: AssessmentGap[];
}

export function summarizeProgress(
  range: ProgressRange,
  workouts: RawWorkout[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  profile: Record<string, any>,
  now: Date,
  programIndex?: Pick<BuildSheetInput, 'resolveSlug' | 'subProgramsBySlug'>,
): ProgressSummary {
  const sheet = buildUserContextSheet({ profile, workouts: [], weekSchedule: [], todayKey: '', areaName: null, now, ...programIndex });
  const rows = workouts.map(sheetWorkout).filter((x): x is SheetWorkout => !!x);
  const byType: ProgressSummary['byType'] = {};
  for (const r of rows) {
    const b = (byType[r.type] ??= { workouts: 0, minutes: 0 });
    b.workouts++;
    b.minutes += r.minutes;
  }
  return {
    range,
    days: RANGE_DAYS[range],
    workouts: rows.length,
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    activeDays: new Set(rows.map((r) => r.date)).size,
    byType,
    programs: sheet.programs,
    streakDays: sheet.streakDays,
    assessmentGaps: sheet.assessmentGaps ?? [],
  };
}

/** Every 'YYYY-MM-DD' from..to inclusive (UTC day arithmetic on date keys). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 31; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Sunday-anchored week (7 date keys) containing todayKey, given today's weekday (0 = Sunday). */
export function weekKeys(todayKey: string, dayOfWeek: number): string[] {
  const start = Date.parse(`${todayKey}T00:00:00Z`) - dayOfWeek * 86_400_000;
  return Array.from({ length: 7 }, (_, k) => new Date(start + k * 86_400_000).toISOString().slice(0, 10));
}
