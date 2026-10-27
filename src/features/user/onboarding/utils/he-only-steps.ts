/**
 * Which onboarding steps exist only for Hebrew (the lifestyle persona step: IDF / school / office picker).
 * There is no military persona in English, so a non-Hebrew UI skips them.
 *
 * ONE rule, pure. Today it is language-based; when it becomes country-based, change only this file
 * (add a `country` input) — every caller goes through useShowHeOnlySteps().
 */
import { SOURCE_LOCALE } from '@/lib/i18n/locales';

export interface HeOnlyStepsInput {
  /** The UI locale (useLocaleStore / useT().locale). */
  locale: string;
  /** hide_he_only_onboarding_steps — off means onboarding is exactly as before. */
  flagOn: boolean;
}

/** True = show the Hebrew-only steps. Flag off, or Hebrew → true (today's behaviour). */
export function shouldShowHeOnlySteps({ locale, flagOn }: HeOnlyStepsInput): boolean {
  if (!flagOn) return true;
  return locale === SOURCE_LOCALE;
}

/** Persona ids offered only when the Hebrew-only steps show (no military persona in English). */
export const HE_ONLY_PERSONA_IDS: readonly string[] = ['military'];

export function withoutHeOnlyPersonas<T extends string>(ids: readonly T[], show: boolean): T[] {
  return show ? [...ids] : ids.filter((id) => !HE_ONLY_PERSONA_IDS.includes(id));
}
