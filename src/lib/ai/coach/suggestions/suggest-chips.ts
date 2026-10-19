/**
 * Kelly phase 2 — which quick replies to offer (flag ai_coach_phase2). Pure.
 *
 *   suggestChips(situation, { kind: 'opening' })  the first open of the chat (the app)
 *   suggestChips(situation, lastTurn)             2-3 follow-ups under each Kelly answer (the server)
 *
 * Rules, most specific first; at most MAX_SUGGESTIONS, never two with the same id, never
 * the message the user just sent, never a chip that repeats an action chip already under
 * the reply ("בנה את האימון של היום"). After a safety reply, a handoff or a schedule
 * proposal there are no chips: the moment belongs to that answer.
 */
import { C } from './copy';
import { MAX_SUGGESTIONS, RETURN_AFTER_DAYS, type ChipSituation, type LastTurn, type SuggestionChip } from './types';

export interface SuggestOptions {
  /** The message the user just sent (never offered back). */
  lastUserText?: string | null;
  /** Action chip ids already under the reply (action-chips.ts). */
  actions?: readonly string[];
}

const isLate = (h: number) => h >= 22 || h < 5;
const isEvening = (h: number) => h >= 19 && h < 22;

function weatherChip(s: ChipSituation): SuggestionChip | null {
  if (s.weather === 'rain') return C.rain();
  if (s.weather === 'heat') return C.heat();
  if (s.weather === 'cold') return C.cold();
  return null;
}

/** The situation's own best chips (also the fallback after a generic answer). */
function situationChips(s: ChipSituation): SuggestionChip[] {
  const out: Array<SuggestionChip | null> = [];
  if (s.newUser) {
    out.push(C.firstWorkout(), C.howAppWorks(), C.week());
    return out.filter((x): x is SuggestionChip => !!x);
  }
  if (s.daysAway !== null && s.daysAway >= RETURN_AFTER_DAYS) {
    // Calm return: no guilt, no counting misses; one light way back.
    out.push(C.returnLight(), C.returnWhere(), C.week());
    return out.filter((x): x is SuggestionChip => !!x);
  }
  if (s.doneToday) {
    out.push(C.progress(s.gender), C.tomorrow(), C.week());
    return out.filter((x): x is SuggestionChip => !!x);
  }
  if (isLate(s.hour)) {
    out.push(C.tomorrow(), C.progress(s.gender));
    if (s.buildableToday) out.push(C.tiredSkip(s.gender));
    return out.filter((x): x is SuggestionChip => !!x);
  }
  if (s.buildableToday) {
    out.push(C.buildToday());
    if (isEvening(s.hour)) out.push(C.tiredSkip(s.gender));
    out.push(weatherChip(s) ?? C.quick15());
  } else {
    out.push(weatherChip(s) ?? (s.trainingDayToday === false ? C.shortHome() : C.quick15()), C.week());
  }
  if (s.gapName) out.push(C.levelCheck(s.gapName));
  out.push(C.progress(s.gender));
  return out.filter((x): x is SuggestionChip => !!x);
}

function followUps(s: ChipSituation, last: LastTurn): SuggestionChip[] {
  switch (last.kind) {
    case 'opening':
      return situationChips(s);
    case 'workout': {
      const out: SuggestionChip[] = [C.start()];
      if ((last.minutes ?? 20) > 12) out.push(C.shorter());
      // "בלי מתח" only where a bar is in play: outdoors, a pulling area, or a full-body build.
      const barLikely = last.location === 'park' || last.location === 'street' || last.domains.includes('pull') || last.domains.length === 0;
      out.push(barLikely ? C.noBar() : C.easier());
      return out;
    }
    case 'schedule': {
      const out: SuggestionChip[] = [];
      if (s.buildableToday && !s.doneToday) out.push(C.buildToday());
      out.push(C.moveDay(), C.tomorrow());
      return out;
    }
    case 'progress': {
      const out: SuggestionChip[] = [C.week()];
      if (s.gapName) out.push(C.levelCheck(s.gapName));
      out.push(s.buildableToday && !s.doneToday ? C.buildToday() : C.quick15());
      return out;
    }
    case 'app_help':
      return [C.team(), s.buildableToday && !s.doneToday ? C.buildToday() : C.quick15()];
    case 'proposal':
    case 'handoff':
    case 'safety':
      return [];
    case 'other':
    default:
      return situationChips(s).slice(0, 2);
  }
}

const norm = (t: string) => t.replace(/[?.!,\s]+/g, ' ').trim();

export function suggestChips(s: ChipSituation, last: LastTurn, opts: SuggestOptions = {}): SuggestionChip[] {
  const said = opts.lastUserText ? norm(opts.lastUserText) : null;
  const actions = new Set(opts.actions ?? []);
  const seen = new Set<string>();
  const out: SuggestionChip[] = [];
  for (const c of followUps(s, last)) {
    if (seen.has(c.id)) continue;
    if (said && (norm(c.label) === said || norm(c.message ?? '') === said)) continue;
    if (c.id === 'build_today' && actions.has('build_today')) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
