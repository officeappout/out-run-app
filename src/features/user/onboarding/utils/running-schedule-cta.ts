/**
 * The running schedule screen's CTA + success labels.
 *
 * In the lifestyle wizard (isJIT) the user may be choosing running days for
 * the FIRST time (still on the signup's system default). "שמירת שינויים" /
 * "לוח ריצה עודכן!" read wrong there (19.10.2026 audit fix §3.10), so a first
 * choice says "שמירה" / "לוח ריצה נשמר!". A user who already chose days keeps
 * the edit wording.
 */
import { makeLiveT } from '@/lib/i18n/live-t';
import { common } from '@/messages/ns/common';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeLiveT(onboarding);
const tc = makeLiveT(common);

export interface RunningScheduleCtaInput {
  isJIT: boolean | undefined;
  isLastStep: boolean | undefined;
  /** running.scheduleDaysSource on the profile. */
  scheduleDaysSource: unknown;
}

export interface RunningScheduleCta {
  label: string;
  successLabel: string | undefined;
}

export function resolveRunningScheduleCta(input: RunningScheduleCtaInput): RunningScheduleCta {
  if (!input.isJIT) {
    return { label: input.isLastStep ? t('runCta.letsRun') : tc('actions.continue'), successLabel: undefined };
  }
  const isFirstChoice = input.scheduleDaysSource !== 'user-chosen';
  return isFirstChoice
    ? { label: tc('actions.save'), successLabel: t('runCta.saved') }
    : { label: t('steps.schedule.cta.save'), successLabel: t('runCta.updated') };
}
