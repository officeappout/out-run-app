/**
 * difficulty-display.ts — the single source of truth for how a numeric
 * difficulty level (1|2|3) is presented, shared across domains (route.types.ts's
 * Route.difficulty and the workout engine's GeneratedWorkout both ultimately
 * render through DifficultyBolts). Deliberately in src/lib/, NOT under
 * src/features/parks/ or src/features/workout-engine/ — per axioms.md §7
 * ("Domain-agnostic... Shared utilities belong in src/lib/"), since
 * DifficultyBolts.tsx (workout-engine) needs this same map for its opt-in
 * severity color scheme and importing it from src/features/parks/ would be
 * a cross-domain violation.
 *
 * Route-enrichment-pipeline plan, Stage 5 quick win, 17.08.2026.
 */

export type DifficultyLevel = 1 | 2 | 3;

export interface DifficultyDisplayInfo {
  label: string;
  /** Number of filled bolts (equals the level itself, kept as an explicit
   *  field so a future display could diverge from level — e.g. a half-bolt
   *  scheme — without changing every call site's assumption). */
  bolts: number;
  /** Hex color, reusing the EXISTING green/amber/red triad already defined
   *  in .claude/knowledge/color-system.md §5 (status.success/warn/error) and
   *  already used ad-hoc for difficulty in RouteEditor.tsx's difficulty
   *  picker — not a new color choice. */
  color: string;
}

export const DIFFICULTY_DISPLAY: Record<DifficultyLevel, DifficultyDisplayInfo> = {
  1: { label: 'קל', bolts: 1, color: '#10B981' },
  2: { label: 'בינוני', bolts: 2, color: '#F59E0B' },
  3: { label: 'קשה', bolts: 3, color: '#EF4444' },
};
