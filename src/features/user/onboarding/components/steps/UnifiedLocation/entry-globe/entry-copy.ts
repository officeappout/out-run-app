/**
 * Entry flow v2 — the globe headline's copy (namespace `onboarding`, keys `entryHeadline.*`).
 * The location drawers' own copy lives in their catalog keys (`location.entry.*`).
 */
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

export const ENTRY_COPY = {
  headlinePre: t('entryHeadline.pre'),
  headlineGoals: [
    t('entryHeadline.goal.0'),
    t('entryHeadline.goal.1'),
    t('entryHeadline.goal.2'),
    t('entryHeadline.goal.3'),
  ] as const,
  headlineNeed: t('entryHeadline.need'),
  headlineNothing: t('entryHeadline.nothing'),
} as const;
