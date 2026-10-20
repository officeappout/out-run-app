/**
 * Turns a step view into what the model reads (pure text part; the screenshot is attached as an
 * image block by the session loop). Compact on purpose: the element list is the bulk of the
 * per-step input tokens.
 */
import type { ElementInfo } from './lint/collect';
import type { LintIssue } from './lint/rules';

export function elementLine(e: ElementInfo): string {
  const label = e.label ? `"${e.label}"` : '(no label)';
  return `${e.ref} ${e.role} ${label} @${e.x},${e.y} ${e.w}x${e.h}${e.disabled ? ' disabled' : ''}`;
}

export function observationText(v: { url: string; elements: ElementInfo[]; lint: LintIssue[]; blocked: string | null; events: string[]; note?: string }): string {
  let path = v.url;
  try {
    const u = new URL(v.url);
    path = `${u.pathname}${u.search}`;
  } catch {
    /* keep */
  }
  const lines: string[] = [];
  if (v.note) lines.push(v.note);
  if (v.blocked) lines.push(`RUNNER: that page was blocked (${v.blocked}) — you are back at the mission start. Continue another way.`);
  if (v.events.length) lines.push(`WORLD EVENT: ${v.events.join(', ')}`);
  lines.push(`URL: ${path}`);
  lines.push(`ELEMENTS (${v.elements.length}):`);
  lines.push(...(v.elements.length ? v.elements.map(elementLine) : ['(none visible)']));
  if (v.lint.length) {
    lines.push('LINTER (already recorded, do not re-report):');
    lines.push(...v.lint.map((i) => `- ${i.rule} ${i.severity}: ${i.title}${i.examples.length ? ` — ${i.examples.slice(0, 3).join(' | ')}` : ''}`));
  }
  return lines.join('\n');
}
