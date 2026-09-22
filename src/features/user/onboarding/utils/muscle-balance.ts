/**
 * Muscle Card (Card B) Coach's Note — Pure Balance Derivation
 *
 * Mirrors the Skills card's Orange Flow pattern (program-path/page.tsx's
 * PUSH_SKILLS/PULL_SKILLS → missingCategory), adapted for muscle chips.
 * Checks push/pull imbalance FIRST (more specific), then falls back to the
 * broader upper/lower imbalance — a mixed push+pull selection (no lower)
 * doesn't match either push_only/pull_only, so it correctly falls through
 * to upper_only. A user who picked both an upper AND a lower muscle is
 * already reasonably balanced — no recommendation.
 */

const PUSH_MUSCLE_LIST = ['chest', 'shoulders', 'triceps'] as const;
const PULL_MUSCLE_LIST = ['back', 'biceps'] as const;

export const PUSH_MUSCLES: ReadonlySet<string> = new Set(PUSH_MUSCLE_LIST);
export const PULL_MUSCLES: ReadonlySet<string> = new Set(PULL_MUSCLE_LIST);
export const LOWER_MUSCLES: ReadonlySet<string> = new Set(['legs', 'core', 'glutes']);
// Built from the plain arrays (not by spreading the Sets above) — spreading a
// Set requires --downlevelIteration under this repo's tsconfig target and
// throws TS2802; spreading arrays doesn't have that restriction.
export const UPPER_MUSCLES: ReadonlySet<string> = new Set([...PUSH_MUSCLE_LIST, ...PULL_MUSCLE_LIST]);

/** The full-body synthetic tag — same exemption as the Skills master chip. */
const FULL_BODY_ID = 'full_body';

export type MuscleBalanceCase = 'push_only' | 'pull_only' | 'upper_only' | 'lower_only';

export const MUSCLE_BALANCE_MESSAGES_HE: Record<MuscleBalanceCase, string> = {
  push_only: 'בחרת רק שרירי דחיפה — שווה להוסיף משיכה לאיזון.',
  pull_only: 'בחרת רק שרירי משיכה — שווה להוסיף דחיפה לאיזון.',
  upper_only: 'בחרת רק פלג גוף עליון — רגליים או ליבה יתנו לך גוף שלם וחזק יותר.',
  lower_only: 'בחרת רק פלג גוף תחתון — קצת דחיפה/משיכה לעליון ישלימו את התמונה.',
};

/**
 * Derives which (if any) of the 4 balance cases applies to the current
 * muscle selection. null = no mismatch (nothing selected, a genuinely
 * balanced mix of upper+lower, or the full-body chip — same exemption as
 * the Skills card's master chip).
 */
export function deriveMuscleBalanceCase(selectedMuscles: string[]): MuscleBalanceCase | null {
  if (selectedMuscles.length === 0) return null;
  if (selectedMuscles.includes(FULL_BODY_ID)) return null;

  const hasPush = selectedMuscles.some((m) => PUSH_MUSCLES.has(m));
  const hasPull = selectedMuscles.some((m) => PULL_MUSCLES.has(m));
  const hasLower = selectedMuscles.some((m) => LOWER_MUSCLES.has(m));

  // Push/pull checked first (more specific — strictly nothing else selected).
  if (hasPush && !hasPull && !hasLower) return 'push_only';
  if (hasPull && !hasPush && !hasLower) return 'pull_only';
  // Then upper/lower (broader — any push/pull mix, or any lower mix).
  if ((hasPush || hasPull) && !hasLower) return 'upper_only';
  if (hasLower && !hasPush && !hasPull) return 'lower_only';

  return null;
}

/** Which muscles should glow as the suggested complement for a given case. */
export function recommendedMusclesForCase(
  balanceCase: MuscleBalanceCase | null,
): ReadonlySet<string> {
  switch (balanceCase) {
    case 'push_only': return PULL_MUSCLES;
    case 'pull_only': return PUSH_MUSCLES;
    case 'upper_only': return LOWER_MUSCLES;
    case 'lower_only': return UPPER_MUSCLES;
    default: return new Set();
  }
}
