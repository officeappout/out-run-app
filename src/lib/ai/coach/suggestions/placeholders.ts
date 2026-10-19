/**
 * Kelly phase 2 — rotating hints in the chat's input box ("נסה: תבנה לי אימון בטן של 15
 * דק׳"), from the same situation as the quick replies. Pure. 3-4 hints, the most relevant
 * first; the screen rotates them while the box is empty.
 */
import { tryPrefix } from './copy';
import { RETURN_AFTER_DAYS, type ChipSituation } from './types';

export const PLACEHOLDER_ROTATE_MS = 4500;

export function placeholderHints(s: ChipSituation): string[] {
  const hints: string[] = [];
  if (s.daysAway !== null && s.daysAway >= RETURN_AFTER_DAYS) hints.push('תבנה לי אימון חזרה קל');
  if (s.weather === 'rain' || s.weather === 'cold') hints.push('תבנה לי אימון בבית בלי ציוד');
  if (s.weather === 'heat') hints.push('תבנה לי אימון קצר בבית');
  if (s.buildableToday && !s.doneToday) hints.push('תבנה לי את האימון של היום');
  hints.push('תבנה לי אימון בטן של 15 דק׳');
  if (s.trainingDayToday !== null) hints.push('תזיז את האימון של מחר ליום אחר');
  hints.push('מה מחכה לי השבוע?');
  hints.push('איך מחברים את הצעדים?');
  const prefix = tryPrefix(s.gender);
  return Array.from(new Set(hints)).slice(0, 4).map((h) => `${prefix}${h}`);
}
