/**
 * Kelly phase 2 — the Hebrew copy of the quick replies. Pure.
 *
 * The user talks TO Kelly (a man), so requests are fixed ("תבנה לי"); only the user's own
 * self-references follow the user's gender ("אני עייף" / "אני עייפה"; unknown → a neutral
 * phrasing). No slashes, no emoji.
 */
import type { CoachGender } from '../persona';
import type { SuggestionChip } from './types';

type G = Record<CoachGender, string>;
const pick = (g: CoachGender, v: G): string => v[g] ?? v.other;

const say = (id: string, label: string, message?: string): SuggestionChip => (message ? { id, label, message } : { id, label });

export const C = {
  buildToday: () => say('build_today', 'תבנה לי את האימון של היום'),
  shortHome: () => say('short_home', 'תבנה לי אימון קצר בבית'),
  quick15: () => say('quick_15', 'תבנה לי אימון של 15 דק׳'),
  firstWorkout: () => say('first_workout', 'תבנה לי אימון ראשון קצר'),
  howAppWorks: () => say('how_app_works', 'איך האפליקציה עובדת?'),
  week: () => say('week', 'מה בתוכנית השבוע?'),
  tomorrow: () => say('tomorrow', 'מה מחכה לי מחר?'),
  returnLight: () => say('return_light', 'תבנה לי אימון חזרה קל'),
  returnWhere: () => say('return_where', 'חזרתי אחרי הפסקה, מאיפה מתחילים?'),
  moveDay: () => say('move_day', 'אפשר להזיז אימון ליום אחר?'),
  team: () => say('team', 'לדבר עם הצוות', 'אני רוצה לדבר עם מישהו מהצוות'),
  progress: (g: CoachGender) => say('progress', pick(g, { male: 'איך אני מתקדם?', female: 'איך אני מתקדמת?', other: 'איך ההתקדמות שלי?' })),
  tiredSkip: (g: CoachGender) =>
    say('tired_skip', pick(g, { male: 'אני עייף, כדאי לדלג היום?', female: 'אני עייפה, כדאי לדלג היום?', other: 'אין לי כוח היום, כדאי לדלג?' })),
  levelCheck: (name: string) => say('level_check', `מה זה בדיקת רמה ב${name}?`),
  rain: () => say('weather_rain', 'יורד גשם, תבנה לי אימון בבית'),
  heat: () => say('weather_heat', 'חם בחוץ, תבנה לי אימון קצר בבית'),
  cold: () => say('weather_cold', 'קר בחוץ, תבנה לי אימון בבית'),
  // After a built workout (the card is right above).
  start: (): SuggestionChip => ({ id: 'start', label: 'להתחיל', openCard: true }),
  shorter: () => say('shorter', 'קצר יותר', 'תבנה אותו קצר יותר'),
  noBar: () => say('no_bar', 'בלי מתח', 'תבנה אותו בלי מתח'),
  easier: () => say('easier', 'קל יותר', 'תבנה אותו קל יותר'),
};

/** "נסה:" in the user's grammar (the placeholder addresses the user). */
export function tryPrefix(g: CoachGender): string {
  return pick(g, { male: 'נסה: ', female: 'נסי: ', other: 'אפשר לנסות: ' });
}
