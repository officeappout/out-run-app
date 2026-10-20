/**
 * Day focus — the recommended split decides what each strength day trains
 * (enable_home_v2, owner 20.10.2026, strength-matrix-proposal.md decision 8). Pure.
 *
 *   upper / lower ×4      → upper days (push + pull) and lower days (legs + core)
 *   push / pull / legs    → that day's focus
 *   full body             → balanced every day (the pool stays as it is)
 *
 * The focus is picked deterministically from the day's position in the user's strength
 * week (Sunday first): 1st strength day = upper, 2nd = lower, 3rd = upper …
 * It only NARROWS the pool the user's active programs already give — never adds a domain:
 * the focus domains are intersected with the pool, and a day whose pool has nothing of
 * its focus (e.g. an upper-only program on a "lower" day) keeps today's content.
 */
import type { SessionType } from './split-decision.types';
import { HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { isStrengthTemplateId, type ResolveSlug } from '@/features/schedule/engine/strengthVocabulary';

export type DayFocus = 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full';

/** The generator domains each focus trains. */
export const DAY_FOCUS_DOMAINS: Readonly<Record<Exclude<DayFocus, 'full'>, readonly string[]>> = {
  upper: ['push', 'pull'],
  lower: ['legs', 'core'],
  push: ['push'],
  pull: ['pull'],
  legs: ['legs', 'core'],
};

/** Short Hebrew name for the day card title. */
export const DAY_FOCUS_HE: Readonly<Record<DayFocus, string>> = {
  upper: 'עליון',
  lower: 'תחתון',
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  full: 'כל הגוף',
};

/** Master programs → the domains they stand for (the pool may hold either form). */
const POOL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  full_body: ['push', 'pull', 'legs', 'core'],
  upper_body: ['push', 'pull'],
  lower_body: ['legs', 'core'],
};

/** The week's rotation for a split; null = a split this layer does not steer (habit / skill / rotation types). */
export function focusRotationOf(split: SessionType | null | undefined): DayFocus[] | null {
  if (!split) return null;
  if (split === 'upper_lower') return ['upper', 'lower'];
  if (split === 'push_pull_legs') return ['push', 'pull', 'legs'];
  if (split.startsWith('full_body')) return ['full'];
  return null;
}

/** The focus of the strength day at `dayIndex` (0-based); null when the split is not steered or the day is not a strength day. */
export function dayFocusOf(split: SessionType | null | undefined, dayIndex: number): DayFocus | null {
  const rotation = focusRotationOf(split);
  if (!rotation || !(dayIndex >= 0)) return null;
  return rotation[dayIndex % rotation.length];
}

interface LifestyleSlice {
  scheduleDays?: ReadonlyArray<string> | null;
  recurringTemplate?: Partial<Record<string, ReadonlyArray<string> | undefined>> | null;
}

/**
 * The user's strength days as Hebrew letters, Sunday first. From the recurring template
 * (days holding a strength id); no template / no strength id there → lifestyle.scheduleDays.
 */
export function strengthDayLettersOf(lifestyle: LifestyleSlice | null | undefined, resolveSlug?: ResolveSlug): string[] {
  const tpl = lifestyle?.recurringTemplate;
  let letters: string[] = [];
  if (tpl && typeof tpl === 'object') {
    letters = Object.entries(tpl)
      .filter(([, ids]) => Array.isArray(ids) && ids.some((id) => isStrengthTemplateId(id, resolveSlug)))
      .map(([letter]) => letter);
  }
  if (letters.length === 0) letters = [...(lifestyle?.scheduleDays ?? [])];
  const set = new Set(letters);
  return HEBREW_DAYS.filter((l) => set.has(l));
}

/** Position of an ISO date's weekday among the strength days (-1 = not a strength day). */
export function strengthDayIndexOf(dateISO: string, strengthLetters: readonly string[]): number {
  const d = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return -1;
  return strengthLetters.indexOf(HEBREW_DAYS[d.getDay()]);
}

/** Pool ids → the plain domains they cover (master programs expanded). */
export function expandPoolDomains(pool: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of pool) for (const d of POOL_ALIASES[id] ?? [id]) out.add(d);
  return Array.from(out);
}

export interface ResolvedDayFocus {
  focus: DayFocus;
  /**
   * The domains to restrict the session to (strict), or null when the pool already is
   * exactly the focus (nothing to narrow) or the focus is full body.
   */
  domains: string[] | null;
}

/**
 * The day's focus against the pool the active programs give. null = no focus applies
 * (not steered, not a strength day, or the pool has nothing of this day's focus).
 */
export function resolveDayFocus(focus: DayFocus | null, pool: readonly string[]): ResolvedDayFocus | null {
  if (!focus) return null;
  if (focus === 'full') return { focus, domains: null };
  const available = expandPoolDomains(pool);
  const domains = DAY_FOCUS_DOMAINS[focus].filter((d) => available.includes(d));
  if (domains.length === 0) return null;
  const narrows = available.some((d) => !domains.includes(d));
  return { focus, domains: narrows ? domains : null };
}

/**
 * "אימון כוח" → "אימון עליון"; a title that says "כל הגוף" gets the focus in its place
 * (never both); any other title → "title · עליון". Full body / no focus → unchanged.
 */
export function titleWithFocusHe(title: string, focus: DayFocus | null | undefined): string {
  if (!focus || focus === 'full') return title;
  const he = DAY_FOCUS_HE[focus];
  if (!title || title === 'אימון כוח') return `אימון ${he}`;
  if (title.includes(he)) return title;
  if (title.includes(DAY_FOCUS_HE.full)) return title.replace(DAY_FOCUS_HE.full, he);
  return `${title} · ${he}`;
}
