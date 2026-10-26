/**
 * Kelly phase 2 — rotating hints in the chat's input box ("נסה: תבנה לי אימון בטן של 15
 * דק׳"), from the same situation as the quick replies. Pure. 3-4 hints, the most relevant
 * first; the screen rotates them while the box is empty.
 */
import { tryPrefix } from './copy';
import { RETURN_AFTER_DAYS, type ChipSituation } from './types';
import { makeT } from '@/lib/i18n/t';
import { coach } from '@/messages/ns/coach';

// Hebrew-only copy (bundled catalog, sync read).
const t = makeT('he', coach);

export const PLACEHOLDER_ROTATE_MS = 4500;

export function placeholderHints(s: ChipSituation): string[] {
  const hints: string[] = [];
  if (s.daysAway !== null && s.daysAway >= RETURN_AFTER_DAYS) hints.push(t('hint.returnLight'));
  if (s.weather === 'rain' || s.weather === 'cold') hints.push(t('hint.homeNoGear'));
  if (s.weather === 'heat') hints.push(t('hint.shortHome'));
  if (s.buildableToday && !s.doneToday) hints.push(t('hint.buildToday'));
  hints.push(t('hint.abs15'));
  if (s.trainingDayToday !== null) hints.push(t('hint.moveTomorrow'));
  hints.push(t('hint.weekAhead'));
  hints.push(t('hint.steps'));
  const prefix = tryPrefix(s.gender);
  return Array.from(new Set(hints)).slice(0, 4).map((h) => `${prefix}${h}`);
}
