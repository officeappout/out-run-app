import { describe, it, expect } from 'vitest';
import { checkEvidence, numbersInText } from '../evidence-guard';
import type { EvidenceItem } from '../sse';

const ev = (numbers: number[], n: number | null = null): EvidenceItem => ({
  tool: 't',
  definitionId: 'cohort_dN',
  period: { from: '2026-09-01', to: '2026-10-22', tz: 'Asia/Jerusalem' },
  n,
  belowThreshold: false,
  caveats: [],
  numbers,
});

describe('evidence guard — every number must come from a tool this turn', () => {
  it('catches an invented number', () => {
    const r = checkEvidence('ממתינים 7 מסלולים ו-42 מיקומים.', [ev([7, 3])]);
    expect(r).toEqual({ checked: true, ok: false, unmatched: [42] });
  });
  it('passes the plan\'s example: two percentages, their n and the point difference', () => {
    const r = checkEvidence('D7 של ספטמבר: 18% (n=412) מול 24% באוגוסט (n=388), ‎-6 נק\'. בשדרות: 9% (n=61) מול חציון 22%.', [ev([18, 412, 24, 388, 9, 61, 22])]);
    expect(r.ok).toBe(true);
  });
  it('accepts rounding ("23%" for 23.4, "2.1" for 2.14) and a share as % (30 of 120 → 25%)', () => {
    expect(checkEvidence('23% ו-2.1', [ev([23.4, 2.14])]).ok).toBe(true);
    expect(checkEvidence('רבע מהם: 25%', [ev([30, 120])]).ok).toBe(true);
  });
  it('ignores dates, D7/D30, list ordinals, metric ids, window constants and targets', () => {
    expect(numbersInText('22.10.2026 · 2026-10-22 · D7 · D30 · cohort_d7 · 7 ימים · 30 יום\n1. צעד\n2. צעד · יעד: 25% · target ≥ 40')).toEqual([7, 30]);
    expect(checkEvidence('22.10 · D7 · 7 ימים\n1. בדיקה · יעד: 25%', [ev([5])]).checked).toBe(false);
  });
  it('a numeric answer with NO tool behind it is flagged; a text-only answer is not checked', () => {
    expect(checkEvidence('יש בערך 340 משתמשים פעילים.', [])).toEqual({ checked: true, ok: false, unmatched: [340] });
    expect(checkEvidence('העמוד נמצא בסיידבר.', [])).toEqual({ checked: false, ok: true, unmatched: [] });
  });
  it('thousands separators', () => {
    expect(checkEvidence('1,234 שליחות', [ev([1234])]).ok).toBe(true);
  });
});
