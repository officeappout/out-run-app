/**
 * Per-screen design scores (owner, 21.10.2026: "many screens don't sit right design-wise").
 * The tester scores every screen it reaches 1–5 on four dimensions and must file a finding for
 * any dimension ≤ LOW_SCORE. Scores travel as ordinary findings (rule DESIGN-SCORE) so they reach
 * qa_findings through the existing qaRunnerReport `finding` op — no new op, no schema change.
 * Pure; unit-tested.
 */

export const SCORE_DIMENSIONS = ['clarity', 'consistency', 'density', 'rtl'] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type Scores = Record<ScoreDimension, number>;

/** A dimension at or below this needs a finding (rule id + screenshot). */
export const LOW_SCORE = 3;

/** Not a design rule: the marker of a score record (passes the sanitiser's /^[A-Z0-9-]{2,30}$/). */
export const SCORE_RULE_ID = 'DESIGN-SCORE';

export const DIMENSION_HE: Record<ScoreDimension, string> = {
  clarity: 'בהירות',
  consistency: 'עקביות v2',
  density: 'צפיפות',
  rtl: 'RTL',
};

/** The rubric the model scores with (English, like the rest of the prompt). */
export const DIMENSION_RUBRIC: Record<ScoreDimension, string> = {
  clarity: 'Clarity — is it obvious what this screen is, what matters most and what to tap next? 5 = instantly clear, one obvious next step; 3 = understandable after reading; 1 = confusing or misleading.',
  consistency: 'Visual consistency with v2 — tokens, cards, one gradient CTA, tint selection, sheet pattern, icons, no v1 leftovers. 5 = fully v2; 3 = a few off-pattern pieces; 1 = mostly old or ad-hoc styling.',
  density: 'Density — the right amount on a phone screen, consistent spacing, nothing cramped or cut. 5 = calm and balanced; 3 = somewhat crowded or sparse; 1 = cramped, overlapping or mostly empty.',
  rtl: 'RTL correctness — alignment, arrows, order of icons/numbers, progress direction. 5 = fully correct RTL; 3 = a couple of LTR leftovers; 1 = laid out LTR.',
};

const SCREEN_RE = /^[a-z0-9_]{2,40}$/;

/** A model-supplied screen name → a stable snake id ("Home – strength" → "home_strength"). */
export function normalizeScreenId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return SCREEN_RE.test(s) ? s : null;
}

const clampScore = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : null);

/** All four dimensions as integers 1–5, or null if any is missing. */
export function parseScores(raw: unknown): Scores | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Partial<Scores> = {};
  for (const d of SCORE_DIMENSIONS) {
    const v = clampScore(o[d]);
    if (v === null) return null;
    out[d] = v;
  }
  return out as Scores;
}

export function overallScore(s: Scores): number {
  return Math.round((SCORE_DIMENSIONS.reduce((n, d) => n + s[d], 0) / SCORE_DIMENSIONS.length) * 10) / 10;
}

export function lowDimensions(s: Scores): ScoreDimension[] {
  return SCORE_DIMENSIONS.filter((d) => s[d] <= LOW_SCORE);
}

const ENCODED = /^\[scores clarity=([1-5]) consistency=([1-5]) density=([1-5]) rtl=([1-5])\]\s?/;

/** Stored in the finding's `actual` (≤ 600 chars after the sanitiser). */
export function encodeScores(s: Scores, notes: string): string {
  return `[scores clarity=${s.clarity} consistency=${s.consistency} density=${s.density} rtl=${s.rtl}] ${notes.trim()}`.slice(0, 600).trimEnd();
}

export function decodeScores(actual: string): { scores: Scores; notes: string } | null {
  const m = ENCODED.exec(actual);
  if (!m) return null;
  return { scores: { clarity: +m[1], consistency: +m[2], density: +m[3], rtl: +m[4] }, notes: actual.slice(m[0].length).trim() };
}
