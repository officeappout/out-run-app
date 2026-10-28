/**
 * programLevelSettings.targetGoals[].exerciseName may be a plain Hebrew string (every doc today) or {he, en}.
 * Reads normalize it so `exerciseName` stays the Hebrew string every reader (progression engine, level-up sheet,
 * home goal rows, admin pages) already uses; the pair rides in `exerciseNameLocalized`. Writes fold it back, and
 * keep an English slot the doc already has when the goal's Hebrew name is unchanged (the admin goal editor picks an
 * exercise and only knows the Hebrew name, so a plain re-save must not drop English).
 */
import { buildStoredText, hebrewOf, type StoredText } from '../../shared/content-locale';
import type { LocalizedText } from '../../shared/localized-text.types';
import { isStoredLocalized } from '../../shared/stored-text-fields';

type GoalLike = Record<string, unknown>;

/** Read side: every goal's exerciseName becomes the Hebrew string; the pair moves to exerciseNameLocalized (only when stored as one). */
export function normalizeLevelGoals<T extends object>(data: T): T {
  const goals = (data as { targetGoals?: unknown }).targetGoals;
  if (!Array.isArray(goals) || !goals.some((g) => g && isStoredLocalized((g as GoalLike).exerciseName))) return data;
  return {
    ...data,
    targetGoals: goals.map((g) => {
      const name = g && (g as GoalLike).exerciseName;
      return isStoredLocalized(name) ? { ...(g as GoalLike), exerciseName: hebrewOf(name), exerciseNameLocalized: name } : g;
    }),
  };
}

/** Write side: the exerciseName to store for one goal (plain string unless English exists). */
export function exerciseNameForWrite(
  goal: { exerciseId?: string; exerciseName: string; exerciseNameLocalized?: LocalizedText | null },
  existingGoals?: unknown,
): StoredText {
  const heName = goal.exerciseName;
  const given = goal.exerciseNameLocalized;
  if (given) return (given.en ?? '').trim() ? buildStoredText(heName, given.en, given) : heName;
  const prev = Array.isArray(existingGoals)
    ? (existingGoals as GoalLike[]).find((g) => g?.exerciseId === goal.exerciseId)?.exerciseName
    : undefined;
  return isStoredLocalized(prev) && prev.en && hebrewOf(prev) === heName ? buildStoredText(heName, prev.en, prev) : heName;
}
