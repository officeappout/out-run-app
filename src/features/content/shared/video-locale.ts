/**
 * Exercise tutorial video language (display only). Pure: no React, no Firebase.
 *
 * media.fullTutorial is a per-language map { he, en? }; resolveTutorialForLang(media, lang) falls back to `he`
 * when there is no `en` upload. English only when the content language is English (enable_i18n +
 * enable_content_locale + the user on English) AND enable_video_locale is on. Anything else is 'he',
 * which is exactly what every caller passed before.
 */
import type { AppLanguage } from './localized-text.types';

/** The languages a tutorial video can be uploaded in (same as exercise.types ExerciseLang; kept local to stay import-light). */
export type VideoLanguage = 'he' | 'en';

export function videoLanguage(contentLang: AppLanguage, videoFlagOn: boolean): VideoLanguage {
  return videoFlagOn && contentLang === 'en' ? 'en' : 'he';
}
