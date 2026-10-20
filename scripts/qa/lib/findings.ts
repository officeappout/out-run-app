/**
 * Findings — one shape for linter and model findings (design §3.6), the fingerprint that
 * de-duplicates them, and the in-run book that counts repeats. Pure (node:crypto only).
 *
 * Severity: P0 can't finish the mission / crash / wrong data saved · P1 works but hurts
 * (stuck > 3 steps, unclear text, hidden button) · P2 design-rule break · P3 polish.
 */
import { createHash } from 'node:crypto';

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';
export const SEVERITIES: readonly Severity[] = ['P0', 'P1', 'P2', 'P3'];
export type FindingCategory = 'broken' | 'ux' | 'design-rule' | 'copy' | 'perf' | 'a11y';
export const CATEGORIES: readonly FindingCategory[] = ['broken', 'ux', 'design-rule', 'copy', 'perf', 'a11y'];

export type ReproStep = Record<string, unknown>;

export interface Finding {
  id: string;
  fingerprint: string;
  runId: string;
  mission: string;
  persona: string;
  device: string;
  cohort: string;
  url: string;
  route: string;
  step: number;
  category: FindingCategory;
  severity: Severity;
  rule: string | null;
  title: string;
  expected: string;
  actual: string;
  /** Storage path of the step screenshot (qa/{runId}/…), null if the upload failed. */
  screenshot: string | null;
  repro: ReproStep[];
  confidence: number;
  source: 'lint' | 'llm' | 'runner';
  count: number;
  createdAtMs: number;
}

export function fingerprint(route: string, ruleOrCategory: string, label: string): string {
  const key = `${route}|${ruleOrCategory}|${label.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 20);
}

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
}

export function isCategory(v: unknown): v is FindingCategory {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

/** Keeps one finding per fingerprint per run; repeats only bump `count` (and keep the worst severity). */
export class FindingsBook {
  private readonly byFp = new Map<string, Finding>();

  /** true when this fingerprint is new in this run (caller persists it); false = counted only. */
  add(f: Finding): { isNew: boolean; finding: Finding } {
    const prev = this.byFp.get(f.fingerprint);
    if (!prev) {
      this.byFp.set(f.fingerprint, f);
      return { isNew: true, finding: f };
    }
    prev.count += 1;
    if (SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(prev.severity)) prev.severity = f.severity;
    return { isNew: false, finding: prev };
  }

  all(): Finding[] {
    return Array.from(this.byFp.values());
  }

  get size(): number {
    return this.byFp.size;
  }
}

/** Firestore doc id: run + fingerprint → the same issue in a run is one doc (counts merge). */
export function findingDocId(runId: string, fp: string): string {
  return `${runId.replace(/[^A-Za-z0-9_-]/g, '_')}__${fp}`;
}
