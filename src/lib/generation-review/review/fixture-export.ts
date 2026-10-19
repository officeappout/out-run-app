/**
 * "הפוך לבדיקת רגרסיה" — a flagged session → a fixture JSON the admin downloads and commits
 * under src/lib/generation-review/__tests__/regressions/ (no repo writes from prod). Pure.
 * The fixture carries no uid: only the summarized session (already privacy-coarsened) and the
 * findings it must keep producing until fixed (`expect.mustNotFire`).
 */
import type { Finding, RuleId } from '../invariants/types';
import type { GenerationInput, GenerationOutput, GenerationType } from '../types';

export interface RegressionFixture {
  version: 1;
  id: string;
  name: string;
  source: { logId: string; day: string; type: GenerationType; generator: string | null; appVersion: string | null };
  type: GenerationType;
  input: GenerationInput;
  output: GenerationOutput;
  /** The rules that fired on this session. After the generator is fixed, a test re-generating
   *  this input must NOT fire them; the stored output itself documents the bug. */
  expect: { firedOnCapture: RuleId[]; mustNotFire: RuleId[] };
  findings: Finding[];
  reports?: Array<{ reasons: string[]; note?: string | null }>;
}

export function buildRegressionFixture(args: {
  logId: string;
  day: string;
  type: GenerationType;
  generator?: string | null;
  appVersion?: string | null;
  input: GenerationInput;
  output: GenerationOutput;
  findings: Finding[];
  reports?: Array<{ reasons: string[]; note?: string | null }>;
  rules?: RuleId[];
}): RegressionFixture {
  const fired = Array.from(new Set(args.findings.map((f) => f.ruleId)));
  const mustNotFire = args.rules?.length ? args.rules : fired;
  return {
    version: 1,
    id: `${args.type}-${args.logId}`,
    name: `${args.type}: ${mustNotFire.join(', ') || 'reported'} (${args.day})`,
    source: { logId: args.logId, day: args.day, type: args.type, generator: args.generator ?? null, appVersion: args.appVersion ?? null },
    type: args.type,
    input: args.input,
    output: args.output,
    expect: { firedOnCapture: fired, mustNotFire },
    findings: args.findings,
    ...(args.reports?.length ? { reports: args.reports.map((r) => ({ reasons: r.reasons, note: r.note ?? null })) } : {}),
  };
}
