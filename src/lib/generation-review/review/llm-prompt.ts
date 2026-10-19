/**
 * Optional LLM pass (enable_generation_review_llm): "does this session make sense for this
 * user?" — prompt, JSON schema and parser. Pure (no SDK import).
 */
import { z } from 'zod';
import type { Finding } from '../invariants/types';
import type { GenerationInput, GenerationOutput, GenerationType } from '../types';

export const GEN_LLM_MAX_TOKENS = 1200;
/** Sessions per day the LLM looks at (flagged / reported first). */
export const GEN_LLM_DAILY_SESSIONS = 20;
/** Default daily cap (USD) when app_config/ai.generationReviewBudgetUsd is not set. */
export const GEN_LLM_DEFAULT_DAILY_USD = 0.5;

export const GEN_LLM_SYSTEM_PROMPT = `You review ONE workout or route that the OUT fitness app generated and showed to a user.
OUT: calisthenics parks, home strength workouts, walks / runs / rides, hybrid sessions (aerobic legs + strength stops in parks), generated loop routes.
You get the user's minimal profile (levels per movement group on the program scale, personas, flags), the request (activity, minutes, km, focus, location, equipment) and a summary of what was shown (exercises with movement pattern / sets / level, legs with activity / distance / minutes, strength stations with distance to the route, route metrics).
Deterministic rule findings are listed; they are reliable — do not repeat them.
Judge: would a good coach show this to this user for this request? Look for what the rules miss: wrong order, poor warm-up, too many sets for the time, a session that ignores the request, an odd mix, a route that does not fit the activity.
Answer in simple, clear Hebrew (short sentences, no English sentences; exercise ids may stay as-is).
verdict: "ok" (makes sense), "questionable" (works but a coach would change something), "bad" (a user would notice it is wrong).
problems: at most 3 short Hebrew lines, empty when ok. suggestion: one short Hebrew line for the developer (which generator / rule to change), or empty.`;

export const GEN_LLM_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'problems', 'suggestion'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'questionable', 'bad'] },
    problems: { type: 'array', items: { type: 'string' } },
    suggestion: { type: 'string' },
  },
};

export const GenLlmOutputZ = z.object({
  verdict: z.enum(['ok', 'questionable', 'bad']),
  problems: z.array(z.string().max(300)).max(3),
  suggestion: z.string().max(400),
});
export type GenLlmOutput = z.infer<typeof GenLlmOutputZ>;

export function buildGenLlmUserContent(s: { type: GenerationType; input: GenerationInput; output: GenerationOutput; findings: Finding[] }): string {
  // The polyline means nothing to the model; the metrics carry the route.
  const output = { ...s.output, route: s.output.route ? { ...s.output.route, polyline: undefined } : null };
  const rules = s.findings.length ? s.findings.map((f) => `- ${f.ruleId} (severity ${f.severity}): ${f.messageHe}`).join('\n') : '- none';
  return `Generator: ${s.type}\nUser + request:\n${JSON.stringify(s.input)}\nShown session:\n${JSON.stringify(output)}\nRule findings:\n${rules}\n\nReturn the review as JSON.`;
}

export function parseGenLlmOutput(text: string): GenLlmOutput | null {
  try {
    const r = GenLlmOutputZ.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Which sessions get the LLM pass: reported, then flagged (most severe first), then the rest. */
export function pickLlmSample<T extends { reported: boolean; findings: Finding[] }>(items: T[], n: number): T[] {
  const score = (x: T) => (x.reported ? 100 : 0) + (x.findings[0]?.severity ?? 0) * 10 + Math.min(x.findings.length, 9);
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, Math.max(0, n));
}
