/**
 * Kelly phase 3 — the proactive message copy. Pure, deterministic.
 *
 * Persona rules (persona.ts): Kelly is a male coach writing Hebrew, the USER is addressed in
 * their own grammar (male / female / unknown = impersonal), never a slash form, no emoji,
 * no em-dash, short. Every template has one optional "flex" sentence: the deterministic
 * default below, or (sub-flag ai_coach_proactive_llm) one sentence from the fast model that
 * passes the same checks (llm.server.ts). Chips are action ids (action-chips.ts), so a
 * message can never carry an arbitrary link.
 */
import type { CoachGender } from '../persona';
import { checkLevelActionId, type CoachActionId } from '../action-chips';
import { isAssessableSlug } from '../assessment-gaps';
import type { TemplateKey, TemplateVars } from './types';

export interface RenderInput {
  templateKey: TemplateKey;
  vars: TemplateVars;
  gender: CoachGender;
  firstName: string;
  /** Replaces the template's flex sentence (already validated). */
  flex?: string | null;
}

export interface RenderedMessage {
  text: string;
  actions: CoachActionId[];
  /** Written to the thread without a push (morning after the training reminder). */
  silent: boolean;
  /** What the flex sentence should do (the LLM brief); null = no flex slot. */
  flexHint: string | null;
}

type G<T = string> = Record<CoachGender, T>;
const byGender = (g: CoachGender, v: G): string => v[g] ?? v.other;

const num = (v: TemplateVars[string]): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: TemplateVars[string]): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function hello(firstName: string, word: 'בוקר טוב' | 'היי'): string {
  return firstName ? `${word} ${firstName}.` : `${word}.`;
}

function sessionLine(gender: CoachGender, vars: TemplateVars): string {
  const label = text(vars.label) ?? 'אימון';
  const minutes = num(vars.minutes);
  const time = text(vars.time);
  const detail = `${label}${minutes ? ` של ${minutes} דקות` : ''}${time ? ` ב-${time}` : ''}`;
  return gender === 'other' ? `היום מתוכנן ${detail}.` : `היום יש לך ${detail}.`;
}

function join(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && !!p.trim()).join(' ').replace(/\s+/g, ' ').trim();
}

const WEEKLY_PRAISE: { many: G; few: string } = {
  many: { male: 'אתה בונה שגרה אמיתית, כל הכבוד.', female: 'את בונה שגרה אמיתית, כל הכבוד.', other: 'זו כבר שגרה אמיתית, כל הכבוד.' },
  few: 'כל אימון נספר, יפה מאוד.',
};

function weeklyStats(vars: TemplateVars): string {
  const workouts = num(vars.workouts) ?? 0;
  const days = num(vars.activeDays) ?? 0;
  const minutes = num(vars.minutes) ?? 0;
  const streak = num(vars.streak);
  const steps = num(vars.avgSteps);
  const parts = [workouts === 1 ? 'אימון אחד' : `${workouts} אימונים`];
  if (workouts > 1 && days > 0 && days < workouts) parts[0] += days === 1 ? ' ביום אחד' : ` ב-${days} ימים`;
  if (minutes > 0) parts.push(`${minutes} דקות בסך הכול`);
  if (streak !== null && streak >= 2) parts.push(`רצף של ${streak} ימים`);
  if (steps !== null && steps >= 1000) parts.push(`ממוצע של ${Math.round(steps / 100) * 100} צעדים ביום`);
  return parts.join(', ');
}

function weeklySuggestion(workouts: number): string {
  if (workouts >= 4) return 'לשבוע הבא כדאי לשמור על יום מנוחה אחד לפחות.';
  if (workouts === 3) return 'לשבוע הבא אפשר להוסיף אימון קצר אחד, אם מתחשק.';
  return 'לשבוע הבא ננסה להוסיף עוד אימון קצר אחד.';
}

