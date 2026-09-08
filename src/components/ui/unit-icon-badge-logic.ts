/**
 * Pure logic for UnitIconBadge's fallback state — kept out of the component
 * file so it's unit-testable without pulling in JSX (same reason
 * service-type-rank.ts was split out of HierarchySearchStep.tsx).
 */
const BADGE_GRADIENTS = [
  'linear-gradient(135deg, #6366F1, #8B5CF6)', // indigo → violet
  'linear-gradient(135deg, #EF4444, #F97316)', // crimson → orange
  'linear-gradient(135deg, #0EA5E9, #2563EB)', // sky → blue
  'linear-gradient(135deg, #10B981, #047857)', // emerald
  'linear-gradient(135deg, #EC4899, #BE185D)', // pink → magenta
  'linear-gradient(135deg, #F59E0B, #EA580C)', // amber → orange
  'linear-gradient(135deg, #14B8A6, #0E7490)', // teal → cyan
  'linear-gradient(135deg, #A855F7, #6D28D9)', // purple
];

// Same hash+palette NeighborhoodLeaderboard.tsx's avatarGradient() already
// uses for individual-user fallbacks — reused verbatim, not reinvented.
export function badgeGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BADGE_GRADIENTS[h % BADGE_GRADIENTS.length];
}

// displayNumber isn't synced onto unitDirectory (only the source
// tenants/.../units doc has it) — most callers only have `name`, so the
// embedded number is extracted from it instead ("גדוד 51"/"חטיבה 810"
// always carry it). Falls back to the name's first character for a
// genuinely nameless unit (סיירות, חטמ״רים — see src/lib/unit-id.ts).
export function unitBadgeGlyph(name: string, displayNumber?: number | null): string {
  const embeddedNumber = displayNumber ?? (name.match(/\d+/)?.[0] ?? null);
  if (embeddedNumber != null) return String(embeddedNumber);
  return name.trim().charAt(0) || '?';
}
