/**
 * Copy for the streak celebration (designs ST-1…ST-5), from the `home` catalog (`streakCelebration.*`). Gendered
 * through the ICU select; an unknown gender gets the neutral form (owner's gender-copy decisions). Same rules as the
 * home streak card: no emoji, no slash, no blame. Pure: the caller passes its translator.
 */
import type { AppGender } from '@/lib/utils/gendered-text';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { HomeKey } from '@/messages/ns/home';
import { nextMilestone, type Celebration } from './celebration.core';

/** A `home` translator: the overlay's `useT(home)`. */
export type CelebrationT = (key: HomeKey, values?: MessageValues) => string;

export interface CelebrationCopy {
  headline: string;
  sub: string;
  /** Under the big number (day / back variants). */
  unit: string;
}

function days(n: number, t: CelebrationT): string {
  return t('streakCelebration.days', { n, count: String(n) });
}

/** Male / female get their form; an unknown or "other" gender gets the neutral one. */
const genderOf = (gender: AppGender | null | undefined): AppGender => (gender === 'male' || gender === 'female' ? gender : 'other');

export function celebrationCopy(c: Celebration, gender: AppGender | null | undefined, t: CelebrationT): CelebrationCopy {
  const unit = c.streak === 1 ? t('streakCelebration.unit.one') : t('streakCelebration.unit.other');
  const streakDays = t('streakCelebration.headline.days', { streak: c.streak, count: String(c.streak) });
  switch (c.variant) {
    case 'day':
      return {
        headline: streakDays,
        sub: t('streakCelebration.day.sub', { next: String(c.streak + 1) }),
        unit,
      };
    case 'week':
      return {
        headline:
          c.streak === 7
            ? t('streakCelebration.week.full')
            : c.streak === 14
              ? t('streakCelebration.week.two')
              : t('streakCelebration.week.many', { weeks: c.streak / 7, count: String(c.streak / 7) }),
        sub: t('streakCelebration.week.sub'),
        unit,
      };
    case 'milestone': {
      const next = nextMilestone(c.streak);
      return {
        headline: streakDays,
        sub: next
          ? t('streakCelebration.milestone.subAhead', { gender: genderOf(gender), next: String(next) })
          : t('streakCelebration.milestone.sub'),
        unit,
      };
    }
    case 'shield': {
      const many = c.shieldDays.length > 1 ? 'yes' : 'no';
      const subKey =
        c.shieldsLeft > 0
          ? c.shieldsLeft === 1
            ? 'streakCelebration.shield.subOne'
            : 'streakCelebration.shield.subTwo'
          : 'streakCelebration.shield.subNone';
      return {
        headline: t('streakCelebration.shield.headline', { many }),
        sub: t(subKey, { many }),
        unit,
      };
    }
    case 'back':
      return {
        headline: t('streakCelebration.back.headline'),
        sub: t('streakCelebration.back.sub', { best: days(c.best, t) }),
        unit,
      };
  }
}

/** The overlay's button / aria labels. */
export function celebrationLabels(t: CelebrationT) {
  return {
    continue: t('streakCelebration.continue'),
    share: t('streakCelebration.share'),
    close: t('streakCelebration.close'),
  };
}

/** The share sheet text. */
export function shareText(c: Celebration, t: CelebrationT): string {
  return t('streakCelebration.shareText', { streak: c.streak, count: String(c.streak) });
}
