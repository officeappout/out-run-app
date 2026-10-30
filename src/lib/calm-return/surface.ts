/**
 * Calm return — what the user SEES on an app open. At most ONE item, never a full-screen
 * modal, never a day count, never "פספסת" / "איפה היית".
 *
 * Priority: fresh-week card > welcome-back card title > makeup card.
 *   - fresh-week card: only on the open that started a new episode (7+ days away).
 *     28+ days adds an optional "רוצה לבדוק רמה?" link (never an automatic redirect).
 *   - welcome-back title: 4–6 days away — the workout card's own title/subtitle change,
 *     nothing is added.
 *   - makeup: 0–3 days, only the LATEST missed session and only when it is ≤2 days old,
 *     shown as today's workout card. The candidate comes from the caller (the schedule
 *     advisor's adviseToday().makeup, #440, is the intended source).
 *
 * Copy is in the site's simple voice, with male/female variants instead of slashes.
 */
import { MAKEUP_MAX_AGE_DAYS, type CalmReturnState } from './policy';
import { makeLiveT } from '@/lib/i18n/live-t';
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { home } from '@/messages/ns/home';

export type CalmGender = 'male' | 'female' | 'other' | null | undefined;

export interface MakeupCandidate {
  /** Whole days since the missed session (1 = yesterday). */
  ageDays: number;
  /** True only for the most recent missed session. */
  isLatestMissed: boolean;
}

export type CalmSurface =
  | { kind: 'none' }
  | { kind: 'fresh_week_card'; showLevelCheckLink: boolean }
  | { kind: 'welcome_back_title' }
  | { kind: 'makeup_card' };

export function pickCalmSurface(input: {
  state: CalmReturnState;
  /** The fresh-week card was already dismissed during this open. */
  freshWeekCardDismissed?: boolean;
  makeup?: MakeupCandidate | null;
}): CalmSurface {
  const { state, freshWeekCardDismissed, makeup } = input;
  if (state.shouldStartEpisode && !freshWeekCardDismissed) {
    return { kind: 'fresh_week_card', showLevelCheckLink: state.tier === 're_entry' };
  }
  if (state.tier === 'welcome_back') return { kind: 'welcome_back_title' };
  if (
    state.tier === 'on_track' &&
    makeup &&
    makeup.isLatestMissed &&
    makeup.ageDays >= 1 &&
    makeup.ageDays <= MAKEUP_MAX_AGE_DAYS
  ) {
    return { kind: 'makeup_card' };
  }
  return { kind: 'none' };
}

const tLive = makeLiveT(home);
const tSource = makeT(SOURCE_LOCALE, home);

/**
 * All user-facing calm-return copy. No numbers, no guilt.
 * `source: true` gives the Hebrew text for values that are SAVED with a workout or matched by logic
 * (badge, cue, run label): stored values stay Hebrew, display goes through the live (UI language) copy.
 */
export function calmCopy(gender: CalmGender, opts: { source?: boolean } = {}) {
  const t = opts.source ? tSource : tLive;
  const mf = gender === 'female' ? 'female' : 'male';
  return {
    freshWeekTitle: t('calmReturn.freshWeek.title'),
    freshWeekBody: t(`calmReturn.freshWeek.body.${mf}`),
    levelCheckLink: t('calmReturn.levelCheckLink'),
    welcomeBackTitle: t('calmReturn.welcomeBack.title'),
    welcomeBackSubtitle: t('calmReturn.welcomeBack.subtitle'),
    makeupTitle: t('calmReturn.makeup.title'),
    /** Replaces "🦥 חזרה אחרי X ימים" / "💪 חזרת אחרי X ימים!" in the workout itself. */
    lightVersionBadge: t('calmReturn.lightVersion.badge'),
    lightVersionCue: t(`calmReturn.lightVersion.cue.${mf}`),
    /** A run block label (logic key, matched and saved): always the Hebrew source. */
    easyRunLabel: 'ריצה קלה', // i18n-allow-hebrew: run block label is data (displayed through run-block-label.ts)
  };
}
