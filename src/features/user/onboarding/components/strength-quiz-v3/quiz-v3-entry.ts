/**
 * Strength questionnaire v3 (enable_strength_quiz_v3), entry logic. Pure, no React.
 *
 * Every strength signup entry (home program card, map assessment card, profile / progress rows,
 * the gateway strength track via the identity screen) lands on /onboarding-new/program-path.
 * Under the flag that route shows the v3 intro (welcome + assessment intro) instead of the goal
 * screen, and the program is always full body (the goal screen is skipped, owner 26.10.2026).
 */
import type { OnboardingKey } from '@/messages/ns/onboarding';

export interface QuizV3EntryInput {
  /** enable_strength_quiz_v3 as this viewer sees it (super-admin override applied). */
  flagOn: boolean;
  /** false while nothing is known about the viewer's flags yet. */
  flagsReady: boolean;
  /** onboardingPrefs 'gateway_track'. RUNNING visitors are redirected by the legacy screen. */
  gatewayTrack: string | null;
}

/** true = render the v3 intro; false = the legacy program-path screen, unchanged. */
export function isStrengthQuizV3Entry({ flagOn, flagsReady, gatewayTrack }: QuizV3EntryInput): boolean {
  return flagsReady && flagOn && gatewayTrack !== 'RUNNING';
}

export type IntroStep = 'welcome' | 'assessment';

/**
 * Which intro screen is showing, kept per tab so the assessment's back button (router.back())
 * returns to screen 2, not screen 1.
 */
export const INTRO_STEP_STORAGE_KEY = 'strength_quiz_v3_intro_step';

export function parseIntroStep(raw: string | null): IntroStep {
  return raw === 'assessment' ? 'assessment' : 'welcome';
}

export const NEXT_ROUTE = '/onboarding-new/assessment-visual';

// ── Screen 1: the push ladder (easy → hard) ────────────────────────────

export type LadderTone = 'easy' | 'mid' | 'hard';

export interface LadderItem {
  /** exercises/{id}: real media from the exercise library. */
  exerciseId: string;
  /** Level in the push program (the chip). */
  level: number;
  tone: LadderTone;
  nameKey: OnboardingKey;
}

/** Owner 26.10 (round 9): push-ups at 45° = push 2, push-ups = push 5, decline push-ups = push 10. */
export const PUSH_LADDER: readonly LadderItem[] = [
  { exerciseId: 'dGG8JVTj1NeSAEDhxvJT', level: 2, tone: 'easy', nameKey: 'quizV3.welcome.ladder.incline45' },
  { exerciseId: 'ecr0mBSRkTq6nQ8RVN91', level: 5, tone: 'mid', nameKey: 'quizV3.welcome.ladder.pushUps' },
  { exerciseId: '5Sex2i0m3X7PE3SicCHk', level: 10, tone: 'hard', nameKey: 'quizV3.welcome.ladder.decline' },
];

/** Index of the tile that plays after `index` (easy → hard, then from the start). */
export function nextLadderIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + 1) % count;
}

/** A clip that never fires `ended` (stalled stream) still hands over after this long. */
export const LADDER_CLIP_MAX_MS = 8000;
/** A tile without a video holds its still this long before the next one plays. */
export const LADDER_STILL_MS = 2500;
/** The tile highlighted when nothing plays (reduced motion): the middle one, as on the board. */
export const LADDER_STATIC_INDEX = 1;
