/**
 * Help-hub chapters ("איך משתמשים ושאלות נפוצות", Kelly round 4). Pure data.
 *
 * Titles / blurbs live in the legal catalog (`help.chapter.<id>.title|blurb`).
 *
 * Each chapter maps to the existing first-run coach-mark tour (first-run-tour.ts) where one
 * exists, optionally starting at a step, and lists the help entries (by id) shown under it.
 * Kelly's start_tutorial(topic) takes these ids.
 */
import type { FirstRunTourId } from '@/features/user/onboarding/services/first-run-tour';

export const HELP_CHAPTER_IDS = ['map', 'workouts', 'schedule', 'running', 'kelly', 'settings'] as const;
export type HelpChapterId = (typeof HELP_CHAPTER_IDS)[number];

export interface HelpChapter {
  id: HelpChapterId;
  /** Replay this first-run tour (from `step`, 0-based). Absent = no tour, Q&A only. */
  tour?: { id: FirstRunTourId; step: number };
  /** Or open this screen ("show me" without a tour). */
  href?: string;
  /** Help entry ids under this chapter (app-help entries). */
  entryIds: string[];
}

export const HELP_CHAPTERS: readonly HelpChapter[] = [
  { id: 'map', tour: { id: 'map', step: 0 }, entryIds: ['parks_map', 'hybrid'] },
  { id: 'workouts', tour: { id: 'home', step: 0 }, entryIds: ['workout_builder', 'level_check', 'change_program', 'equipment'] },
  { id: 'schedule', tour: { id: 'home', step: 2 }, entryIds: ['schedule'] },
  { id: 'running', href: '/map?openRun=running', entryIds: ['running', 'hybrid'] },
  { id: 'kelly', href: '/ai-coach', entryIds: ['kelly', 'team'] },
  { id: 'settings', entryIds: ['navigation', 'notifications', 'steps', 'account', 'privacy', 'tutorial'] },
];

export function helpChapter(id: string): HelpChapter | null {
  return HELP_CHAPTERS.find((c) => c.id === id) ?? null;
}
