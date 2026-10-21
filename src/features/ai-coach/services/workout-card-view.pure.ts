/**
 * "קלי AI" workout card — what the compact card shows, from the card + the workout the
 * device cached. Pure (no React, no storage), so the card's copy is unit-tested.
 *
 * Mirrors the home hero card (HeroWorkoutCard): title with the program icon, minutes,
 * difficulty in words + bolts, and adds the chat-only facts (exercise count, location).
 */
import type { WorkoutCard } from '@/lib/ai/coach/protocol';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { coach } from '@/messages/ns/coach';

/** The caller's translator for the `coach` namespace (useT(coach) / makeT('he', coach)). */
export type CoachT = (key: NamespaceKey<typeof coach>, values?: MessageValues) => string;

/** Location → its chip key (`coach` catalog). A location not listed here gets no chip. */
export const LOCATION_LABEL_KEYS: Record<string, NamespaceKey<typeof coach>> = {
  home: 'card.view.location.home',
  park: 'card.view.location.park',
  office: 'card.view.location.office',
  street: 'card.view.location.street',
};

/** Same words as the home card's metadata row (HeroWorkoutCard DIFFICULTY_LABELS). */
export const DIFFICULTY_LABEL_KEYS: Record<1 | 2 | 3, NamespaceKey<typeof coach>> = {
  1: 'card.view.difficulty.easy',
  2: 'card.view.difficulty.medium',
  3: 'card.view.difficulty.hard',
};

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

export function exercisesLabel(n: number, t: CoachT): string {
  return t('card.view.exercises', { count: String(n) });
}

function clampDifficulty(v: unknown): 1 | 2 | 3 | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(3, Math.max(1, Math.round(v))) as 1 | 2 | 3;
}

/**
 * @param card       the stored / streamed card
 * @param cachedDifficulty the GeneratedWorkout's difficulty when the device still has it
 *                   (older cards don't carry `difficulty`)
 * @param t          the caller's `coach` translator
 */
export function workoutCardView(card: WorkoutCard, cachedDifficulty: number | null | undefined, t: CoachT): WorkoutCardView {
  const title = (card.title || t('card.view.titleFallback')).trim();
  const chips: WorkoutCardView['chips'] = [
    { key: 'minutes', label: t('card.view.minutes', { minutes: String(card.minutes) }) },
    { key: 'exercises', label: exercisesLabel(card.exerciseCount, t) },
  ];
  const locKey = Object.prototype.hasOwnProperty.call(LOCATION_LABEL_KEYS, card.location) ? LOCATION_LABEL_KEYS[card.location] : undefined;
  if (locKey) chips.push({ key: 'location', label: t(locKey) });

  const difficulty = clampDifficulty(card.difficulty ?? cachedDifficulty);
  const difficultyLabel = difficulty ? t(DIFFICULTY_LABEL_KEYS[difficulty]) : null;

  const domains = Array.from(new Set(card.domains ?? []));
  const iconKey = domains.length === 1 ? domains[0] : 'full_body';

  const ariaLabel = [t('card.view.openAria'), title, ...chips.map((c) => c.label), difficultyLabel ? t('card.view.difficultyAria', { label: difficultyLabel }) : '']
    .filter(Boolean)
    .join(', ');

  return { title, chips, difficulty, difficultyLabel, iconKey, ariaLabel };
}
