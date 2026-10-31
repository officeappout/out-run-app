/**
 * Handstand Triad level assessment helpers. Pure.
 *
 * Owner-approved 31.10.2026 (appout-website/handstand-research/ASSESSMENT-LEVELS.md):
 * the existing visual assessment shows THREE sliders for handstand instead of
 * one: strength, balance, shoulder mobility (1-15 each). The answers are
 * stored as hidden sub-levels on the handstand track
 * (progression.tracks.handstand.triad) and the visible handstand level is
 * their rounded average. Only while HANDSTAND_TRIAD_ENABLED.
 */
import { TRIAD_AXES, TRIAD_MAX, TRIAD_MIN, type TriadAxis, type TriadValues } from './triad.types';

/** Slider categories (visual_assessment_content docs `${category}_${level}`). */
export const TRIAD_ASSESSMENT_CATEGORIES: Record<TriadAxis, string> = {
  strength: 'handstand_strength',
  balance: 'handstand_balance',
  mobility: 'handstand_mobility',
};
const CATEGORY_TO_AXIS = new Map<string, TriadAxis>(
  TRIAD_AXES.map((a) => [TRIAD_ASSESSMENT_CATEGORIES[a], a]),
);

export const isTriadAssessmentCategory = (cat: string) => CATEGORY_TO_AXIS.has(cat);

/** 'handstand' → its three triad categories (flag on); any other id unchanged. */
export function expandTriadCategories(categories: string[], enabled: boolean): string[] {
  if (!enabled) return categories;
  return categories.flatMap((c) => (c === 'handstand' ? TRIAD_AXES.map((a) => TRIAD_ASSESSMENT_CATEGORIES[a]) : [c]));
}

const clamp = (n: number) => Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(n)));

/**
 * Pull the three triad answers out of the per-category levels: the result has
 * no `handstand_*` keys (they are not programs), `handstand` = round(avg) of
 * the answered axes, and `triad` holds the axes. No triad answer → unchanged.
 */
export function splitTriadLevels(levels: Record<string, number>): {
  levels: Record<string, number>;
  triad: Partial<TriadValues> | null;
} {
  const rest: Record<string, number> = {};
  const triad: Partial<TriadValues> = {};
  for (const [cat, lvl] of Object.entries(levels)) {
    const axis = CATEGORY_TO_AXIS.get(cat);
    if (axis) triad[axis] = clamp(lvl);
    else rest[cat] = lvl;
  }
  const answered = Object.values(triad);
  if (answered.length === 0) return { levels, triad: null };
  rest.handstand = clamp(answered.reduce((a, b) => a + b, 0) / answered.length);
  return { levels: rest, triad };
}

/** Re-test never lowers an axis (same no-regression rule as track levels). */
export function mergeTriadNoRegression(
  existing: Partial<TriadValues> | undefined,
  next: Partial<TriadValues>,
): Partial<TriadValues> {
  const out: Partial<TriadValues> = { ...(existing ?? {}) };
  for (const axis of TRIAD_AXES) {
    const n = next[axis];
    if (typeof n === 'number') out[axis] = Math.max(out[axis] ?? 0, n);
  }
  return out;
}
