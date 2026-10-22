/**
 * evidence-guard — the "number not from a tool" check (plan §5.3; precedent: Kelly's
 * src/lib/ai/coach/reply-guards.ts). Pure. Every number / percentage in the answer must match a
 * number the turn's data tools returned. If one doesn't, the answer is marked "לא אומת" in the
 * drawer (NOT blocked) and the audit row records guardFailed.
 *
 * Matches: exact or rounded (to an integer or 1 decimal) against the tool numbers + their
 * meta n / minSample, plus derived values a fair comparison needs: a−b, |a−b| (percentage-point
 * differences) and a/b×100 (a share as %).
 * Not checked: dates (22.10, 2026-10-22), numbers glued to Latin letters (D7, D30, 7d, n=… is
 * still checked), list ordinals ("1. …"), metric ids, a few window constants (0, 1, 7, 14, 28,
 * 30, 100), and numbers the answer marks as a goal with "יעד" / "target" right before them —
 * a recommendation's target is a proposal, not a claim about the data.
 */
import type { EvidenceItem } from './sse';

export interface EvidenceCheck {
  /** false when the answer claims no numbers at all (nothing to check) */
  checked: boolean;
  ok: boolean;
  unmatched: number[];
}

const ALWAYS_OK = [0, 1, 7, 14, 28, 30, 100];
const DATE_LIKE = /\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b|\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b|\b(?:19|20)\d{2}\b/g;
const ORDINAL_LINE = /^\s*\d+[.)]\s/gm;
const METRIC_ID = /\b[a-z]+(?:_[a-z0-9]+)+\b/gi;
const TARGET = /(?:יעד|target)\s*[:：]?\s*[≥≤<>=~]*\s*-?\d[\d,]*(?:\.\d+)?%?/gi;
const NUMBER = /(?<![A-Za-z\d.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![A-Za-z\d])|(?<![A-Za-z\d.])-?\d+(?:\.\d+)?(?![A-Za-z\d])/g;

/** Numbers as claimed in the answer (1,234 → 1234; 12.5% → 12.5), exclusions removed. */
export function numbersInText(text: string): number[] {
  const cleaned = text
    .replace(/([א-ת])-(?=\d)/g, '$1 ') // "ו-42" / "ב-7" — a Hebrew prefix hyphen, not a minus
    .replace(TARGET, ' ').replace(DATE_LIKE, ' ').replace(ORDINAL_LINE, ' ').replace(METRIC_ID, ' ');
  const out: number[] = [];
  Array.from(cleaned.matchAll(NUMBER), (m) => Number(m[0].replace(/,/g, ''))).forEach((n) => {
    if (Number.isFinite(n)) out.push(n);
  });
  return out;
}

function close(claimed: number, real: number): boolean {
  const a = Math.abs(claimed);
  const b = Math.abs(real);
  if (a === b) return true;
  if (Math.round(b) === a) return true; // "23%" for 23.4
  if (Math.round(b * 10) / 10 === a) return true; // "23.4" for 23.44
  return Math.abs(a - b) <= Math.max(0.051, b * 0.005);
}

/**
 * A numeric answer with NO data tool behind it fails too (every number must come from a tool
 * this turn); an answer without numbers is not checked.
 */
export function checkEvidence(answer: string, evidence: EvidenceItem[]): EvidenceCheck {
  const claimed = numbersInText(answer).filter((n) => !ALWAYS_OK.some((k) => close(n, k)));
  if (!claimed.length) return { checked: false, ok: true, unmatched: [] };
  const pool = evidence.flatMap((e) => [...e.numbers, ...(e.n !== null ? [e.n] : [])]);
  const base = Array.from(new Set(pool)).slice(0, 150);
  const derived: number[] = [];
  for (const a of base) {
    for (const b of base) {
      if (a === b) continue;
      derived.push(a - b);
      if (b !== 0) derived.push((a / b) * 100);
    }
  }
  const all = [...base, ...derived];
  const unmatched = claimed.filter((n) => !all.some((p) => close(n, p)));
  return { checked: true, ok: unmatched.length === 0, unmatched };
}
