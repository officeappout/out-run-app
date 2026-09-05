/**
 * Extracted from src/app/admin/organizations/page.tsx (added after the
 * חטיבה 810 duplicate-authority incident — no name-collision guard existed
 * before that). Shared so any new dedup check (unit import, pending-unit
 * submission) uses the exact same normalization, not a second copy.
 */
export function normalizeOrgName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
