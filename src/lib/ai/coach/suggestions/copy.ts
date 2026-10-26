/**
 * Kelly phase 2 — the copy of the quick replies (catalog `coach`, keys `quick.*`). Pure.
 *
 * The user talks TO Kelly (a man), so requests are fixed ("תבנה לי"); only the user's own
 * self-references follow the user's gender ("אני עייף" / "אני עייפה"; unknown → a neutral
 * phrasing). No slashes, no emoji.
 */
import type { CoachGender } from '../persona';
import type { SuggestionChip } from './types';
import { makeT } from '@/lib/i18n/t';
import { coach } from '@/messages/ns/coach';

// Hebrew-only copy (bundled catalog, sync read; the chat route and the app both build chips).
const t = makeT('he', coach);

const say = (id: string, label: string, message?: string): SuggestionChip => (message ? { id, label, message } : { id, label });

export const C = {
  buildToday: () => say('build_today', t('quick.buildToday.label')),
  shortHome: () => say('short_home', t('quick.shortHome.label')),
  quick15: () => say('quick_15', t('quick.quick15.label')),
  firstWorkout: () => say('first_workout', t('quick.firstWorkout.label')),
  howAppWorks: () => say('how_app_works', t('quick.howAppWorks.label')),
  week: () => say('week', t('quick.week.label')),
  tomorrow: () => say('tomorrow', t('quick.tomorrow.label')),
  returnLight: () => say('return_light', t('quick.returnLight.label')),
  returnWhere: () => say('return_where', t('quick.returnWhere.label')),
  moveDay: () => say('move_day', t('quick.moveDay.label')),
  team: () => say('team', t('quick.team.label'), t('quick.team.message')),
  progress: (g: CoachGender) => say('progress', t('quick.progress.label', { gender: g })),
  tiredSkip: (g: CoachGender) => say('tired_skip', t('quick.tiredSkip.label', { gender: g })),
  levelCheck: (name: string) => say('level_check', t('quick.levelCheck.label', { name })),
  rain: () => say('weather_rain', t('quick.rain.label')),
  heat: () => say('weather_heat', t('quick.heat.label')),
  cold: () => say('weather_cold', t('quick.cold.label')),
  // After a built workout (the card is right above).
  start: (): SuggestionChip => ({ id: 'start', label: t('quick.start.label'), openCard: true }),
  shorter: () => say('shorter', t('quick.shorter.label'), t('quick.shorter.message')),
  noBar: () => say('no_bar', t('quick.noBar.label'), t('quick.noBar.message')),
  easier: () => say('easier', t('quick.easier.label'), t('quick.easier.message')),
};

/** "נסה:" in the user's grammar (the placeholder addresses the user). */
export function tryPrefix(g: CoachGender): string {
  return t('quick.tryPrefix', { gender: g });
}
