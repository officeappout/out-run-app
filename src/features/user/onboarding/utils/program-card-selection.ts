/**
 * Program-Path Card Selection — Pure Logic
 *
 * The 3 program-path cards (Health, Body Focus, Skills) are co-selectable —
 * priority is tap order, exactly the same array-append/filter-out pattern
 * already used for the Skills card's own internal chip ranking
 * (toggleSkill/getSkillOrder in program-path/page.tsx). Extracted here so
 * the toggle/order/canContinue logic is unit-testable without rendering
 * the page (this repo's vitest is node-env only, no jsdom/component tests).
 */

export type ProgramCardId = 'health' | 'body_focus' | 'skills';

/** Toggle a card: append if not selected (adds it at the end = lowest
 *  priority so far), remove if already selected. */
export function toggleCard(
  selected: ProgramCardId[],
  id: ProgramCardId,
): ProgramCardId[] {
  return selected.includes(id)
    ? selected.filter((c) => c !== id)
    : [...selected, id];
}

/** 1-based priority (tap order) of a card, or null if not selected. */
export function getCardOrder(
  selected: ProgramCardId[],
  id: ProgramCardId,
): number | null {
  const idx = selected.indexOf(id);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * At least one card selected, and every selected card that requires a
 * sub-selection (Body Focus → muscles, Skills → skills) has one. Health
 * needs no sub-selection.
 */
export function canContinueWithCards(
  selected: ProgramCardId[],
  selectedMuscles: string[],
  selectedSkills: string[],
): boolean {
  if (selected.length === 0) return false;
  for (const card of selected) {
    if (card === 'body_focus' && selectedMuscles.length === 0) return false;
    if (card === 'skills' && selectedSkills.length === 0) return false;
  }
  return true;
}
