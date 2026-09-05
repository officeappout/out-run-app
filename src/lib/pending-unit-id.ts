/**
 * Deterministic ID scheme for a user-submitted "היחידה שלי לא ברשימה" unit —
 * approved 04.09.2026, same convention family as Task 1's bde_/bn_ import
 * (scripts/import-military-units.ts): co_<parentUnitId>_<slug> for a
 * company, extended analogously for the other two levels a soldier can hit
 * "add" on. Deterministic + parent-scoped means:
 *   - uniqueness by construction — no separate collision scan needed
 *   - the SAME computed id doubles as the dedup key: if a real unit with
 *     this exact id already exists, that's "found an existing sibling",
 *     answered by attaching directly rather than submitting (see the CTA's
 *     dedup-before-submit check in HierarchySearchStep.tsx)
 *
 * Company and battalion are scoped by their real immediate parent's own key
 * (parentUnitId for a company under a battalion, orgId for a battalion
 * directly under a brigade) — user-submitted names are unreviewed, unlike
 * Task 1's file, so even a battalion-level name gets the same cross-parent
 * collision protection a plain bn_u_<slug> (global) wouldn't have.
 * Brigade-level has no parent to scope by; mirrors Task 1's own bde_u_
 * convention for unnumbered brigades exactly.
 */

function slugifyUnitName(name: string): string {
  return name
    .trim()
    .replace(/["'׳״]/g, '')
    .replace(/\s+/g, '_');
}

export type PendingUnitLevel = 'brigade' | 'battalion' | 'company';

export interface ComputePendingUnitIdInput {
  level: PendingUnitLevel;
  /** Real orgId (brigade authority/tenant id) — null only when level is 'brigade' itself. */
  orgId: string | null;
  /** Real unitId of the immediate parent battalion — set only when level is 'company'. */
  parentUnitId: string | null;
  name: string;
}

export function computePendingUnitId({ level, orgId, parentUnitId, name }: ComputePendingUnitIdInput): string {
  const slug = slugifyUnitName(name);
  if (!slug) throw new Error('computePendingUnitId: name is required');

  if (level === 'brigade') return `bde_u_${slug}`;
  if (level === 'battalion') {
    if (!orgId) throw new Error('computePendingUnitId: orgId is required for a battalion-level submission');
    return `bn_${orgId}_${slug}`;
  }
  if (!parentUnitId) throw new Error('computePendingUnitId: parentUnitId is required for a company-level submission');
  return `co_${parentUnitId}_${slug}`;
}
