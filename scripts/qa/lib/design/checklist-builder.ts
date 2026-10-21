/**
 * The design checklist the tester model gets (owner, 21.10.2026) — built from the rule table in
 * ../checklist.ts (v2-brief + run-ui-brief), grouped by area, with the scoring rubric and the
 * "every dimension ≤ 3 needs a finding" contract. Deterministic for the same input, so the
 * system prompt stays cacheable. Pure; unit-tested.
 */
import { RULES, type Rule, type RuleArea } from '../checklist';
import { DIMENSION_RUBRIC, LOW_SCORE, SCORE_DIMENSIONS } from './dimensions';

export const AREA_TITLES: Record<RuleArea, string> = {
  surfaces: 'Surfaces and colour tokens',
  cta: 'Buttons — one gradient CTA per screen',
  selection: 'Selected state',
  type: 'Typography and labels',
  touch: 'Touch targets',
  sheets: 'Sheets (bottom drawers)',
  layout: 'Layout, spacing, overlap, density',
  rtl: 'RTL (Hebrew)',
  mobile: 'Phone specifics — safe areas, keyboard, contrast',
  states: 'Empty and loading states',
  icons: 'Icons',
  consistency: 'Design generations (v1 vs v2)',
  run: 'Players, summaries and previews (run-ui-brief)',
  behaviour: 'Behaviour',
};

const AREA_ORDER: readonly RuleArea[] = ['surfaces', 'cta', 'selection', 'type', 'touch', 'sheets', 'layout', 'rtl', 'mobile', 'states', 'icons', 'consistency', 'run', 'behaviour'];

export interface ChecklistOptions {
  /** Rule ids this mission cares most about (marked ★). */
  focus?: readonly string[];
  /** e.g. "iPhone SE, 375×667" — tells the model what "fits on the screen" means. */
  viewportLabel?: string;
  rules?: readonly Rule[];
}

function ruleLine(r: Rule, focus: ReadonlySet<string>): string {
  return `- ${focus.has(r.id) ? '★ ' : ''}${r.id}: ${r.text}${r.lint ? ' (also machine-checked)' : ''}`;
}

/** The grouped rule list (markdown). Areas without rules are left out. */
export function buildRuleSections(opts: ChecklistOptions = {}): string {
  const rules = opts.rules ?? RULES;
  const focus = new Set(opts.focus ?? []);
  const out: string[] = [];
  for (const area of AREA_ORDER) {
    const rs = rules.filter((r) => r.area === area);
    if (!rs.length) continue;
    out.push(`### ${AREA_TITLES[area]}`, ...rs.map((r) => ruleLine(r, focus)));
  }
  return out.join('\n');
}

/** The scoring contract: 4 dimensions, rubric, the ≤3 → finding rule. */
export function buildScoringSection(viewportLabel?: string): string {
  return [
    '## Score every screen (score_screen)',
    `The first time you reach a screen (or a new state of it: a sheet opened, the keyboard up, a different day), call score_screen once with a short snake_case screen id and an integer 1–5 for each dimension${viewportLabel ? `, judged on THIS phone (${viewportLabel})` : ''}:`,
    ...SCORE_DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_RUBRIC[d]}`),
    `For EVERY dimension you score ${LOW_SCORE} or lower, also call report_finding (same turn is fine) with: the screen id, the most specific rule id from the checklist, category "design-rule" (or "a11y"/"copy"), what exactly is wrong and where. The step screenshot is attached automatically.`,
    'Be a strict but fair designer: 5 is rare, 4 means good, 3 means visibly off. Judge what you see, not what you expect.',
    'You can score and act in the same turn (e.g. score_screen + tap), so scoring costs no extra steps.',
  ].join('\n');
}

/** Rules + scoring, ready to paste into the system prompt. */
export function buildDesignChecklist(opts: ChecklistOptions = {}): string {
  return [
    '## Design checklist (cite the rule id in report_finding; ★ = this mission\'s focus)',
    'Look at every screen like a product designer reviewing the OUT "v2" design language, not only like a user.',
    buildRuleSections(opts),
    '',
    buildScoringSection(opts.viewportLabel),
  ].join('\n');
}
