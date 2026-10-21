/**
 * Per-authority quotas — NATIONWIDE-PLAN.md §3.7. The quota is a CEILING:
 * if there aren't enough good routes the set comes out smaller and is never
 * padded with mediocre generated ones.
 */

export type AuthoritySizeClass = 'large' | 'medium' | 'small' | 'regional';

export interface Range { min: number; max: number }

export interface AuthorityQuota {
  sizeClass: AuthoritySizeClass;
  total: Range;
  parkLoops: Range;
  cycling: Range;
  /** False when the size class was guessed (population missing on the authority doc). */
  populationKnown: boolean;
}

export const QUOTAS: Record<AuthoritySizeClass, Omit<AuthorityQuota, 'sizeClass' | 'populationKnown'>> = {
  large: { total: { min: 25, max: 40 }, parkLoops: { min: 6, max: 10 }, cycling: { min: 4, max: 8 } },
  medium: { total: { min: 15, max: 25 }, parkLoops: { min: 4, max: 6 }, cycling: { min: 2, max: 4 } },
  small: { total: { min: 8, max: 15 }, parkLoops: { min: 2, max: 4 }, cycling: { min: 0, max: 2 } },
  regional: { total: { min: 10, max: 20 }, parkLoops: { min: 0, max: 3 }, cycling: { min: 2, max: 5 } },
};

export const LARGE_CITY_MIN_POPULATION = 200_000;
export const MEDIUM_CITY_MIN_POPULATION = 70_000;

/**
 * Size class from the authority doc (`type`, `population`). A regional council
 * is always 'regional'. When population is missing we fall back to 'small'
 * (the smallest set — quality over quantity) and say so via populationKnown.
 */
export function authoritySizeClass(a: { type?: string | null; population?: number | null }): { sizeClass: AuthoritySizeClass; populationKnown: boolean } {
  if (a?.type === 'regional_council') return { sizeClass: 'regional', populationKnown: true };
  const pop = typeof a?.population === 'number' && Number.isFinite(a.population) && a.population > 0 ? a.population : null;
  if (pop == null) return { sizeClass: 'small', populationKnown: false };
  if (pop >= LARGE_CITY_MIN_POPULATION) return { sizeClass: 'large', populationKnown: true };
  if (pop >= MEDIUM_CITY_MIN_POPULATION) return { sizeClass: 'medium', populationKnown: true };
  return { sizeClass: 'small', populationKnown: true };
}

export function quotaForAuthority(a: { type?: string | null; population?: number | null }): AuthorityQuota {
  const { sizeClass, populationKnown } = authoritySizeClass(a);
  return { sizeClass, populationKnown, ...QUOTAS[sizeClass] };
}
