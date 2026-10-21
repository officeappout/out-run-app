/**
 * Owner rules (owner, 21.10.2026): rules derived from the owner's own design notes. They outrank
 * the generic checklist (../checklist.ts): the tester gets them FIRST and may cite their OWN-* ids.
 *
 * Two sources, one shape:
 *   - scripts/qa/owner-rules.json — the seed file (OWN-001…OWN-099), reviewed in PRs; the human
 *     version is scripts/qa/owner-rules.md (a unit test keeps the two in sync);
 *   - notes the owner adds in /admin/demo → "משוב דמו" (OWN-101…), stored in
 *     demo_registry/owner_rules and read through qaRunnerReport `status` (../store.ts).
 * Pure except loadOwnerRulesFile (fs).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { OWNER_RULE_ID_RE, PANEL_NOTE_FIRST, type OwnerNote } from '@/lib/demo-control/owner-rules-model';
import { isSeverity, type Severity } from '../findings';

export interface OwnerRuleExample {
  /** Repo-relative path of an example screenshot (e.g. scripts/qa/owner-examples/OWN-004-bad.png). */
  screenshot?: string;
  bad?: string;
  good?: string;
}

export interface OwnerRule {
  id: string;
  /** Hebrew, the owner's words. */
  text: string;
  /** Where it applies: checkpoint ids / route patterns, and flow names. Both empty = everywhere. */
  scope: { screens: string[]; flows: string[] };
  severity: Severity;
  example?: OwnerRuleExample;
  origin: 'file' | 'panel';
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const SCREEN_RE = /^(?!.*\.\.)[A-Za-z0-9_/\[\]:.-]{1,120}$/;
const FLOW_RE = /^[a-z][a-z0-9_-]{1,30}$/;
const strList = (v: unknown, re: RegExp): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && re.test(x)) ? (v as string[]) : null;

/** Validates owner-rules.json (strict: a bad file stops the run, like a bad mission file). */
export function validateOwnerRulesFile(raw: unknown): Validation<OwnerRule[]> {
  const e: string[] = [];
  const doc = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(doc.rules)) return { ok: false, errors: ['owner-rules.rules'] };
  const out: OwnerRule[] = [];
  doc.rules.forEach((r: Record<string, unknown>, i: number) => {
    const at = `owner-rules.rules[${i}]`;
    const id = typeof r?.id === 'string' ? r.id : '';
    if (!OWNER_RULE_ID_RE.test(id) || Number(id.slice(4)) >= PANEL_NOTE_FIRST) e.push(`${at}.id (OWN-001…OWN-${PANEL_NOTE_FIRST - 1})`);
    if (typeof r?.text !== 'string' || r.text.trim().length < 10) e.push(`${at}.text`);
    if (!isSeverity(r?.severity)) e.push(`${at}.severity`);
    const scope = (r?.scope ?? {}) as Record<string, unknown>;
    const screens = strList(scope.screens ?? [], SCREEN_RE);
    const flows = strList(scope.flows ?? [], FLOW_RE);
    if (!screens) e.push(`${at}.scope.screens`);
    if (!flows) e.push(`${at}.scope.flows`);
    let example: OwnerRuleExample | undefined;
    if (r?.example !== undefined) {
      const x = (r.example ?? {}) as Record<string, unknown>;
      const okStr = (v: unknown) => v === undefined || (typeof v === 'string' && v.trim().length > 0 && v.length <= 300);
      const okShot = x.screenshot === undefined || (typeof x.screenshot === 'string' && /^scripts\/qa\/[A-Za-z0-9_./-]+\.(png|jpg|jpeg|webp)$/.test(x.screenshot) && !x.screenshot.includes('..'));
      if (!okStr(x.bad) || !okStr(x.good) || !okShot) e.push(`${at}.example`);
      else example = { ...(x.screenshot ? { screenshot: x.screenshot as string } : {}), ...(x.bad ? { bad: x.bad as string } : {}), ...(x.good ? { good: x.good as string } : {}) };
    }
    if (screens && flows && OWNER_RULE_ID_RE.test(id) && typeof r.text === 'string' && isSeverity(r.severity)) {
      out.push({ id, text: r.text.trim(), scope: { screens, flows }, severity: r.severity, ...(example ? { example } : {}), origin: 'file' });
    }
  });
  const ids = out.map((r) => r.id);
  if (new Set(ids).size !== ids.length) e.push('owner-rules: duplicate id');
  return e.length ? { ok: false, errors: e } : { ok: true, value: out };
}

export function loadOwnerRulesFile(dir: string): OwnerRule[] {
  const v = validateOwnerRulesFile(JSON.parse(readFileSync(join(dir, 'owner-rules.json'), 'utf8')) as unknown);
  if (!v.ok) throw new Error(`invalid scripts/qa/owner-rules.json:\n${v.errors.join('\n')}`);
  return v.value;
}

/** A panel note → an owner rule (a note's screen is its only scope; none = everywhere). */
export function noteToRule(n: OwnerNote): OwnerRule {
  return { id: n.id, text: n.text, scope: { screens: n.screen ? [n.screen] : [], flows: [] }, severity: n.severity, origin: 'panel' };
}

/** File rules + panel notes, file first, each group by id (deterministic → cacheable prompt). */
export function mergeOwnerRules(file: readonly OwnerRule[], notes: readonly OwnerNote[]): OwnerRule[] {
  const byId = (a: OwnerRule, b: OwnerRule) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const fileIds = new Set(file.map((r) => r.id));
  const panel = notes.filter((n) => !fileIds.has(n.id)).map(noteToRule);
  return [...[...file].sort(byId), ...panel.sort(byId)];
}

/** Whether a rule is in scope for a mission (its checkpoints / start path / id words). Unscoped = always. */
export function ruleAppliesTo(rule: OwnerRule, mission: { id: string; start: string; checkpoints?: Array<{ id: string; path?: string }> }): boolean {
  const { screens, flows } = rule.scope;
  if (!screens.length && !flows.length) return true;
  const cps = mission.checkpoints ?? [];
  const keys = new Set<string>([mission.start, ...cps.map((c) => c.id), ...cps.flatMap((c) => (c.path ? [c.path] : []))]);
  if (screens.some((s) => keys.has(s) || (s.startsWith('/') && Array.from(keys).some((k) => k.startsWith('/') && k.startsWith(s))))) return true;
  const words = `${mission.id} ${cps.map((c) => c.id).join(' ')}`.toLowerCase();
  const FLOW_WORDS: Record<string, string[]> = {
    onboarding: ['onb', 'onboard'],
    strength: ['strength'],
    run: ['run'],
    walk: ['walk'],
    workout: ['player', 'strength', 'run', 'walk', 'workout'],
  };
  return flows.some((f) => (FLOW_WORDS[f] ?? [f]).some((w) => words.includes(w)));
}

export function ownerRuleIds(rules: readonly OwnerRule[]): Set<string> {
  return new Set(rules.map((r) => r.id));
}
