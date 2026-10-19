/**
 * Trigger d — weather on an outdoor training day. Pure.
 *
 * Same slot as the morning line (it replaces it: higher priority, one message a day).
 * Only with weather data for the user's ~5 km cell (the server reads the cache the app
 * already keeps, never a provider call from the cron) and only when the weather feature is
 * on for this user. Rain on any training day → suggest moving it home (build_home chip).
 * Heat or strong UV on a run or walk day → early or in the shade, and drink. A strength day
 * in the heat says nothing (it may well be indoors).
 */
import { skip, type ProactiveUserState, type TriggerDecision, type TriggerOptions } from '../types';
import { morningHourFor, startPassed } from './morning';

const OUTDOOR_KINDS = new Set(['cardio', 'walking']);

export function weatherTrigger(s: ProactiveUserState, o: TriggerOptions = {}): TriggerDecision {
  const t = s.today;
  if (!s.weather) return skip('weather', 'no_weather_signal');
  if (!t.training) return skip('weather', 'no_training_today');
  if (t.done) return skip('weather', 'done_today');
  if (!o.ignoreSlotTime && s.clock.hour !== morningHourFor(s.preferredHour)) return skip('weather', 'not_morning_hour');
  if (!o.ignoreSlotTime && startPassed(t.startTime, s.clock.hour, s.clock.minute)) return skip('weather', 'session_started');
  const label = t.label ?? 'אימון';
  if (s.weather === 'rain') {
    return { trigger: 'weather', shouldSend: true, templateKey: 'weather_rain', vars: { label }, why: 'rain on a training day' };
  }
  if ((s.weather === 'heat' || s.weather === 'uv') && t.kind && OUTDOOR_KINDS.has(t.kind)) {
    return { trigger: 'weather', shouldSend: true, templateKey: 'weather_heat', vars: { label }, why: `${s.weather} on a ${t.kind} day` };
  }
  return skip('weather', `no_action_for_${s.weather}`);
}
