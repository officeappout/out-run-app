/**
 * "מוכן לנסות לרוץ?" (enable_home_two_cards_v1, canvas WR-6) — when the card shows. Pure.
 * A walker (planned walks, no strength or running plan) with 4+ consecutive walk weeks sees it;
 * "לא עכשיו" hides it for 30 days (local stamp, per user).
 */
import { TRY_RUNNING_MIN_WEEKS } from './walk-streak';

export const TRY_RUNNING_DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const tryRunningDismissKey = (uid: string) => `home_try_running_dismissed_v1:${uid}`;
export const TRY_RUNNING_CARD_ID = 'try-running-card' as const;

/** "לא עכשיו" was tapped less than 30 days ago. A bad / future stamp counts as not dismissed. */
export function isTryRunningDismissed(dismissedAtMs: number | null | undefined, nowMs: number): boolean {
  if (dismissedAtMs == null || !Number.isFinite(dismissedAtMs)) return false;
  const age = nowMs - dismissedAtMs;
  return age >= 0 && age < TRY_RUNNING_DISMISS_DAYS * DAY_MS;
}

export function shouldShowTryRunning(input: {
  enabled: boolean;
  /** Walks, and has neither a strength nor a running plan. */
  walkOnly: boolean;
  streakWeeks: number;
  dismissedAtMs: number | null | undefined;
  nowMs: number;
}): boolean {
  return (
    input.enabled &&
    input.walkOnly &&
    input.streakWeeks >= TRY_RUNNING_MIN_WEEKS &&
    !isTryRunningDismissed(input.dismissedAtMs, input.nowMs)
  );
}
