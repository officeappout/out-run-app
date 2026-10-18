/**
 * AI coach — action chips under a Kelly reply. Pure.
 *
 * Owner thread after #434: "מה מצפה לי השבוע? איך אני יודע מה יש לי באימונים" got only
 * counts and no way to SEE the week. A schedule answer now carries a chip that opens the
 * schedule screen (the training planner on /home), and, when today's planned session can
 * be built, a chip that asks Kelly to build it.
 *
 * Level-check chips ("בדוק רמה בליבה"): when the user trains a program they never checked
 * a level for (the sheet's assessmentGaps, same as the progress tab's "עוד לא בדקת רמה"),
 * Kelly suggests it once at a natural moment and the chip starts the existing mini level
 * check (startMiniDomainAssessment → /onboarding-new/assessment-visual, single domain).
 * At most one level-check chip per turn, and not again while a recent reply already
 * carried one (`nudgeAllowed`), except when the engine itself refused a workout for lack
 * of a level (`needsAssessmentDomains`): then the chip IS the way forward.
 *
 * Chips are decided by the server from the turn (deterministic, not by the model) and
 * stored on the assistant message as ids only; the app maps ids to label + target here, so
 * a stored message can never carry an arbitrary link.
 */
import { PROGRAM_NAME_HE } from '@/features/workout-engine/services/coach-note';
import type { UserContextSheet } from './context-sheet';
import { inferProgressQuestion, inferScheduleQuestion } from './intent';
import { ASSESSABLE_SLUGS, ASSESS_CATEGORY_SLUGS, gapForWorkout, isAssessableSlug, type AssessableSlug } from './assessment-gaps';

export type CheckLevelActionId = `check_level_${AssessableSlug}`;
export type CoachActionId = 'open_schedule' | 'build_today' | 'open_builder' | CheckLevelActionId;

export const CHECK_LEVEL_PREFIX = 'check_level_';

export function checkLevelActionId(slug: AssessableSlug): CheckLevelActionId {
  return `${CHECK_LEVEL_PREFIX}${slug}` as CheckLevelActionId;
}

export const COACH_ACTION_IDS: readonly CoachActionId[] = ['open_schedule', 'build_today', 'open_builder', ...ASSESSABLE_SLUGS.map(checkLevelActionId)];

/** The schedule screen: /home opens the full-screen training planner on this param. */
export const SCHEDULE_DEEP_LINK = '/home?openPlanner=true';
/**
 * The schedule builder (schedule advisor phase A, flag ai_coach_schedule_advisor): the
 * planner opens with the builder drawer on top — where a recommended week is applied by
 * the user (Kelly never writes a schedule).
 */
export const SCHEDULE_BUILDER_DEEP_LINK = '/home?openPlanner=true&openBuilder=true';

/**
 * The mini level check's page. Not a plain link: startMiniDomainAssessment seeds the single
 * domain + the return path in sessionStorage, then navigates here.
 */
export const MINI_ASSESSMENT_ROUTE = '/onboarding-new/assessment-visual';
/** Where the level check returns to: back to the chat. */
export const AI_COACH_RETURN_PATH = '/ai-coach';

export interface CoachAssessTarget {
  /** Program slug for startMiniDomainAssessment. */
  slug: AssessableSlug;
  /** 'category' = push / pull / legs / core (body_focus path), 'skill' = a skill ladder. */
  domainType: 'category' | 'skill';
  route: typeof MINI_ASSESSMENT_ROUTE;
  returnTo: typeof AI_COACH_RETURN_PATH;
}

export interface CoachActionSpec {
  label: string;
  /** In-app route the chip navigates to. */
  href?: string;
  /** Or: the message the chip sends to Kelly. */
  message?: string;
  /** Or: start the mini level check for one program. */
  assess?: CoachAssessTarget;
}

export function isCheckLevelActionId(id: string): id is CheckLevelActionId {
  return id.startsWith(CHECK_LEVEL_PREFIX) && isAssessableSlug(id.slice(CHECK_LEVEL_PREFIX.length));
}

/** "בדוק רמה בליבה" (the chip talks like the other chips: "פתח את הלו״ז"). */
export function checkLevelLabel(slug: AssessableSlug): string {
  return `בדוק רמה ב${PROGRAM_NAME_HE[slug] ?? slug}`;
}

const CHECK_LEVEL_ACTIONS = Object.fromEntries(
  ASSESSABLE_SLUGS.map((slug): [CheckLevelActionId, CoachActionSpec] => [
    checkLevelActionId(slug),
    {
      label: checkLevelLabel(slug),
      assess: {
        slug,
        domainType: (ASSESS_CATEGORY_SLUGS as readonly string[]).includes(slug) ? 'category' : 'skill',
        route: MINI_ASSESSMENT_ROUTE,
        returnTo: AI_COACH_RETURN_PATH,
      },
    },
  ]),
) as Record<CheckLevelActionId, CoachActionSpec>;

