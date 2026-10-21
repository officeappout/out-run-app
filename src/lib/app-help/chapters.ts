/**
 * Help-hub chapters ("איך משתמשים ושאלות נפוצות", Kelly round 4). Pure data.
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
  title: string;
  /** One line under the title. */
  blurb: string;
  /** Replay this first-run tour (from `step`, 0-based). Absent = no tour, Q&A only. */
  tour?: { id: FirstRunTourId; step: number };
  /** Or open this screen ("show me" without a tour). */
  href?: string;
  /** Help entry ids under this chapter (app-help entries). */
  entryIds: string[];
}

export const HELP_CHAPTERS: readonly HelpChapter[] = [
  { id: 'map', title: 'מפה ופארקים', blurb: 'חיפוש פארק, שכבות המפה ומה רואים בפארק', tour: { id: 'map', step: 0 }, entryIds: ['parks_map', 'hybrid'] },
  { id: 'workouts', title: 'אימונים', blurb: 'האימון של היום, בניית אימון לבד ומיקום האימון', tour: { id: 'home', step: 0 }, entryIds: ['workout_builder', 'level_check', 'change_program', 'equipment'] },
  { id: 'schedule', title: 'בונה הלו״ז', blurb: 'הלו״ז השבועי, הזזת אימון ובניית שבוע', tour: { id: 'home', step: 2 }, entryIds: ['schedule'] },
  { id: 'running', title: 'ריצה והליכה', blurb: 'ריצה והליכה חופשית, מסלולים ותוכנית ריצה', href: '/map?openRun=running', entryIds: ['running', 'hybrid'] },
  { id: 'kelly', title: 'קלי', blurb: 'מה קלי יודע לעשות ואיך מדברים עם הצוות', href: '/ai-coach', entryIds: ['kelly', 'team'] },
  { id: 'settings', title: 'הגדרות', blurb: 'התראות, צעדים, ציוד, חשבון ופרטיות', entryIds: ['navigation', 'notifications', 'steps', 'account', 'privacy', 'tutorial'] },
];

export function helpChapter(id: string): HelpChapter | null {
  return HELP_CHAPTERS.find((c) => c.id === id) ?? null;
}
