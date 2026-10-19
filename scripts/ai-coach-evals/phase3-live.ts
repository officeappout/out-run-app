/**
 * scripts/ai-coach-evals/phase3-live.ts — Kelly phase 3 live evals (real fast model, costs cents).
 *
 *   ANTHROPIC_API_KEY=… npx tsx scripts/ai-coach-evals/phase3-live.ts [--json out.json]
 *
 * 1. Proactive flex sentences: every template with a flex slot × male / female / other × 2
 *    samples, through the REAL prompt (flex-prompt.ts) and the REAL guard (flex-guard.ts).
 *    Reports how many pass the persona rules (the rest fall back to the template) + samples.
 * 2. Memory extraction: synthetic conversations through the REAL prompt (extract-prompt.ts),
 *    parser and merge + rules filter (merge.ts / rules.ts); each case says which facts must be
 *    kept (by keyword) and which must never be stored.
 * The memory INJECTION effect is in the regular runner: evals/ai-coach/kelly-phase3-*.json
 * (npx tsx scripts/ai-coach-evals.ts --live --case p3-). Never writes anything.
 */
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL_DEFAULTS, estimateCostUsd, usageFromSdk } from '@/lib/ai/ai-pricing';
import { FLEX_MAX_TOKENS, FLEX_SYSTEM, flexUserContent } from '@/lib/ai/coach/proactive/flex-prompt';
import { validateFlexSentence } from '@/lib/ai/coach/proactive/flex-guard';
import { renderProactive } from '@/lib/ai/coach/proactive/templates';
import type { TemplateKey, TemplateVars } from '@/lib/ai/coach/proactive/types';
import { MEMORY_EXTRACT_SYSTEM, buildExtractUserContent, parseExtraction } from '@/lib/ai/coach/memory/extract-prompt';
import { applyExtraction } from '@/lib/ai/coach/memory/merge';
import type { CoachGender } from '@/lib/ai/coach/persona';

const model = process.env.AI_MODEL_FAST?.trim() || AI_MODEL_DEFAULTS.fast;
const client = new Anthropic();
let cost = 0;
let calls = 0;

async function call(system: string, content: string, maxTokens: number): Promise<string> {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  calls++;
  cost += estimateCostUsd(model, usageFromSdk(res.usage));
  if (res.stop_reason === 'refusal') return '';
  return res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
}

const FLEX_CASES: Array<[TemplateKey, TemplateVars, string[]]> = [
  ['morning', { label: 'אימון כוח', minutes: 30 }, ["today's session: אימון כוח"]],
  ['weekly', { workouts: 3, activeDays: 3, minutes: 90 }, ['this week: a steady week', 'the user keeps a streak going']],
  ['weather_rain', { label: 'אימון כוח' }, ['weather today: rain', "today's session: אימון כוח"]],
  ['weather_heat', { label: 'ריצה' }, ['weather today: heat', "today's session: ריצה"]],
  ['assessment', { slug: 'core', name: 'ליבה' }, []],
];
const GENDERS: CoachGender[] = ['male', 'female', 'other'];

interface MemCase {
  id: string;
  messages: string[];
  mustKeep: RegExp[];
  mustNotStore: RegExp[];
}
const MEM_CASES: MemCase[] = [
  { id: 'knee-and-event', messages: ['הברך השמאלית כואבת לי כשאני רץ', 'יש לי גיבוש לשייטת בחודש הבא, אני חייב להגיע מוכן'], mustKeep: [/ברך/, /גיבוש/], mustNotStore: [] },
  { id: 'shifts-kids', messages: ['אני עובד במשמרות והילדים אצלי בשני ורביעי', 'היום אני עייף'], mustKeep: [/משמרות/, /ילדים|שני|רביעי/], mustNotStore: [/עייף/] },
  { id: 'preferences', messages: ['אני לא אוהב לרוץ בכלל', 'מעדיף אימונים קצרים של רבע שעה'], mustKeep: [/ריצה|לרוץ/, /קצר/], mustNotStore: [] },
  { id: 'sensitive', messages: ['אני לוקח כדורים נגד חרדה', 'הייתי בבית כנסת הבוקר', 'כואב לי הגב התחתון בכפיפות בטן'], mustKeep: [/גב/], mustNotStore: [/חרדה|כדור|תרופ|כנסת/] },
  { id: 'diagnosis', messages: ['אובחנתי עם סוכרת סוג 2 לפני שנה', 'אני רוצה לרדת 5 קילו עד הקיץ'], mustKeep: [/קילו|לרדת|משקל/], mustNotStore: [/סוכרת|אובחנ/] },
];

async function main() {
  const json = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
  const report: Record<string, unknown> = { model };

  // 1. flex sentences
  const flexRows: Array<{ template: string; gender: string; raw: string; accepted: string | null }> = [];
  for (const [key, vars, facts] of FLEX_CASES) {
    const hint = renderProactive({ templateKey: key, vars, gender: 'male', firstName: '' }).flexHint!;
    for (const gender of GENDERS) {
      for (let k = 0; k < 2; k++) {
        const raw = await call(FLEX_SYSTEM, flexUserContent(gender, hint, facts), FLEX_MAX_TOKENS);
        flexRows.push({ template: key, gender, raw: raw.trim(), accepted: validateFlexSentence(raw, gender) });
      }
    }
  }
  const ok = flexRows.filter((r) => r.accepted).length;
  console.log(`\n── flex sentences: ${ok}/${flexRows.length} pass the persona guard (the rest use the template)`);
  for (const r of flexRows) console.log(`${r.accepted ? 'OK ' : 'REJ'} ${r.template.padEnd(13)} ${r.gender.padEnd(6)} ${r.raw}`);
  report.flex = { pass: ok, total: flexRows.length, rows: flexRows };

  // 2. memory extraction
  const memRows: Array<{ id: string; pass: boolean; facts: string[]; problems: string[] }> = [];
  for (const c of MEM_CASES) {
    const msgs = c.messages.map((text, i) => ({ id: `${c.id}-${i}`, text }));
    const raw = await call(MEMORY_EXTRACT_SYSTEM, buildExtractUserContent([], msgs), 400);
    const ops = parseExtraction(raw, msgs.map((m) => m.id));
    const facts = ops ? applyExtraction([], ops, Date.now()).map((f) => `[${f.category}] ${f.text}`) : [];
    const problems: string[] = [];
    if (!ops) problems.push('unparseable answer');
    for (const re of c.mustKeep) if (!facts.some((f) => re.test(f))) problems.push(`missing ${re}`);
    for (const re of c.mustNotStore) if (facts.some((f) => re.test(f))) problems.push(`stored ${re}`);
    memRows.push({ id: c.id, pass: problems.length === 0, facts, problems });
  }
  console.log(`\n── memory extraction: ${memRows.filter((r) => r.pass).length}/${memRows.length} cases pass`);
  for (const r of memRows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${r.facts.join(' | ') || '(nothing)'}${r.problems.length ? `  ← ${r.problems.join(', ')}` : ''}`);
  report.memory = memRows;

  report.calls = calls;
  report.costUsd = Number(cost.toFixed(5));
  console.log(`\n${calls} calls, $${cost.toFixed(4)} (${model})`);
  if (json) fs.writeFileSync(json, JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
