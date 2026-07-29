/**
 * Block B (BLOCK_B_SMART_CLOSE_V1) wave-1 — post_workout Suggestion builder.
 *
 * Produces a `Suggestion` (type: 'post_workout') from the endMode capture chain (F/B).
 * wave-1 is THIN: an endMode-driven message + a stretch offer + a rule-based "next step".
 * The full "smart close" assembler later replaces ONLY this builder's logic behind the
 * SAME `PostWorkoutSuggestion` shape — the surface (PostWorkoutSuggestionCard) never changes.
 *
 * Product frame (docs/architecture/workout-recommendation-engine.md §1.5 — "כל תנועה
 * נחשבת · היום לא נגמר"): the message is framed around the DAILY GOAL (the % ring at the
 * top), not the workout; `quit` is forgiving, never blaming; and there's ALWAYS a next
 * step — never a dead end.
 *
 * ⚠️ Contract alignment: this shape mirrors the shared rec-engine contract §4.2. The map
 * chat's canonical `Suggestion` type SUPERSEDES this local shape when it lands — swap to
 * it at the coordination checkpoint. `endMode` is CONSUMED here (inline literal union),
 * never defined as an authoritative local type (that lives in the doc §4.1 / UserContext).
 */

export type NextStepKind = 'abs' | 'walk' | 'recovery' | 'light';

/** wave-1c: the concrete next step (principle 5 in action — never a dead end). */
export interface NextStep {
  kind: NextStepKind;
  label: string;
}

/** Minimal Suggestion, aligned to contract §4.2 (only the fields wave-1 needs). */
export interface PostWorkoutSuggestion {
  id: string;
  type: 'post_workout';
  /** Which builder produced it (debug/telemetry; the assembler will set its own). */
  generatorId: string;
  title: string;
  subtitle?: string;
  /** wave-1: show recovery stretches under the message (message + stretches). */
  showStretches: boolean;
  /** UI tone — drives colour/emphasis. Key product principle: `quit` is forgiving,
   *  never blaming (shame lowers adherence — forgiving-streak from the vision). */
  tone: 'reinforce' | 'gentle' | 'forgiving';
  /** wave-1c: the next step. The assembler will route each kind to its own generator;
   *  wave-1c picks it by simple rules over the existing inputs. */
  nextStep?: NextStep;
}

export interface PostWorkoutSuggestionInput {
  /** From the handoff (contract §4.1). Present only when BLOCK_B_SMART_CLOSE_V1 captured it. */
  endMode?: 'full' | 'short' | 'quit';
  intendedDurationMin?: number;
  domainsCompleted?: string[];
  trainedCore?: boolean;
  /** wave-1c: steps left to the daily step goal (0 when met/unknown). */
  stepsRemaining?: number;
  /** wave-1c: % (0-100) of the daily strength goal already done — the ring at the top.
   *  Frames the message around the daily goal, not the workout (§1.5). */
  dailyGoalPct?: number;
}

/** Steps gap (to the daily step goal) at/above which a short-walk nudge is worth offering. */
const STEPS_GAP_THRESHOLD = 1500;

interface EndModeCopy {
  id: string;
  title: string;
  /** Used only when there's no daily-goal % to frame with (edge / legacy handoff). */
  fallbackSubtitle: string;
  tone: PostWorkoutSuggestion['tone'];
}

const END_MODE_COPY: Record<'full' | 'short' | 'quit', EndModeCopy> = {
  // Forgiving-streak: every start counts. No guilt, no "you didn't finish".
  quit: {
    id: 'post_workout_quit',
    title: 'כל התחלה נחשבת 🙌',
    fallbackSubtitle: 'עצם זה שיצאת לדרך — ניצחון. בלי אשמה. כמה מתיחות לסגור ברוגע.',
    tone: 'forgiving',
  },
  short: {
    id: 'post_workout_short',
    title: 'יפה — אימון קצר בכיס 👊',
    fallbackSubtitle: 'כל דקה נספרת.',
    tone: 'gentle',
  },
  full: {
    id: 'post_workout_full',
    title: 'אימון מלא — כל הכבוד! 💪',
    fallbackSubtitle: 'סיימת את מה שתכננת.',
    tone: 'reinforce',
  },
};

/**
 * wave-1c: frame the message around the DAILY GOAL (the % ring at the top), not the workout
 * (§1.5 — "the frame is the daily goal; the day isn't over"). Gender-neutral phrasing.
 */
function framingSubtitle(dailyGoalPct: number | undefined, fallback: string): string {
  if (dailyGoalPct == null) return fallback;
  const p = Math.max(0, Math.min(100, Math.round(dailyGoalPct)));
  if (p >= 100) return 'סגרת את היעד היומי! 🎯 כל תוספת מכאן היא בונוס נקי.';
  return `כבר ב-${p}% מהיעד היומי — היום עוד לא נגמר.`;
}

/**
 * wave-1c: pick the next step by simple rules (principle 5 in action — never a dead end).
 *
 * Precedence:
 *   1. `quit` → gentle recovery. A quit means low energy / interrupted — offering "add abs"
 *      is tone-deaf, so the forgiving path gets a soft recovery step (the stretches below
 *      fulfil it).
 *   2. didn't train core today (`trainedCore === false`) → 5-min abs. Core is the common
 *      strength gap. Fires ONLY on an explicit false; an undefined legacy handoff is skipped.
 *   3. steps gap ≥ threshold → short walk. Steps are core value — this fires when core WAS
 *      trained but the step goal is still open. `stepsRemaining` undefined → treated as 0.
 *   4. else → a light general step. Never a dead end.
 */
function pickNextStep(input: PostWorkoutSuggestionInput): NextStep {
  const { endMode, trainedCore, stepsRemaining } = input;

  if (endMode === 'quit') {
    return { kind: 'recovery', label: 'סבב שחרור עדין — כמה מתיחות ונרגענו 🧘' };
  }
  if (trainedCore === false) {
    return { kind: 'abs', label: "עוד לא עשית בטן היום — להוסיף 5 דק'?" };
  }
  if ((stepsRemaining ?? 0) >= STEPS_GAP_THRESHOLD) {
    return {
      kind: 'walk',
      label: `עוד ${(stepsRemaining as number).toLocaleString('he-IL')} צעדים ליעד — הליכה קצרה?`,
    };
  }
  return { kind: 'light', label: 'סבב קליל לסיום? כל תנועה נחשבת 🙌' };
}

/**
 * wave-1 logic: endMode → message + tone + a next step. Returns null when there's no
 * endMode signal (flag off, or a legacy handoff) → the surface renders nothing
 * (byte-identical). The full assembler will additionally read domainsCompleted /
 * intendedDurationMin to pick a complementary workout — wave-1 forwards them for that use.
 */
export function buildPostWorkoutSuggestion(
  input: PostWorkoutSuggestionInput,
): PostWorkoutSuggestion | null {
  const { endMode } = input;
  if (!endMode) return null;

  const copy = END_MODE_COPY[endMode];
  return {
    id: copy.id,
    type: 'post_workout',
    generatorId: 'wave1_endmode',
    title: copy.title,
    subtitle: framingSubtitle(input.dailyGoalPct, copy.fallbackSubtitle),
    showStretches: true,
    tone: copy.tone,
    nextStep: pickNextStep(input),
  };
}
