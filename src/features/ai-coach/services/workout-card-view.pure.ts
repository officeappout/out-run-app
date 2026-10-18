/**
 * "קלי AI" workout card — what the compact card shows, from the card + the workout the
 * device cached. Pure (no React, no storage), so the card's copy is unit-tested.
 *
 * Mirrors the home hero card (HeroWorkoutCard): title with the program icon, minutes,
 * difficulty in words + bolts, and adds the chat-only facts (exercise count, location).
 */
import type { WorkoutCard } from '@/lib/ai/coach/protocol';

export const LOCATION_LABEL_HE: Record<string, string> = {
  home: 'בבית',
  park: 'בפארק',
  office: 'במשרד',
  street: 'בחוץ',
};

/** Same words as the home card's metadata row (HeroWorkoutCard DIFFICULTY_LABELS). */
export const DIFFICULTY_LABEL_HE: Record<1 | 2 | 3, string> = { 1: 'קל', 2: 'בינוני', 3: 'מאתגר' };

export type CardChipKey = 'minutes' | 'exercises' | 'location';

export interface WorkoutCardView {
  title: string;
  /** minutes · exercises · location, in that order (RTL reads right to left). */
  chips: Array<{ key: CardChipKey; label: string }>;
  difficulty: 1 | 2 | 3 | null;
  difficultyLabel: string | null;
  /** PROGRAM_ICON_MAP key for the title icon: the single domain, or full_body for a mixed / full-body workout. */
  iconKey: string;
  /** The whole card as one sentence, for the button's accessible name. */
  ariaLabel: string;
}

export function exercisesLabel(n: number): string {
  return n === 1 ? 'תרגיל אחד' : `${n} תרגילים`;
}

function clampDifficulty(v: unknown): 1 | 2 | 3 | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(3, Math.max(1, Math.round(v))) as 1 | 2 | 3;
}

/**
 * @param card       the stored / streamed card
 * @param cachedDifficulty the GeneratedWorkout's difficulty when the device still has it
 *                   (older cards don't carry `difficulty`)
 */
export function workoutCardView(card: WorkoutCard, cachedDifficulty?: number | null): WorkoutCardView {
  const title = (card.title || 'אימון מותאם').trim();
  const chips: WorkoutCardView['chips'] = [
    { key: 'minutes', label: `${card.minutes} דק׳` },
    { key: 'exercises', label: exercisesLabel(card.exerciseCount) },
  ];
  const loc = LOCATION_LABEL_HE[card.location];
  if (loc) chips.push({ key: 'location', label: loc });

  const difficulty = clampDifficulty(card.difficulty ?? cachedDifficulty);
  const difficultyLabel = difficulty ? DIFFICULTY_LABEL_HE[difficulty] : null;

  const domains = Array.from(new Set(card.domains ?? []));
  const iconKey = domains.length === 1 ? domains[0] : 'full_body';

  const ariaLabel = ['פתח אימון', title, ...chips.map((c) => c.label), difficultyLabel ? `רמת קושי ${difficultyLabel}` : '']
    .filter(Boolean)
    .join(', ');

  return { title, chips, difficulty, difficultyLabel, iconKey, ariaLabel };
}
