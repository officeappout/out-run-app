/**
 * Kelly round 4 — start_tutorial(topic): which help chapter, and what the model reads back.
 * Pure. The button under Kelly's reply (round4-turn.ts) replays the chapter's first-run tour
 * from its step, or opens the help hub when the chapter has no tour.
 */
import { firstRunTourSteps } from '@/features/user/onboarding/services/first-run-tour';
import { helpChapter } from '@/lib/app-help/chapters';
import type { CoachGender } from '../persona';
import type { StartTutorialInputT } from './tool-specs';

export function tutorialToolResult(input: StartTutorialInputT, gender: CoachGender): Record<string, unknown> {
  const ch = helpChapter(input.topic);
  if (!ch) return { started: false };
  const steps = ch.tour ? firstRunTourSteps(ch.tour.id, gender).slice(ch.tour.step).map((s) => s.text) : [];
  return {
    started: true,
    topic: ch.id,
    title: ch.title,
    tourSteps: steps,
    noteForCoach: ch.tour
      ? 'A button under your reply starts the short guided tour on the real screen. Your whole reply: at most two short sentences, what the tour shows (from tourSteps, in your words) and that the button under your reply starts it. Do not list the steps one by one.'
      : 'There is no guided tour for this topic; a button under your reply opens the help screen with questions and answers. Say so in one or two sentences, and answer the user\'s question with get_app_help if they asked one.',
  };
}
