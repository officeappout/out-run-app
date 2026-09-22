/**
 * Priority Order Display — Pure Logic
 *
 * Builds the render-ready groups for the profile's "PrioritiesSection"
 * (מה בחרת, לפי עדיפות) from the 3 persisted priority-array fields on
 * progression: cardFocusOrder, muscleFocusIds, skillFocusIds. Each field is
 * written only when it has 2+ entries (a single selection has no
 * meaningful "order" — same gate skillFocusIds already used before this
 * phase), so a group is included here under the same threshold.
 *
 * Display only — this module (and PrioritiesSection) never reads from or
 * feeds SplitDecisionService or any scoring/volume code. The classification
 * of "which kind of thing is this id" (category vs skill, program-groups.utils.ts's
 * domainTypeForSlug) is already implicit here in which of the 3 fields an id
 * came from, so a separate runtime classification call isn't needed.
 */

import { PROGRAM_CARD_LABELS_HE, MUSCLE_NAME_HE, SKILL_NAME_HE } from '../constants/program-path-labels.constants';
import type { ProgramCardId } from './program-card-selection';

export interface PriorityItem {
  id: string;
  /** 1-based priority (tap/selection order). */
  order: number;
  labelHe: string;
}

export type PriorityGroupKey = 'cards' | 'muscles' | 'skills';

export interface PriorityGroup {
  key: PriorityGroupKey;
  titleHe: string;
  items: PriorityItem[];
}

/** Minimal shape this module needs from progression — avoids importing the
 *  full UserFullProfile type into a plain .ts utils file. */
export interface PriorityOrderSource {
  cardFocusOrder?: string[];
  muscleFocusIds?: string[];
  skillFocusIds?: string[];
}

const MIN_ITEMS_FOR_A_GROUP = 2;

function toItems(ids: string[], labels: Record<string, string>): PriorityItem[] {
  return ids.map((id, i) => ({ id, order: i + 1, labelHe: labels[id] ?? id }));
}

/**
 * Builds the ordered display groups. Returns an empty array when nothing
 * qualifies (e.g. every selection this user made was a single item) — the
 * caller renders nothing in that case rather than an empty-state card.
 */
export function buildPriorityGroups(
  progression: PriorityOrderSource | null | undefined,
): PriorityGroup[] {
  const groups: PriorityGroup[] = [];

  const cardOrder = progression?.cardFocusOrder ?? [];
  if (cardOrder.length >= MIN_ITEMS_FOR_A_GROUP) {
    groups.push({
      key: 'cards',
      titleHe: 'כיוונים',
      items: toItems(cardOrder, PROGRAM_CARD_LABELS_HE as Record<ProgramCardId, string> as Record<string, string>),
    });
  }

  const muscleIds = progression?.muscleFocusIds ?? [];
  if (muscleIds.length >= MIN_ITEMS_FOR_A_GROUP) {
    groups.push({
      key: 'muscles',
      titleHe: 'אזורי מיקוד',
      items: toItems(muscleIds, MUSCLE_NAME_HE),
    });
  }

  const skillIds = progression?.skillFocusIds ?? [];
  if (skillIds.length >= MIN_ITEMS_FOR_A_GROUP) {
    groups.push({
      key: 'skills',
      titleHe: 'אלמנטים',
      items: toItems(skillIds, SKILL_NAME_HE),
    });
  }

  return groups;
}
