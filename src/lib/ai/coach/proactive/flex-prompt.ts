/**
 * Kelly phase 3 — the flex-sentence prompt (sub-flag ai_coach_proactive_llm). Pure, shared by
 * llm.server.ts and the live eval (scripts/ai-coach-evals/phase3-live.ts).
 */
import type { CoachGender } from '../persona';
import type { CoachLocale } from '../coach-locale';

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

export const FLEX_SYSTEM_EN = [
  'You write ONE short English sentence for Kelly, a male fitness coach in the OUT app, inside a short message he sends the user.',
  'Rules: English only, at most 14 words, one sentence ending with a period or an exclamation mark, warm and calm, no question.',
  'No numbers, no names, no weekdays or dates, no emoji, no slashes, no dashes, no medical claims, never guilt about missed workouts.',
  'Speak to the user directly ("you"), never guess their gender. Output the sentence only.',
].join('\n');

/** The flex system prompt for a reply language. Hebrew is exactly FLEX_SYSTEM. */
export function flexSystem(locale: CoachLocale = 'he'): string {
  return locale === 'en' ? FLEX_SYSTEM_EN : FLEX_SYSTEM;
}

export function flexUserContent(gender: CoachGender, hint: string, facts: readonly string[], locale: CoachLocale = 'he'): string {
  if (locale === 'en') return ['English has no grammatical gender here: address the user as "you".', `The sentence should be: ${hint}.`, ...facts.map((f) => `- ${f}`)].join('\n');
  return [GRAMMAR[gender], `The sentence should be: ${hint}.`, ...facts.map((f) => `- ${f}`)].join('\n');
}

export const FLEX_MAX_TOKENS = 80;
