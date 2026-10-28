/**
 * Kelly server locale: the reply guards for English replies. Pure.
 *
 * The Hebrew guards (reply-guards.ts) are phrase lists in Hebrew; for an English turn the turn engine runs
 * this port instead. Ported: ungrounded schedule / progress facts (clock times, "N workouts", weekdays in a
 * schedule sentence, "level N"), the false "passed it to the team" claim, the false "saved" claim after
 * propose_schedule_change. The fact sets (factsFromEvidence) are language independent and shared.
 *
 * NOT ported (not meaningful in English, or Hebrew-only by nature): foreign-word strip (Hebrew-only reply
 * rule), feminine self-reference (Hebrew grammar), blind "can't see it" claims (findBlindClaim / round 4 blind
 * checks read Hebrew phrases AND a Hebrew user message topic list).
 */
import type { GroundingFacts, ReplyIssue, BlindContext } from './reply-guards';
import { PROPOSE_TOOL } from './schedule-proposal/claims';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

const TIME_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const FACT_CONTEXT = /\b(?:this\s+week|this\s+month|planned|scheduled|on\s+your\s+(?:schedule|plan)|you\s+(?:did|have|had|completed|finished|did)|you['’]ve)\b/i;
const SCHEDULE_CONTEXT = /\b(?:planned|scheduled|schedule|on\s+your\s+plan|you\s+have|waiting\s+for\s+you|this\s+week|workouts?)\b/i;

const normTime = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

export function findUngroundedClaimsEn(reply: string, f: GroundingFacts): string[] {
  const out: string[] = [];
  const text = reply ?? '';
  for (const m of Array.from(text.matchAll(TIME_RE))) {
    const t = normTime(m[1], m[2]);
    if (!f.times.has(t)) out.push(`time ${t}`);
  }
  for (const m of Array.from(text.matchAll(/\blevel\s+(\d{1,2})\b/gi))) {
    const n = Number(m[1]);
    if (!f.levels.has(n)) out.push(`level ${n}`);
  }
  if (FACT_CONTEXT.test(text)) {
    for (const m of Array.from(text.matchAll(/\b(\d{1,2}|one|two|three|four|five|six|seven)\s+(?:planned\s+|strength\s+|running\s+)?(?:workouts|sessions)\b/gi))) {
      const raw = m[1].toLowerCase();
      const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
      if (n !== undefined && !f.counts.has(n)) out.push(`${n} workouts`);
    }
  }
  if (SCHEDULE_CONTEXT.test(text)) {
    for (const m of Array.from(text.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi))) {
      const day = WEEKDAYS.indexOf(m[1].toLowerCase());
      if (!f.weekdays.has(day)) out.push(`weekday ${m[1]}`);
    }
  }
  return Array.from(new Set(out));
}

const HANDOFF_CLAIM_EN =
  /\bI(?:['’]ve|\s+have|\s+just|\s+already)?\s+(?:passed|sent|forwarded|handed|told|notified|let|flagged|escalated|messaged|contacted)\b[^.!?\n]{0,40}\b(?:the\s+team|our\s+team|the\s+coaches|a\s+coach|support|a\s+human|a\s+person|them)\b|\b(?:your\s+(?:message|request|question)|it)\s+(?:was|has\s+been|is)\s+(?:passed|sent|forwarded)\s+to\s+(?:the|our)\s+team\b/i;

export function findHandoffClaimEn(reply: string, ctx: Pick<BlindContext, 'toolNames' | 'handoffOpen'>): string | null {
  if (ctx.handoffOpen || ctx.toolNames.includes('handoff_to_human')) return null;
  const m = (reply ?? '').match(HANDOFF_CLAIM_EN);
  return m ? m[0].trim() : null;
}

// Past tense "done" only: "I'll update it once you approve" and "it will be saved after you tap" are fine.
const SAVED_FIRST_PERSON_EN = /\bI(?:['’]ve|\s+have|\s+just|\s+already)?\s+(?:changed|updated|saved|moved|rescheduled|set|booked|adjusted|switched)\b/i;
const SAVED_PASSIVE_EN = /\b(?:has|have)\s+been\s+(?:changed|updated|saved|moved|rescheduled|adjusted|switched)\b|\b(?:is|was)\s+(?:now\s+)?(?:changed|updated|saved|moved|rescheduled)\b|\ball\s+(?:set|saved)\b/i;

export function findSavedClaimEn(text: string): string | null {
  const t = text ?? '';
  const m = t.match(SAVED_FIRST_PERSON_EN) ?? t.match(SAVED_PASSIVE_EN);
  return m ? m[0].trim() : null;
}

/** checkReply for an English reply. */
export function checkReplyEn(reply: string, f: GroundingFacts | null, blind?: BlindContext | null): ReplyIssue[] {
  const issues: ReplyIssue[] = [];
  if (f) {
    const claims = findUngroundedClaimsEn(reply, f);
    if (claims.length) issues.push({ kind: 'ungrounded', claims });
  }
  const handoff = blind ? findHandoffClaimEn(reply, blind) : null;
  if (handoff) issues.push({ kind: 'unconfirmed_handoff', claim: handoff });
  if (blind?.toolNames.includes(PROPOSE_TOOL)) {
    const claim = findSavedClaimEn(reply);
    if (claim) issues.push({ kind: 'unconfirmed_save', claim });
  }
  return issues;
}
