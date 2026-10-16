'use client';

/**
 * Kit alias for the shared streak card, so composition pages depend on the
 * summary/blocks surface rather than the concrete component path. Re-exported
 * in place (not relocated) — DopamineStreakBlock is also used directly by
 * AerobicSummaryView (live finish + history).
 */
export { default } from '../components/shared/DopamineStreakBlock';