export function renderProactive(i: RenderInput): RenderedMessage {
  const g = i.gender;
  const v = i.vars;
  const flex = (fallback: string | null) => (i.flex ? i.flex : fallback);
  switch (i.templateKey) {
    case 'morning':
      return {
        text: join(hello(i.firstName, 'בוקר טוב'), sessionLine(g, v), flex(null), byGender(g, { male: 'רוצה שאבנה לך אותו עכשיו?', female: 'רוצה שאבנה לך אותו עכשיו?', other: 'אפשר לבנות אותו עכשיו בכפתור למטה.' })),
        actions: ['build_today'],
        silent: v.silent === 1,
        flexHint: 'one short encouraging sentence for the start of a training day, tied to the user\'s goal or recent effort',
      };
    case 'morning_open':
      return {
        text: join(hello(i.firstName, 'בוקר טוב'), sessionLine(g, v), flex(null), byGender(g, { male: 'בהצלחה, אני פה אם תרצה לשנות משהו.', female: 'בהצלחה, אני פה אם תרצי לשנות משהו.', other: 'בהצלחה, אני פה אם צריך לשנות משהו.' })),
        actions: ['open_schedule'],
        silent: v.silent === 1,
        flexHint: 'one short encouraging sentence for the start of a training day, tied to the user\'s goal or recent effort',
      };
    case 'weather_rain':
      return {
        text: join(hello(i.firstName, 'בוקר טוב'), 'נראה שיהיה גשם היום, אז אולי כדאי להעביר את האימון של היום הביתה.', flex(null), byGender(g, { male: 'רוצה שאבנה לך אימון בבית?', female: 'רוצה שאבנה לך אימון בבית?', other: 'אפשר לבנות אימון בבית בכפתור למטה.' })),
        actions: ['build_home'],
        silent: false,
        flexHint: 'one short sentence that a home workout today still counts',
      };
    case 'weather_heat': {
      const label = text(v.label) ?? 'אימון';
      return {
        text: join(hello(i.firstName, 'בוקר טוב'), 'היום חם מאוד בחוץ.', byGender(g, { male: `אם אתה יוצא ל${label}, עדיף מוקדם בבוקר או בצל, ולשתות הרבה מים.`, female: `אם את יוצאת ל${label}, עדיף מוקדם בבוקר או בצל, ולשתות הרבה מים.`, other: `מי שיוצא ל${label}, עדיף מוקדם בבוקר או בצל, ולשתות הרבה מים.` }), flex(null)),
        actions: ['open_schedule'],
        silent: false,
        flexHint: 'one short sentence that it is fine to go easier in the heat',
      };
    }
    case 'weekly': {
      const workouts = num(v.workouts) ?? 0;
      const praise = workouts >= 3 ? byGender(g, WEEKLY_PRAISE.many) : WEEKLY_PRAISE.few;
      return {
        text: join(`סיכום שבועי${i.firstName ? ` ל${i.firstName}` : ''}: ${weeklyStats(v)}.`, flex(praise), weeklySuggestion(workouts)),
        actions: ['open_schedule'],
        silent: false,
        flexHint: 'one short warm sentence of praise for this week, without numbers',
      };
    }
    case 'assessment': {
      const name = text(v.name) ?? 'אחד התחומים';
      const slug = text(v.slug);
      return {
        text: join(
          hello(i.firstName, 'היי'),
          g === 'other' ? `עדיין אין בדיקת רמה ב${name}, ולכן האימונים עוד לא כוללים את התחום הזה.` : `חסרה לך בדיקת רמה ב${name}, ולכן האימונים שלך עוד לא כוללים את התחום הזה.`,
          flex(null),
          byGender(g, { male: 'זה לוקח כמה דקות. רוצה לבדוק עכשיו?', female: 'זה לוקח כמה דקות. רוצה לבדוק עכשיו?', other: 'זה לוקח כמה דקות, אפשר להתחיל בכפתור למטה.' }),
        ),
        actions: slug && isAssessableSlug(slug) ? [checkLevelActionId(slug)] : [],
        silent: false,
        flexHint: 'one short sentence on why a level check makes the workouts fit better',
      };
    }
    case 'post_workout': {
      const minutes = num(v.minutes);
      const what = minutes ? `אימון של ${minutes} דקות` : 'אימון';
      return {
        text: join(g === 'other' ? `ה${what} נשמר, כל הכבוד.` : `סיימת ${what}, כל הכבוד.`, flex(null), 'איך היה?'),
        actions: ['rate_easy', 'rate_right', 'rate_hard'],
        silent: false,
        flexHint: null,
      };
    }
  }
}

/** The text a rendered template may never contain (persona rules), for tests and the LLM guard. */
export const FORBIDDEN_COPY = /[/\\]|[\u2013\u2014]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/;
