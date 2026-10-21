// ==========================================
// מילון תרגומים (i18n)
// כל הטקסטים באפליקציה - ללא Hardcoding
// ==========================================

import heCatalog from '@/messages/he/legacy-dictionary.json';
import enCatalog from '@/messages/en/legacy-dictionary.json';
import type { LegacyContentLanguage, Locale } from './locales';

export type DictionaryKey =
  // Onboarding - כללי
  | 'onboarding.welcome.title'
  | 'onboarding.welcome.subtitle'
  | 'onboarding.continue'
  | 'onboarding.skip'
  | 'onboarding.back'

  // פרטים אישיים
  | 'onboarding.personal.title'
  | 'onboarding.personal.name.question'
  | 'onboarding.personal.name.placeholder'
  | 'onboarding.personal.birthdate.question'
  | 'onboarding.personal.birthdate.minAge'
  | 'onboarding.personal.gender.question'
  | 'onboarding.personal.gender.male'
  | 'onboarding.personal.gender.female'
  | 'onboarding.personal.gender.other'

  // מטרה
  | 'onboarding.goal.title'
  | 'onboarding.goal.subtitle'
  | 'onboarding.goal.healthy_lifestyle'
  | 'onboarding.goal.performance_boost'
  | 'onboarding.goal.weight_loss'
  | 'onboarding.goal.skill_mastery'

  // רמת כושר
  | 'onboarding.fitness.title'
  | 'onboarding.fitness.subtitle'
  | 'onboarding.fitness.beginner.title'
  | 'onboarding.fitness.beginner.description'
  | 'onboarding.fitness.intermediate.title'
  | 'onboarding.fitness.intermediate.description'
  | 'onboarding.fitness.advanced.title'
  | 'onboarding.fitness.advanced.description'

  // ימי אימון
  | 'onboarding.schedule.frequency.question'
  | 'onboarding.schedule.frequency.subtitle'
  | 'onboarding.schedule.days.question'
  | 'onboarding.schedule.days.restRecommendation'
  | 'onboarding.schedule.time.question'
  | 'onboarding.schedule.location.additional'

  // ציוד
  | 'onboarding.equipment.title'
  | 'onboarding.equipment.none'
  | 'onboarding.equipment.home'
  | 'onboarding.equipment.gym'
  | 'onboarding.equipment.selectItems'
  | 'onboarding.equipment.pullUpBar'
  | 'onboarding.equipment.parallelBars'
  | 'onboarding.equipment.resistanceBand'
  | 'onboarding.equipment.weights'
  | 'onboarding.equipment.trx'
  | 'onboarding.equipment.rings'

  // הצהרת בריאות
  | 'onboarding.health.title'
  | 'onboarding.health.disclaimer'
  | 'onboarding.health.medicalWarning'
  | 'onboarding.health.consultDoctor'
  | 'onboarding.health.defaultNo'
  | 'onboarding.health.heartDisease'
  | 'onboarding.health.chestPainRest'
  | 'onboarding.health.chestPainActivity'
  | 'onboarding.health.approve'
  | 'onboarding.health.strictTerms'

  | 'onboarding.personal.weight.title'
  | 'onboarding.personal.weight.question'

  // תנאי שימוש
  | 'onboarding.terms.title'

  // מיקום
  | 'onboarding.location.title'
  | 'onboarding.location.question'
  | 'onboarding.location.description'
  | 'onboarding.location.placeholder'
  | 'onboarding.location.findPark.title'
  | 'onboarding.location.findPark.description'
  | 'onboarding.location.findPark.search'

  // OTP
  | 'onboarding.otp.title'
  | 'onboarding.otp.description'
  | 'onboarding.otp.placeholder'
  | 'onboarding.otp.sendCode'
  | 'onboarding.otp.verify'
  | 'onboarding.otp.codePlaceholder'

  // סיכום
  | 'onboarding.summary.loading'
  | 'onboarding.summary.welcome'
  | 'onboarding.summary.greeting'
  | 'onboarding.summary.trainingDays'
  | 'onboarding.summary.myLevel'
  | 'onboarding.summary.persistentTrainees'
  | 'onboarding.summary.persistentTrainees.description'
  | 'onboarding.summary.myChallenge'
  | 'onboarding.summary.myChallenge.instruction'
  | 'onboarding.summary.startButton'

  // שמירת התקדמות
  | 'onboarding.saveProgress.title'
  | 'onboarding.saveProgress.description'
  | 'onboarding.saveProgress.continue'

  // Exercise / Workout
  | 'exercise.instructionalVideo.button'
  | 'exercise.loggingMode.reps'
  | 'exercise.loggingMode.completion'
  | 'exercise.loggingMode.reps.description'
  | 'exercise.loggingMode.completion.description'

  // Challenge booth — landing
  | 'challenge.landing.badge'
  | 'challenge.landing.howItWorks'
  | 'challenge.landing.step1.title'
  | 'challenge.landing.step1.desc'
  | 'challenge.landing.step2.title'
  | 'challenge.landing.step2.desc'
  | 'challenge.landing.step3.title'
  | 'challenge.landing.step3.desc'
  | 'challenge.landing.cta'
  | 'challenge.landing.ctaNote'
  | 'challenge.landing.notFound'
  | 'challenge.landing.notFoundDesc'
  | 'challenge.stats.participants'
  | 'challenge.stats.topScore'
  | 'challenge.stats.topMen'
  | 'challenge.stats.topWomen'
  | 'challenge.stats.average'

  // Challenge booth — join form
  | 'challenge.join.title'
  | 'challenge.join.subtitle'
  | 'challenge.join.nameLabel'
  | 'challenge.join.namePlaceholder'
  | 'challenge.join.ageLabel'
  | 'challenge.join.agePlaceholder'
  | 'challenge.join.genderLabel'
  | 'challenge.join.gender.male'
  | 'challenge.join.gender.female'
  | 'challenge.join.gender.other'
  | 'challenge.join.submit'
  | 'challenge.join.note'
  | 'challenge.join.error.invalidCode'
  | 'challenge.join.error.general'

  // Challenge booth — timer
  | 'challenge.timer.instruction'
  | 'challenge.timer.exerciseName'

  // Challenge booth — done
  | 'challenge.done.congrats'
  | 'challenge.done.seconds'
  | 'challenge.done.minutes'
  | 'challenge.done.rank.place'
  | 'challenge.done.rank.of'
  | 'challenge.done.rank.men'
  | 'challenge.done.rank.women'
  | 'challenge.done.rank.overall'
  | 'challenge.done.saveTitle'
  | 'challenge.done.saveDesc'
  | 'challenge.done.googleBtn'
  | 'challenge.done.appleBtn'
  | 'challenge.done.free'
  | 'challenge.done.saved'
  | 'challenge.done.savedDesc'
  | 'challenge.done.qrLabel'
  | 'challenge.done.error.accountExists'
  | 'challenge.done.error.generic'
  | 'challenge.done.error.general'
  | 'challenge.done.existingAccount'
  | 'challenge.done.signin'
  | 'challenge.done.download.title'
  | 'challenge.done.download.ios'
  | 'challenge.done.download.android'

  // Challenge booth — plasma display
  | 'challenge.booth.participants'
  | 'challenge.booth.men'
  | 'challenge.booth.women'
  | 'challenge.booth.overall'
  | 'challenge.booth.waiting'
  | 'challenge.booth.newEntry.suffix'
  | 'challenge.booth.refresh'
  | 'challenge.booth.error';

// ==========================================
// הטקסטים עצמם יושבים בקטלוגים (i18n wave 1):
//   src/messages/he/legacy-dictionary.json, src/messages/en/legacy-dictionary.json
// TODO(i18n wave 2D/2I): split these keys into the onboarding / social namespaces,
// move the screens to useT(), and delete this file (docs/i18n/PLAN.md §1.4).
// ==========================================

export const he: Record<DictionaryKey, string> = heCatalog;

// אנגלית: מפתח בלי תרגום מחזיר את המפתח עצמו (כמו קודם).
export const en: Record<DictionaryKey, string> = {
  ...Object.keys(he).reduce((acc, key) => {
    acc[key as DictionaryKey] = key;
    return acc;
  }, {} as Record<DictionaryKey, string>),
  ...(enCatalog as Partial<Record<DictionaryKey, string>>),
};

// ==========================================
// פונקציית עזר לקבלת תרגום
// ==========================================
// Any language other than 'he' reads the English dictionary (callers pass the onboarding
// 'ru' and the content 'es' too — they always got English here).
export function getTranslation(
  key: DictionaryKey,
  language: Locale | LegacyContentLanguage = 'he'
): string {
  const dict = language === 'he' ? he : en;
  return dict[key] || key;
}
