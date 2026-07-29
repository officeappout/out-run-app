/**
 * Block B (BLOCK_B_SMART_CLOSE_V1) wave-1 — post_workout Suggestion builder.
 *
 * Produces a `Suggestion` (type: 'post_workout') from the endMode capture chain (F/B).
 * wave-1 is THIN: an endMode-driven message + a stretch offer. The full "smart close"
 * assembler later replaces ONLY this builder's logic behind the SAME `PostWorkoutSuggestion`
 * shape — the surface (PostWorkoutSuggestionCard) never changes.
 *
 * ⚠️ Contract alignment: this shape mirrors the shared rec-engine contract §4.2
 * (docs/architecture/workout-recommendation-engine.md). The map chat's canonical
 * `Suggestion` type SUPERSEDES this local shape when it lands — swap to it at the
 * coordination checkpoint. `endMode` is CONSUMED here (inline literal union), never
 * defined as an authoritative local type (that lives in the doc §4.1 / UserContext).
 */

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
}

export interface PostWorkoutSuggestionInput {
  /** From the handoff (contract §4.1). Present only when BLOCK_B_SMART_CLOSE_V1 captured it. */
  endMode?: 'full' | 'short' | 'quit';
  intendedDurationMin?: number;
  domainsCompleted?: string[];
  trainedCore?: boolean;
}

/**
 * wave-1 logic: endMode → message + tone. Returns null when there's no endMode signal
 * (flag off, or a legacy handoff) → the surface renders nothing (byte-identical).
 * The full assembler will additionally read domainsCompleted/trainedCore/intendedDurationMin
 * to pick a complementary workout — wave-1 only forwards them for that future use.
 */
export function buildPostWorkoutSuggestion(
  input: PostWorkoutSuggestionInput,
): PostWorkoutSuggestion | null {
  const { endMode } = input;
  if (!endMode) return null;

  switch (endMode) {
    case 'quit':
      // Forgiving-streak: every start counts. No guilt, no "you didn't finish".
      return {
        id: 'post_workout_quit',
        type: 'post_workout',
        generatorId: 'wave1_endmode',
        title: 'כל התחלה נחשבת 🙌',
        subtitle: 'עצם זה שיצאת לדרך — ניצחון. בלי אשמה. כמה מתיחות לסגור ברוגע, ונתראה מחר.',
        showStretches: true,
        tone: 'forgiving',
      };
    case 'short':
      return {
        id: 'post_workout_short',
        type: 'post_workout',
        generatorId: 'wave1_endmode',
        title: 'יפה — אימון קצר בכיס 👊',
        subtitle: 'כל דקה נספרת. שחרור קצר לסגור טוב:',
        showStretches: true,
        tone: 'gentle',
      };
    case 'full':
    default:
      return {
        id: 'post_workout_full',
        type: 'post_workout',
        generatorId: 'wave1_endmode',
        title: 'אימון מלא — כל הכבוד! 💪',
        subtitle: 'סיימת את מה שתכננת. מתיחות שחרור לסיום מושלם:',
        showStretches: true,
        tone: 'reinforce',
      };
  }
}
