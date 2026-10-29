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
import { coachT, type CoachLocale } from '../coach-locale';

type T = ReturnType<typeof coachT>;

export interface RenderInput {
  templateKey: TemplateKey;
  vars: TemplateVars;
  gender: CoachGender;
  firstName: string;
  /** Replaces the template's flex sentence (already validated). */
  flex?: string | null;
  /** Reply language (Kelly server locale). Default 'he': byte-identical to before. */
  locale?: CoachLocale;
}

export interface RenderedMessage {
  text: string;
  actions: CoachActionId[];
  /** Written to the thread without a push (morning after the training reminder). */
  silent: boolean;
  /** What the flex sentence should do (the LLM brief); null = no flex slot. */
  flexHint: string | null;
}

const num = (v: TemplateVars[string]): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: TemplateVars[string]): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function hello(t: T, firstName: string, word: 'morning' | 'hi'): string {
  return firstName ? t(`proactive.hello.${word}`, { name: firstName }) : t(`proactive.hello.${word}NoName`);
}

function sessionLine(t: T, gender: CoachGender, vars: TemplateVars): string {
  const label = text(vars.label) ?? t('proactive.defaultLabel');
  const minutes = num(vars.minutes);
  const time = text(vars.time);
  const detail = t('proactive.session.detail', {
    label,
    hasMinutes: minutes ? 'yes' : 'no',
    minutes: String(minutes ?? ''),
    hasTime: time ? 'yes' : 'no',
    time: time ?? '',
  });
  return t('proactive.session.line', { gender, detail });
}

function join(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && !!p.trim()).join(' ').replace(/\s+/g, ' ').trim();
}

function weeklyStats(t: T, vars: TemplateVars): string {
  const workouts = num(vars.workouts) ?? 0;
  const days = num(vars.activeDays) ?? 0;
  const minutes = num(vars.minutes) ?? 0;
  const streak = num(vars.streak);
  const steps = num(vars.avgSteps);
  const daysShown = workouts > 1 && days > 0 && days < workouts ? days : 0;
  const parts = [t('proactive.stats.workouts', { workouts, days: daysShown })];
  if (minutes > 0) parts.push(t('proactive.stats.minutes', { minutes: String(minutes) }));
  if (streak !== null && streak >= 2) parts.push(t('proactive.stats.streak', { streak: String(streak) }));
  if (steps !== null && steps >= 1000) parts.push(t('proactive.stats.steps', { steps: String(Math.round(steps / 100) * 100) }));
  return parts.join(', ');
}

function weeklySuggestion(t: T, workouts: number): string {
  if (workouts >= 4) return t('proactive.weekly.suggestRest');
  if (workouts === 3) return t('proactive.weekly.suggestAddOptional');
  return t('proactive.weekly.suggestAdd');
}

export function renderProactive(i: RenderInput): RenderedMessage {
  const t = coachT(i.locale);
  const g = i.gender;
  const v = i.vars;
  const flex = (fallback: string | null) => (i.flex ? i.flex : fallback);
  switch (i.templateKey) {
    case 'morning':
      return {
        text: join(hello(t, i.firstName, 'morning'), sessionLine(t, g, v), flex(null), t('proactive.morning.ask', { gender: g })),
        actions: ['build_today'],
        silent: v.silent === 1,
        flexHint: 'one short encouraging sentence for the start of a training day, tied to the user\'s goal or recent effort',
      };
    case 'morning_open':
      return {
        text: join(hello(t, i.firstName, 'morning'), sessionLine(t, g, v), flex(null), t('proactive.morningOpen.close', { gender: g })),
        actions: ['open_schedule'],
        silent: v.silent === 1,
        flexHint: 'one short encouraging sentence for the start of a training day, tied to the user\'s goal or recent effort',
      };
    case 'weather_rain':
      return {
        text: join(hello(t, i.firstName, 'morning'), t('proactive.rain.body'), flex(null), t('proactive.rain.ask', { gender: g })),
        actions: ['build_home'],
        silent: false,
        flexHint: 'one short sentence that a home workout today still counts',
      };
    case 'weather_heat': {
      const label = text(v.label) ?? t('proactive.defaultLabel');
      return {
        text: join(hello(t, i.firstName, 'morning'), t('proactive.heat.intro'), t('proactive.heat.advice', { gender: g, label }), flex(null)),
        actions: ['open_schedule'],
        silent: false,
        flexHint: 'one short sentence that it is fine to go easier in the heat',
      };
    }
    case 'weekly': {
      const workouts = num(v.workouts) ?? 0;
      const praise = workouts >= 3 ? t('proactive.praise.many', { gender: g }) : t('proactive.praise.few');
      return {
        text: join(i.firstName ? t('proactive.weekly.summaryNamed', { name: i.firstName, stats: weeklyStats(t, v) }) : t('proactive.weekly.summary', { stats: weeklyStats(t, v) }), flex(praise), weeklySuggestion(t, workouts)),
        actions: ['open_schedule'],
        silent: false,
        flexHint: 'one short warm sentence of praise for this week, without numbers',
      };
    }
    case 'assessment': {
      const name = text(v.name) ?? t('proactive.assessment.defaultName');
      const slug = text(v.slug);
      return {
        text: join(
          hello(t, i.firstName, 'hi'),
          t('proactive.assessment.missing', { gender: g, name }),
          flex(null),
          t('proactive.assessment.ask', { gender: g }),
        ),
        actions: slug && isAssessableSlug(slug) ? [checkLevelActionId(slug)] : [],
        silent: false,
        flexHint: 'one short sentence on why a level check makes the workouts fit better',
      };
    }
    case 'post_workout': {
      const minutes = num(v.minutes);
      const what = minutes ? t('proactive.post.sessionMinutes', { minutes: String(minutes) }) : t('proactive.post.session');
      return {
        text: join(t('proactive.post.done', { gender: g, what }), flex(null), t('proactive.post.howWas')),
        actions: ['rate_easy', 'rate_right', 'rate_hard'],
        silent: false,
        flexHint: null,
      };
    }
  }
}

/** The text a rendered template may never contain (persona rules), for tests and the LLM guard. */
export const FORBIDDEN_COPY = /[/\\]|[\u2013\u2014]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/;
