/**
 * Workout insights — is a model-written line safe to show as is? Pure.
 * Anything doubtful → null, and the screen simply shows no line (there is no template layer —
 * owner decision 22.10.2026).
 */
import { findFeminineSelfReferences } from '@/lib/ai/coach/gender-voice';
import type { CoachGender } from '@/lib/ai/coach/persona';
import { FORBIDDEN_COPY } from '@/lib/ai/coach/proactive/templates';
import type { WorkoutInsightLines } from './schema';

export const INSIGHT_LINE_MAX_CHARS = 170;

const FEM_ADDRESS = /(?:^|[\s,])(?:תתחילי|תמשיכי|תנסי|יכולה|מוכנה)(?=$|[\s,.!])/;
const MASC_ADDRESS = /(?:^|[\s,])(?:אתה|תתחיל|תמשיך|תנסה)(?=$|[\s,.!])/;
const SINGULAR_ADDRESS = /(?:^|[\s,])(?:אתה|לך|שלך|בך|אותך|קח|קחי|תעשה|תעשי)(?=$|[\s,.!])/;

/** Every number in `line` must appear in `facts` (as written, commas ignored). */
function numbersAreFromFacts(line: string, facts: string): boolean {
  const norm = facts.replace(/,/g, '');
  const nums = line.match(/\d[\d,.]*/g) ?? [];
  return nums.every((n) => norm.includes(n.replace(/,/g, '').replace(/\.$/, '')));
}

export function validateInsightLine(raw: unknown, gender: CoachGender, facts: string): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/^["״'“]+|["״'”]+$/g, '').trim();
  if (!s || s.length > INSIGHT_LINE_MAX_CHARS) return null;
  if (!/[א-ת]/.test(s)) return null;
  if (/[A-Za-z]/.test(s)) return null;
  if (FORBIDDEN_COPY.test(s)) return null;
  if (/[?؟<>{}]/.test(s)) return null;
  if (!numbersAreFromFacts(s, facts)) return null;
  if (findFeminineSelfReferences(s, gender).length) return null;
  if (gender === 'male' && FEM_ADDRESS.test(s)) return null;
  if (gender === 'female' && MASC_ADDRESS.test(s)) return null;
  if (gender === 'other' && (MASC_ADDRESS.test(s) || FEM_ADDRESS.test(s) || SINGULAR_ADDRESS.test(s))) return null;
  if (!/[.!]$/.test(s)) s = `${s}.`;
  return s;
}

/** The model's JSON reply → validated lines. Tolerates a ```json fence; anything else → empty. */
export function parseInsightReply(text: string, gender: CoachGender, facts: string): WorkoutInsightLines {
  const body = (text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { insight: null, funny: null };
  }
  if (!data || typeof data !== 'object') return { insight: null, funny: null };
  const o = data as Record<string, unknown>;
  return {
    insight: validateInsightLine(o.insight, gender, facts),
    funny: validateInsightLine(o.funny, gender, facts),
  };
}
