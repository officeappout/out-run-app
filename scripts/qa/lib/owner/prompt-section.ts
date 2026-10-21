/**
 * The owner sections of the tester's system prompt (pure, deterministic for the same input so
 * the prompt stays cacheable): owner rules FIRST (they outrank the generic checklist), then what
 * the testers learned from the owner's "לא רלוונטי" marks.
 */
import type { Learning } from './learning';
import { MAX_CLARIFICATIONS_IN_PROMPT, MAX_SUPPRESSED_IN_PROMPT } from './learning';
import type { OwnerRule } from './owner-rules';

function scopeText(r: OwnerRule): string {
  const parts = [...r.scope.screens, ...r.scope.flows.map((f) => `flow:${f}`)];
  return parts.length ? ` [applies to: ${parts.join(', ')}]` : ' [every screen]';
}

function exampleText(r: OwnerRule): string {
  const x = r.example;
  if (!x) return '';
  const bits = [x.bad ? `bad: ${x.bad}` : '', x.good ? `good: ${x.good}` : ''].filter(Boolean);
  return bits.length ? `\n  (${bits.join(' · ')})` : '';
}

export function buildOwnerRulesSection(rules: readonly OwnerRule[], inScope: ReadonlySet<string>): string {
  if (!rules.length) return '';
  return [
    '## Owner rules — the owner wrote these himself. They OUTRANK every generic rule below.',
    'Check every screen against them first. When a screen breaks one, report_finding with that OWN-* id as the rule (category "design-rule" or "ux"), at least the severity given here. If an owner rule and a generic rule disagree, the owner rule wins.',
    ...rules.map((r) => `- ${inScope.has(r.id) ? '★ ' : ''}${r.id} (${r.severity})${scopeText(r)}: ${r.text}${exampleText(r)}`),
  ].join('\n');
}

export function buildLearningSection(learning: Learning): string {
  const { suppressed, clarifications } = learning;
  if (!suppressed.length && !clarifications.length) return '';
  const why = (reasons: string[]) => (reasons.length ? ` — owner: "${reasons.join('" / "')}"` : '');
  const out = ['## Learned from the owner\'s triage of earlier findings'];
  if (suppressed.length) {
    out.push(
      'The owner marked these as NOT relevant more than once. Do NOT report this rule on this screen again (such findings are dropped anyway):',
      ...suppressed.slice(0, MAX_SUPPRESSED_IN_PROMPT).map((g) => `- ${g.rule} on ${g.screen} (dismissed ${g.count}×)${why(g.reasons)}`),
    );
  }
  if (clarifications.length) {
    out.push(
      'The owner dismissed these once. Judge the rule on that screen the owner\'s way; report it there only if it is clearly a different, real problem:',
      ...clarifications.slice(0, MAX_CLARIFICATIONS_IN_PROMPT).map((g) => `- ${g.rule} on ${g.screen}${g.title ? ` ("${g.title}")` : ''}${why(g.reasons)}`),
    );
  }
  return out.join('\n');
}
