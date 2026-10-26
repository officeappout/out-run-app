/**
 * THE week-structure table (owner 26.10.2026): replaces SPLIT_MATRIX and the policy table.
 *   1-3 days  full body, rotating emphasis (push / pull / legs)
 *   4         upper / lower x2
 *   5         upper / lower x2 + full body
 *   6         push / pull / legs x2
 *   7         the 6 above + the 7th day is always movement
 * Every muscle works at least twice a week from 2 days up (1 day is the unavoidable exception).
 */
import { EMPHASIS_ROTATION, MAX_WEEK_DAYS } from './config';
import type { Emphasis, StrengthDayKind } from './types';

export interface TemplateDay {
  kind: StrengthDayKind;
  emphasis?: Emphasis;
}

const fullBody = (n: number): TemplateDay[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'full_body' as const, emphasis: EMPHASIS_ROTATION[i % EMPHASIS_ROTATION.length] }));

const UL: TemplateDay[] = [{ kind: 'upper' }, { kind: 'lower' }, { kind: 'upper' }, { kind: 'lower' }];
const PPL: TemplateDay[] = [{ kind: 'push' }, { kind: 'pull' }, { kind: 'legs' }, { kind: 'push' }, { kind: 'pull' }, { kind: 'legs' }];

/** Strength days of the table for N chosen days (1..7). Day 7 adds no strength day. */
export function strengthTemplate(days: number): TemplateDay[] {
  const n = Math.min(MAX_WEEK_DAYS, Math.max(1, Math.round(days)));
  if (n <= 3) return fullBody(n);
  if (n === 4) return UL;
  if (n === 5) return [...UL, { kind: 'full_body', emphasis: 'legs' }];
  return PPL;
}

/** How many of the chosen days are movement days in the table (only the 7th day). */
export const tableMovementDays = (days: number): number => (days >= MAX_WEEK_DAYS ? 1 : 0);
