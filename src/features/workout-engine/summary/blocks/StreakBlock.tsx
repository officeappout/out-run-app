'use client';

/**
 * Kit alias for the shared streak card, so composition pages depend on the
 * summary/blocks surface rather than the concrete component path. Re-exported
 * in place (not relocated) — DopamineStreakBlock is also used by the live
 * FreeRunSummary (profile history).
 */
export { default } from '../components/shared/DopamineStreakBlock';