export const COACH_ACTIONS: Record<CoachActionId, CoachActionSpec> = {
  open_schedule: { label: 'פתח את הלו״ז', href: SCHEDULE_DEEP_LINK },
  build_today: { label: 'בנה את האימון של היום', message: 'תבנה לי את האימון של היום' },
  open_builder: { label: 'סדר לי את השבוע', href: SCHEDULE_BUILDER_DEEP_LINK },
  ...CHECK_LEVEL_ACTIONS,
};

/** Every in-app link a chip can open (checked against src/app by a test). */
export const AI_COACH_CHIP_LINKS: readonly string[] = Object.values(COACH_ACTIONS)
  .map((a) => a.href)
  .filter((h): h is string => !!h);

export function isCoachActionId(v: unknown): v is CoachActionId {
  return typeof v === 'string' && (COACH_ACTION_IDS as readonly string[]).includes(v);
}

export interface ChipInput {
  /** The user message this turn answers. */
  userText: string;
  /** Tools called in this turn. */
  toolNames: string[];
  sheet: Pick<UserContextSheet, 'today' | 'assessmentGaps'> | null;
  /** Domains of the workout built this turn (generate_workout input); [] = full body. */
  workoutDomains?: string[] | null;
  /** generate_workout was refused for lack of a level in these domains. */
  needsAssessmentDomains?: string[] | null;
  /** False when a recent reply already suggested a level check (never nag twice). Default true. */
  nudgeAllowed?: boolean;
  /** The first turn of a new conversation (nothing said in the last hours). */
  opening?: boolean;
  /** ai_coach_schedule_advisor is on (adds open_builder; off = exactly today's chips). */
  scheduleAdvisor?: boolean;
  /** recommend_today said today's strength session is already done (derived from workouts). */
  strengthDoneToday?: boolean;
}

/** The level-check chip for this turn, if any (at most one). */
export function checkLevelChipFor(i: ChipInput): CheckLevelActionId | null {
  const refused = (i.needsAssessmentDomains ?? []).find(isAssessableSlug);
  if (refused) return checkLevelActionId(refused);
  if (i.nudgeAllowed === false) return null;
  const gaps = i.sheet?.assessmentGaps ?? [];
  if (gaps.length === 0) return null;
  if (i.toolNames.includes('generate_workout')) {
    const g = gapForWorkout(gaps, i.workoutDomains ?? []);
    return g ? checkLevelActionId(g.slug) : null;
  }
  const aboutProgress = inferProgressQuestion(i.userText) || i.toolNames.includes('get_progress');
  if (aboutProgress || i.opening) return checkLevelActionId(gaps[0].slug);
  return null;
}

/** The chips for a finished turn. A workout turn gets no schedule chips (the card is the action). */
export function chipsForTurn(i: ChipInput): CoachActionId[] {
  const out: CoachActionId[] = [];
  if (!i.toolNames.includes('generate_workout')) {
    const aboutSchedule = inferScheduleQuestion(i.userText) || i.toolNames.includes('get_schedule');
    const recommendedWeek = !!i.scheduleAdvisor && i.toolNames.includes('recommend_week');
    if (aboutSchedule || recommendedWeek) {
      out.push('open_schedule');
      if (!i.strengthDoneToday && (i.sheet?.today ?? []).some((e) => e.buildNow && !e.completed)) out.push('build_today');
    }
    if (recommendedWeek) out.push('open_builder');
  }
  const check = checkLevelChipFor(i);
  if (check) out.push(check);
  return out;
}

/** How long a level-check suggestion keeps Kelly from suggesting it again. */
export const CHECK_LEVEL_NUDGE_COOLDOWN_MS = 3 * 86_400_000;
/** No message in this long → the next turn opens a new conversation. */
export const OPENING_GAP_MS = 6 * 3_600_000;

export interface NudgeHistoryMessage {
  role: 'user' | 'assistant';
  createdAtMs: number;
  actions?: readonly string[];
}

/**
 * From the stored thread: may Kelly suggest a level check this turn (no reply in the last
 * 3 days carried one), and is this the opening of a new conversation.
 */
export function nudgeStateFrom(recent: readonly NudgeHistoryMessage[], nowMs: number): { nudgeAllowed: boolean; opening: boolean } {
  const nudgedRecently = recent.some(
    (m) => m.role === 'assistant' && nowMs - m.createdAtMs < CHECK_LEVEL_NUDGE_COOLDOWN_MS && (m.actions ?? []).some(isCheckLevelActionId),
  );
  const last = recent.reduce((mx, m) => Math.max(mx, m.createdAtMs || 0), 0);
  return { nudgeAllowed: !nudgedRecently, opening: last === 0 || nowMs - last > OPENING_GAP_MS };
}
