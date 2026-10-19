/**
 * Kelly phase 3 — the flex-sentence prompt (sub-flag ai_coach_proactive_llm). Pure, shared by
 * llm.server.ts and the live eval (scripts/ai-coach-evals/phase3-live.ts).
 */
import type { CoachGender } from '../persona';

export const FLEX_SYSTEM = [
  'You write ONE short Hebrew sentence for Kelly (קלי), a male fitness coach in the OUT app, inside a short message he sends the user.',
  'Rules: Hebrew only, at most 14 words, one sentence ending with a period or an exclamation mark, warm and calm, no question.',
  'No numbers, no names, no weekdays or dates, no emoji, no slash forms (never "את/ה"), no dashes, no medical claims, never guilt about missed workouts.',
  'Kelly speaks about himself in the masculine. Address the user in the grammar given. Output the sentence only.',
].join('\n');

const GRAMMAR: Record<CoachGender, string> = {
  male: 'Address the user in masculine singular.',
  female: 'Address the user in feminine singular.',
  other: 'Gender unknown: impersonal wording only. Never address the user in the singular (no אתה, את, לך, שלך, בך, אותך, no singular command like קח or תעשה).',
};

export function flexUserContent(gender: CoachGender, hint: string, facts: readonly string[]): string {
  return [GRAMMAR[gender], `The sentence should be: ${hint}.`, ...facts.map((f) => `- ${f}`)].join('\n');
}

export const FLEX_MAX_TOKENS = 80;
