/**
 * Trigger c — a program the user trains but never checked a level for. Pure.
 *
 * Gaps are the sheet's assessmentGaps (the progress tab's "עוד לא בדקת רמה"): the engine
 * leaves such a program out until it has a level. Due at 12:00 Sunday to Thursday. At most
 * once per gap per 14 days, and at most one level-check nudge a week overall (so four gaps
 * never mean a nudge every other day). The chip starts the existing mini level check
 * (check_level_<slug>).
 *
 * A running questionnaire gap ("חסר לך שאלון ריצה") needs a defined "missing" signal first
 * (the running profile has none today); the trigger takes any GapRef, so it plugs in here.
 */
import { skip, type ProactiveUserState, type TriggerDecision, type TriggerOptions } from '../types';

export const ASSESSMENT_HOUR = 12;
export const PER_GAP_COOLDOWN_MS = 14 * 86_400_000;
export const ANY_GAP_COOLDOWN_MS = 7 * 86_400_000;

export function assessmentTrigger(s: ProactiveUserState, o: TriggerOptions = {}): TriggerDecision {
  if (!o.ignoreSlotTime && (s.clock.hour !== ASSESSMENT_HOUR || s.clock.dow > 4)) return skip('assessment', 'not_midday_weekday');
  if (s.gaps.length === 0) return skip('assessment', 'no_gaps');
  const now = s.clock.ms;
  if (s.ledger.lastAssessmentAt !== null && now - s.ledger.lastAssessmentAt < ANY_GAP_COOLDOWN_MS) return skip('assessment', 'nudged_this_week');
  const gap = s.gaps.find((g) => {
    const last = s.ledger.assessmentNudges[g.slug];
    return typeof last !== 'number' || now - last >= PER_GAP_COOLDOWN_MS;
  });
  if (!gap) return skip('assessment', 'all_gaps_cooling_down');
  return { trigger: 'assessment', shouldSend: true, templateKey: 'assessment', vars: { slug: gap.slug, name: gap.name }, why: `no level for ${gap.slug}` };
}
