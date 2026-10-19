/** generation_reviews doc → the panel's row shape (no uid). Pure. */
import type { Finding } from '../invariants/types';
import type { GenerationInput, GenerationOutput, GenerationReport, GenerationType } from '../types';

export interface FlaggedRow {
  logId: string;
  day: string;
  type: GenerationType;
  generator: string | null;
  appVersion: string | null;
  platform: string | null;
  findings: Finding[];
  ruleIds: string[];
  maxSeverity: number;
  reports: GenerationReport[];
  input: GenerationInput;
  output: GenerationOutput;
  outcome: Record<string, unknown> | null;
  llm: { verdict?: string; problems?: string[]; suggestion?: string; error?: string } | null;
  status: 'open' | 'fixed' | 'fixture';
  createdAtMs: number;
}

function msOf(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis(): number }).toMillis();
  return typeof v === 'number' ? v : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored review, read through field guards
export function toFlaggedRow(id: string, x: Record<string, any>): FlaggedRow {
  const status = x.status?.value === 'fixed' || x.status?.value === 'fixture' ? x.status.value : 'open';
  return {
    logId: id,
    day: typeof x.day === 'string' ? x.day : '',
    type: x.type,
    generator: typeof x.generator === 'string' ? x.generator : null,
    appVersion: typeof x.appVersion === 'string' ? x.appVersion : null,
    platform: typeof x.platform === 'string' ? x.platform : null,
    findings: Array.isArray(x.findings) ? x.findings : [],
    ruleIds: Array.isArray(x.ruleIds) ? x.ruleIds : [],
    maxSeverity: typeof x.maxSeverity === 'number' ? x.maxSeverity : 0,
    reports: Array.isArray(x.reports) ? x.reports : [],
    input: x.input ?? {},
    output: x.output ?? { totalMinutes: null, exercises: [], legs: [], stations: [], route: null },
    outcome: x.outcome && typeof x.outcome === 'object' ? x.outcome : null,
    llm: x.llm && typeof x.llm === 'object' ? x.llm : null,
    status,
    createdAtMs: msOf(x.createdAt),
  };
}

export interface RowFilter {
  rule?: string;
  type?: string;
  day?: string;
  status?: 'open' | 'fixed' | 'fixture' | 'all';
  reportedOnly?: boolean;
}

export function filterRows(rows: FlaggedRow[], f: RowFilter): FlaggedRow[] {
  return rows.filter((r) =>
    (!f.rule || r.ruleIds.includes(f.rule)) &&
    (!f.type || r.type === f.type) &&
    (!f.day || r.day === f.day) &&
    (!f.status || f.status === 'all' || r.status === f.status) &&
    (!f.reportedOnly || r.reports.length > 0),
  );
}
