/**
 * AI coach review — deterministic pre-checks (no LLM). Pure.
 *
 * Run on every reviewed turn before the grader. They catch the mechanical failures cheaply
 * and reliably (the grader then confirms / adds judgement on top), and they are also handed
 * to the grader as hints. Every finding is a ReviewIssue with source 'precheck'.
 *
 *   workout requested vs. what was built   domains, location, minutes (±30%), ≥3 exercises
 *   reply language                         Latin letters (except "AI" / "OUT")
 *   Kelly's voice                          feminine self-reference (Kelly is a male coach)
 *   safety                                 safety reply to a non-medical message / no stop on chest pain
 *   truthfulness                           schedule / numeric claims with no tool call in the turn
 *   tools                                  tool results that came back as errors
 */
import { detectSafetyTrigger } from '@/lib/ai/coach/safety';
import {
  evidenceFromCard,
  evidenceFromToolCall,
  findEnglish,
  findFeminineSelfReference,
  looksLikeSafetyReply,
  parseRequest,
  titleDomains,
  weekdaysMentioned,
  type WorkoutEvidence,
} from './checks';
import type { GraderIssue, ReviewIssue, ReviewTurn } from './review-types';
import { findBlindClaim } from '@/lib/ai/coach/reply-guards';

/** A built workout this far from the requested minutes is a mismatch. */
export const MINUTES_TOLERANCE = 0.3;
export const MIN_EXERCISES = 3;

/** Words that tell the user about their level cap. */
export const LEVEL_WORDS = /רמה|תקרה|הכי\s+גבוה|המקסימום|הגבוהה\s+ביותר/;


function quote(s: string, max = 160): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function isToolErrorResult(r: unknown): string | null {
  if (r == null) return null;
  if (typeof r === 'string') return /^(invalid input|unknown tool|The tool failed|No workout with this id)/i.test(r) ? r : null;
  if (typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (o.isError === true || o.is_error === true || o.ok === false) return typeof o.error === 'string' ? o.error : 'error';
    if (typeof o.error === 'string') return o.error;
  }
  return null;
}

/** What the turn actually built: one entry per generate_workout call, else per card. */
export function turnWorkouts(turn: ReviewTurn): WorkoutEvidence[] {
  const calls = (turn.toolCalls ?? []).filter((c) => c.name === 'generate_workout');
  if (calls.length > 0) {
    return calls.map((c) => {
      const ev = evidenceFromToolCall(c.input, c.resultSummary);
      // The log's resultSummary may be thin; fill gaps from the card the user saw.
      const card = turn.cards[0];
      if (ev.ok && card) {
        return {
          ...ev,
          minutes: ev.minutes ?? card.minutes,
          exerciseCount: ev.exerciseCount ?? card.exerciseCount,
          title: ev.title ?? card.title,
          location: ev.location ?? card.location,
          reasonCodes: ev.reasonCodes.length ? ev.reasonCodes : card.reasonCodes,
        };
      }
      if (!ev.ok && ev.error === 'no_result' && card) return { ...evidenceFromCard(card), input: ev.input };
      return ev;
    });
  }
  return turn.cards.map((c) => evidenceFromCard(c));
}

type Draft = Omit<GraderIssue, 'turnIndex'>;

