/**
 * rank-suggestions — the PULL suggestion engine (docs/architecture/
 * workout-recommendation-engine.md §8.1), Step 5 of the build order (§11.5).
 *
 * Pure function, no I/O, no React/component imports (deliberately — see
 * vitest.config.ts's "no jsdom/component testing" boundary discovered during the tabata
 * retrofit; keeping this file pure-`.ts` means it's actually testable, unlike a method
 * wrapper that has to reference real UI components).
 *
 * Per-factor scoring, each independently readable in `Suggestion.scoreBreakdown` for
 * transparency/debugging (doc §4.2's stated purpose for that field). Two of the doc's 8
 * factors are honest, documented no-ops today — NOT fabricated logic on top of missing data:
 *
 * - `gapFilling` — PENDING Gate B (plan §ד): 3 non-identical "remaining budget" candidates
 *   exist in the codebase and none has been picked as canonical yet. Wiring a guess here
 *   would silently bake in an unmade product decision.
 * - `timeOfDayMatch` — the doc's only CONCRETE example ("צהריים במשרד → חלון מיקרו") needs a
 *   micro_nudge-type suggestion, which doesn't exist until §11.7 (moments layer) is built.
 *   Inventing an hour-of-day workout-appropriateness heuristic not specified in the doc would
 *   be a real product guess, not an engineering translation — left at 0 until then.
 *
 * `lockGating` (doc §8.1's 8th factor) is deliberately NOT a scoring factor here — it's
 * handled one layer up, by each `Generator.eligible()` (already built, e.g. a future running
 * generator would gate on `context.questionnaires.running`). A suggestion a lock excludes
 * should never reach this ranker's candidate list at all; scoring a suggestion that shouldn't
 * exist and then filtering it out would be redundant with eligibility that already exists.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion, ScoreBreakdown } from '../types/suggestion.types';
import { RANK_WEIGHTS } from './rank-suggestions.weights';

function goalMatch(context: UserContext, suggestion: Suggestion): number {
  if (!context.todayGoal) return 0;
  return suggestion.goalTags.includes(context.todayGoal) ? RANK_WEIGHTS.goalMatch : 0;
}

/** PENDING Gate B — see file header. */
function gapFilling(_context: UserContext, _suggestion: Suggestion): number {
  return 0;
}

/**
 * Doc §8.1: "stepsRemaining גבוה → בוסט להצעות עם מקטע הליכה; היעד הושג → כוח טהור."
 * `stepsWalking` = suggestion plausibly contributes to steps (declared `stepContribution`,
 * or a walk/run goal tag — most current generators don't set `stepContribution` yet, so the
 * tag fallback keeps this factor meaningful today rather than silently always 0).
 */
function stepDeficit(context: UserContext, suggestion: Suggestion): number {
  const stepsWalking =
    (suggestion.stepContribution ?? 0) > 0 ||
    suggestion.goalTags.includes('walk') ||
    suggestion.goalTags.includes('run');
  const goalMet = context.stepGoal > 0 && context.stepsRemaining <= 0;

  if (goalMet) {
    // Goal already hit — favor pure strength (no walk/run tag at all).
    const pureStrength =
      suggestion.goalTags.includes('strength') &&
      !suggestion.goalTags.includes('walk') &&
      !suggestion.goalTags.includes('run');
    return pureStrength ? RANK_WEIGHTS.stepDeficit : 0;
  }

  if (!stepsWalking || context.stepGoal <= 0) return 0;
  const deficitRatio = Math.min(1, context.stepsRemaining / context.stepGoal);
  return RANK_WEIGHTS.stepDeficit * deficitRatio;
}

/** Doc §8.1: "העדפות כלליות, אימון ערב, רמת קושי." Two independent signals, averaged. */
function preferenceMatch(context: UserContext, suggestion: Suggestion): number {
  let hits = 0;
  let checks = 0;

  if (context.preferences.preferredDifficulty != null) {
    checks++;
    if (context.preferences.preferredDifficulty === suggestion.difficulty) hits++;
  }
  if (context.preferences.eveningWorkoutPreferred != null) {
    checks++;
    if (context.preferences.eveningWorkoutPreferred && context.timeOfDay === 'evening') hits++;
  }

  if (checks === 0) return 0;
  return RANK_WEIGHTS.preferenceMatch * (hits / checks);
}

/**
 * Doc §8.1: "לכבד detraining / build / חלונות התאוששות." Only the detraining-lock case is
 * implemented — it's the one grounded in an existing engine concept
 * (`WorkoutGenerationContext.detrainingLock`, which already caps difficulty elsewhere in the
 * live generator). Locked → linear preference for lower difficulty; not locked → neutral.
 */
function recoveryMatch(context: UserContext, suggestion: Suggestion): number {
  if (!context.recoveryState.isDetrainingLocked) return 0;
  const distanceFromEasiest = (suggestion.difficulty - 1) / 2; // 0 (D1) .. 1 (D3)
  return RANK_WEIGHTS.recoveryMatch * (1 - distanceFromEasiest);
}

/**
 * Doc §8.1: "ליד ספורטק → פתיחת ובוסט ל-AMRAP היברידי." No hybrid-AMRAP generator exists yet
 * (backlogged, §11.6) and `UserContext.location` is a bare GPS point with no park-distance
 * field — so this is deliberately the general, honest form: reward a location-requiring
 * suggestion whenever location is actually available (the same precondition that made it
 * eligible in the first place), not a fabricated "near a specific park" proximity score.
 */
function locationBonus(context: UserContext, suggestion: Suggestion): number {
  return suggestion.requiresLocation && context.location !== null ? RANK_WEIGHTS.locationBonus : 0;
}

/** PENDING §11.7 (moments layer) — see file header. */
function timeOfDayMatch(_context: UserContext, _suggestion: Suggestion): number {
  return 0;
}

export function scoreSuggestion(context: UserContext, suggestion: Suggestion): ScoreBreakdown {
  return {
    goalMatch: goalMatch(context, suggestion),
    gapFilling: gapFilling(context, suggestion),
    stepDeficit: stepDeficit(context, suggestion),
    preferenceMatch: preferenceMatch(context, suggestion),
    recoveryMatch: recoveryMatch(context, suggestion),
    locationBonus: locationBonus(context, suggestion),
    timeOfDayMatch: timeOfDayMatch(context, suggestion),
  };
}

function sumBreakdown(breakdown: ScoreBreakdown): number {
  return Object.values(breakdown).reduce((total: number, v) => total + (typeof v === 'number' ? v : 0), 0);
}

/**
 * Ranks candidates highest-first. Highest = "המומלץ" (doc §8), the rest = alternatives —
 * the caller decides how many alternatives to surface, this function doesn't truncate.
 */
export function rankSuggestions(context: UserContext, candidates: Suggestion[]): Suggestion[] {
  return candidates
    .map((suggestion) => {
      const scoreBreakdown = scoreSuggestion(context, suggestion);
      return { ...suggestion, scoreBreakdown, score: sumBreakdown(scoreBreakdown) };
    })
    .sort((a, b) => b.score - a.score);
}