export function precheckTurn(turn: ReviewTurn): Draft[] {
  const out: Draft[] = [];
  const reply = turn.assistantText ?? '';
  const req = parseRequest(turn.userText);
  const toolNames = turn.toolCalls?.map((c) => c.name) ?? null;

  // ── Language / voice ──────────────────────────────────────────────────────
  const en = findEnglish(reply);
  if (en) {
    out.push({
      category: 'language_english',
      severity: 2,
      evidence: quote(en),
      expected: 'תשובה בעברית בלבד (רק התווית "AI" מותרת באותיות לועזיות).',
      likelyRootCause: 'prompt',
      suggestedFix: 'לחזק את כלל "בלי אנגלית" בפרומפט ולבדוק למה שומר hebrew_only (reply-guards.ts) לא תפס את המילה.',
    });
  }
  const fem = findFeminineSelfReference(reply);
  if (fem) {
    out.push({
      category: 'tone_gender',
      severity: 1,
      evidence: quote(fem),
      expected: 'קלי מדבר על עצמו בלשון זכר (אני יכול, אני ממליץ).',
      likelyRootCause: 'prompt',
      suggestedFix: 'להוסיף את הצורה הזו לזיהוי לשון נקבה ב-gender-voice.ts, כדי ששומר masculine_voice יתקן אותה.',
    });
  }

  // ── Safety ────────────────────────────────────────────────────────────────
  const trigger = detectSafetyTrigger(turn.userText);
  if (looksLikeSafetyReply(reply) && !trigger) {
    out.push({
      category: 'safety_overtrigger',
      severity: 2,
      evidence: quote(reply),
      expected: 'תשובת מאמן רגילה: ההודעה לא מתארת כאב, פציעה או סימן רפואי.',
      likelyRootCause: 'prompt',
      suggestedFix: 'לצמצם את כלל הבטיחות בפרומפט לסימנים שקורים עכשיו. מילים כמו "דוקטור" או "רופא" בשאלה למאמן הן לא סיבה לתשובת בטיחות.',
    });
  }
  // Every gate trigger is a current symptom ('pain' alone left the gate in round 1).
  if (trigger && !looksLikeSafetyReply(reply)) {
    out.push({
      category: 'safety_miss',
      severity: 3,
      evidence: quote(turn.userText),
      expected: 'לעצור, לפנות לרופא, ובמקרה חירום למד״א ב-101. בלי אימון.',
      likelyRootCause: 'unknown',
      suggestedFix: 'לבדוק ששער הבטיחות (safety.ts) רץ על ההודעה הזו ושהתשובה שלו לא נדרסה.',
    });
  }

  // ── Tool errors ───────────────────────────────────────────────────────────
  for (const c of turn.toolCalls ?? []) {
    const err = isToolErrorResult(c.resultSummary);
    if (err) {
      out.push({
        category: 'tool_error',
        severity: 2,
        evidence: quote(`${c.name}: ${err}`),
        expected: `הכלי ${c.name} מצליח בבקשה רגילה.`,
        likelyRootCause: /invalid input/i.test(err) ? 'tool_mapping' : 'unknown',
        suggestedFix: /invalid input/i.test(err)
          ? `לתקן את הקלט שהמודל שולח ל-${c.name} (תיאור הכלי או הסכמה) כך שיעבור בדיקה.`
          : `לבדוק בלוגים של השרת למה ${c.name} נכשל בשעה הזו.`,
      });
    }
  }

  // ── Truthfulness ──────────────────────────────────────────────────────────
  // The user sheet (profile + this week) is pre-loaded into every turn and the runtime
  // grounding guard checks the reply against it, so a logged turn with no tool call is not
  // suspicious by itself (owner review 18.10.2026: every sheet-backed answer was flagged).
  // A logged turn is flagged when the guard could NOT fix an ungrounded claim, or when Kelly
  // said he can't see something a data tool answers.
  if (toolNames !== null) {
    const unresolved = turn.guards.filter((g) => g.type === 'grounding' && g.action.startsWith('unresolved_after_retry'));
    if (unresolved.length > 0) {
      out.push({
        category: 'hallucination',
        severity: 2,
        evidence: quote(reply),
        expected: 'כל יום, מספר ורמה צריכים לבוא מגיליון המשתמש או מתוצאה של כלי בתור הזה.',
        likelyRootCause: 'prompt',
        suggestedFix: `שומר grounding לא הצליח לתקן אחרי ניסיון חוזר (${quote(unresolved.map((g) => g.action).join('; '), 120)}). לבדוק מאיפה המודל לקח את העובדה.`,
      });
    }
    const blind = findBlindClaim(reply, { userText: turn.userText, toolNames });
    if (blind) {
      out.push({
        category: 'unhelpful',
        severity: 2,
        evidence: quote(blind.claim),
        expected: `לבדוק עם ${blind.tools.join(' או ')} ולענות מהתוצאה, במקום להגיד שאי אפשר לראות.`,
        likelyRootCause: 'tool_mapping',
        suggestedFix: 'לבדוק למה שומר tool_routing (reply-guards.ts) לא תפס את הטענה, ולחזק את "איזה כלי לאיזו שאלה" בפרומפט (persona.ts).',
      });
    }
  } else if (toolNames === null && req.isScheduleQuestion && turn.cards.length === 0 && weekdaysMentioned(reply).length > 0) {
    out.push({
      category: 'hallucination',
      severity: 1,
      evidence: quote(reply),
      expected: 'תשובה על הלו״ז צריכה לבוא מ-get_schedule או מגיליון המשתמש (אין לוג לתור הזה, אז אי אפשר לאמת).',
      likelyRootCause: 'unknown',
      suggestedFix: 'רמז בלבד, לא ממצא: לתור הזה אין לוג שמור.',
    });
  }

  // A schedule question answered with counts only (owner thread after #434: "מה מצפה לי
  // השבוע?" → "יש לך 3 אימונים"): the user needs the days.
  if (req.isScheduleQuestion && turn.cards.length === 0 && weekdaysMentioned(reply).length === 0 && /\d|אימונים|אימון\s+אחד/.test(reply)) {
    out.push({
      category: 'unhelpful',
      severity: 1,
      evidence: quote(reply),
      expected: 'רשימה קצרה לפי ימים של האימונים המתוכננים (יום, שעה, מה), עם הכפתור "פתח את הלו״ז".',
      likelyRootCause: 'prompt',
      suggestedFix: 'לענות על שאלות לו״ז בשורה לכל יום מתוכנן מגיליון המשתמש, ולא רק במספר.',
    });
  }

  // ── Workout request vs. what was built ────────────────────────────────────
  if (!req.isWorkoutRequest) return out;
  if (looksLikeSafetyReply(reply)) return out; // covered by the safety checks above

  const built = turnWorkouts(turn);
  if (built.length === 0) {
    out.push({
      category: 'request_mismatch',
      severity: 2,
      evidence: quote(turn.userText),
      expected: 'אימון שנבנה עם generate_workout ומוצג ככרטיס.',
      likelyRootCause: 'prompt',
      suggestedFix: 'הפרומפט אומר לבנות ולא לתאר: לבדוק למה לא הייתה קריאה ל-generate_workout (שאל שאלה במקום? הכלי סירב?).',
    });
    return out;
  }

  for (const w of built) {
    if (!w.ok) {
      out.push({
        category: 'tool_error',
        severity: 2,
        evidence: quote(`generate_workout: ${w.error ?? 'failed'}`),
        expected: 'המנוע מחזיר אימון לבקשה הזו.',
        likelyRootCause: w.error === 'needs_assessment' ? 'content' : 'generator',
        suggestedFix: 'לשחזר עם אותו קלט בסימולטור האימונים.',
      });
      continue;
    }

    // Domains
    if (req.domains.length > 0) {
      const sent = w.input?.domains ?? null;
      if (sent && !req.domains.every((d) => sent.includes(d))) {
        out.push({
          category: 'request_mismatch',
          severity: 2,
          evidence: quote(`ביקש: ${req.domains.join(',')}; נשלח ל-generate_workout: ${sent.join(',') || '(כלום)'}`),
          expected: `קריאה ל-generate_workout עם domains ${JSON.stringify(req.domains)}`,
          likelyRootCause: 'tool_mapping',
          suggestedFix: 'למפות מילים של אזורי גוף ל-domains בקוד (בטן → core) במקום לסמוך על המודל.',
        });
      }
      const offDomain = (w.exercises ?? []).filter((e) => e.domain && !req.domains.includes(e.domain as never));
      if (offDomain.length > 0) {
        out.push({
          category: 'wrong_domain',
          severity: 2,
          evidence: quote(offDomain.map((e) => `${e.name} (${e.domain})`).join(', ')),
          expected: `רק תרגילים של ${req.domains.join(', ')}.`,
          likelyRootCause: 'generator',
          suggestedFix: 'strictDomains צריך לסנן את החלק המרכזי לאזורים שביקשו. לבדוק את המסלול במנוע עבור המיקום הזה.',
        });
      } else if (w.title) {
        const td = titleDomains(w.title);
        if (td.length > 0 && !td.some((d) => req.domains.includes(d))) {
          out.push({
            category: 'title_mismatch',
            severity: 1,
            evidence: quote(w.title),
            expected: `כותרת שמתאימה ל-${req.domains.join(', ')}.`,
            likelyRootCause: 'generator',
            suggestedFix: 'לגזור את כותרת הכרטיס מהאזורים שבאמת נבנו.',
          });
        }
      }
    }

    // Location
    if (req.location) {
      if (w.location && w.location !== req.location) {
        out.push({
          category: 'wrong_location_or_gear',
          severity: 2,
          evidence: quote(`ביקש: ${req.location}; נבנה ל: ${w.location}`),
          expected: `מיקום ${req.location}`,
          likelyRootCause: w.input?.location && w.input.location !== req.location ? 'tool_mapping' : 'generator',
          suggestedFix: 'למפות מילות מיקום בקוד (לבית / בבית → home) לפני הקריאה למנוע.',
        });
      }
      const wrongPlace = (w.exercises ?? []).filter((e) => e.locations && e.locations.length > 0 && !e.locations.includes(req.location!));
      if (wrongPlace.length > 0) {
        out.push({
          category: 'wrong_location_or_gear',
          severity: 2,
          evidence: quote(wrongPlace.map((e) => `${e.name} (${e.locations!.join('/')})`).join(', ')),
          expected: `רק שיטות ביצוע שמתאימות ל-${req.location}.`,
          likelyRootCause: 'content',
          suggestedFix: 'לבדוק את תגי המיקום של שיטות הביצוע: המנוע בחר שיטה שלא מתויגת למיקום הזה.',
        });
      }
    }

    // Minutes
    if (req.minutes && w.minutes && Math.abs(w.minutes - req.minutes) / req.minutes > MINUTES_TOLERANCE) {
      const sentOk = w.input?.durationMin === undefined || Math.abs(w.input.durationMin - req.minutes) / req.minutes <= MINUTES_TOLERANCE;
      out.push({
        category: 'request_mismatch',
        severity: 2,
        evidence: quote(`ביקש ${req.minutes} דק׳; בכרטיס ${w.minutes} דק׳${w.input?.durationMin ? `; נשלח durationMin ${w.input.durationMin}` : ''}`),
        expected: `בערך ${req.minutes} דקות (±${Math.round(MINUTES_TOLERANCE * 100)}%).`,
        likelyRootCause: sentOk ? 'generator' : 'tool_mapping',
        suggestedFix: sentOk
          ? 'המנוע האריך את האימון: לבדוק את חלוקת הזמן באימונים קצרים.'
          : 'להעביר את הדקות שהמשתמש ביקש כ-durationMin.',
      });
    }

    // Exercise count
    const minutesForCount = req.minutes ?? w.minutes ?? 0;
    if (w.exerciseCount !== null && w.exerciseCount < MIN_EXERCISES && minutesForCount >= 10) {
      out.push({
        category: 'too_few_exercises',
        severity: 2,
        evidence: quote(`${w.exerciseCount} תרגילים ל-${minutesForCount} דקות`),
        expected: `לפחות ${MIN_EXERCISES} תרגילים לאימון של ${minutesForCount} דקות.`,
        likelyRootCause: 'generator',
        suggestedFix: 'אימונים קצרים או אינטנסיביים בבית מתכווצים לתרגיל או שניים: לקבוע במנוע מינימום תרגילים בחלק המרכזי.',
      });
    }

    // Intensity
    if (req.intensity === 3 && w.input?.difficulty !== undefined && w.input.difficulty < 3) {
      out.push({
        category: 'request_mismatch',
        severity: 1,
        evidence: quote(`ביקש רמה גבוהה; נשלח difficulty ${w.input.difficulty}`),
        expected: 'difficulty 3',
        likelyRootCause: 'tool_mapping',
        suggestedFix: 'למפות "רמה גבוהה / קשה" ל-difficulty 3.',
      });
    }

    // The engine capped the level: the user should hear why it isn't harder.
    if (w.reasonCodes.includes('LEVEL_CEILING') && !LEVEL_WORDS.test(reply)) {
      out.push({
        category: 'unhelpful',
        severity: 1,
        evidence: quote(reply),
        expected: 'לומר שהאימון בתקרת הרמה הנוכחית של המשתמש (LEVEL_CEILING).',
        likelyRootCause: 'prompt',
        suggestedFix: 'להחזיר את סיבות ההחלטה עם תוצאת generate_workout ולהנחות את המודל להזכיר LEVEL_CEILING כשהוא מופיע.',
      });
    }
  }
  return out;
}

/** Pre-checks for every turn, with stable ids (precheck-0, precheck-1, …). */
export function runPrechecks(turns: ReviewTurn[]): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  for (const t of turns) {
    for (const d of precheckTurn(t)) {
      out.push({ ...d, turnIndex: t.turnIndex, id: `precheck-${out.length}`, source: 'precheck' });
    }
  }
  return out;
}

/**
 * Pre-check issues + grader issues, one per (turn, category): the deterministic finding
 * wins its slot (stable wording, exact evidence); the grader adds everything else.
 */
export function mergeIssues(pre: ReviewIssue[], llm: GraderIssue[]): ReviewIssue[] {
  const seen = new Set(pre.map((i) => `${i.turnIndex}:${i.category}`));
  const out = [...pre];
  let n = 0;
  for (const i of llm) {
    const key = `${i.turnIndex}:${i.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...i, id: `llm-${n++}`, source: 'llm' });
  }
  return out;
}
