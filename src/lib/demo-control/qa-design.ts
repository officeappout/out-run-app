/**
 * Demo control center — the design view of the AI testers (owner, 21.10.2026): the "ציוני עיצוב"
 * card (worst screens of the last summary's `design` block) and the "עיצוב" filter of the
 * "משוב דמו" tab. Pure, no Firebase import; unit-tested.
 *
 * Rule ids and the score encoding mirror scripts/qa/lib/checklist.ts and
 * scripts/qa/lib/design/dimensions.ts (the panel must not import from scripts/).
 */
import { QA_DESIGN_DIMENSIONS, type QaDesignDimension, type QaDesignScreen, type QaDesignSummary } from './qa-summary';

export const DESIGN_DIMENSION_HE: Record<QaDesignDimension, string> = {
  clarity: 'בהירות',
  consistency: 'עקביות v2',
  density: 'צפיפות',
  rtl: 'RTL',
};

/** A dimension at or below this needed a finding (scripts/qa LOW_SCORE). */
export const DESIGN_LOW_SCORE = 3;
export const DESIGN_CARD_SCREENS = 5;
/** The score records' rule id (not an issue — one per mission × screen × run). */
export const DESIGN_SCORE_RULE = 'DESIGN-SCORE';

/** The `design` block as the panel receives it: the Storage path stays on the server. */
export type ClientDesignScreen = Omit<QaDesignScreen, 'screenshot'> & { hasScreenshot: boolean };
export type ClientDesignSummary = Omit<QaDesignSummary, 'screens'> & { screens: ClientDesignScreen[] };

export function toClientDesign(d: QaDesignSummary | null): ClientDesignSummary | null {
  if (!d) return null;
  return { ...d, screens: d.screens.map(({ screenshot, ...rest }) => ({ ...rest, hasScreenshot: !!screenshot })) };
}

/** Scored screens, lowest overall first (ties: more findings first), at most n. */
export function worstDesignScreens<T extends Pick<QaDesignScreen, 'score' | 'findings' | 'screen'>>(screens: readonly T[], n = DESIGN_CARD_SCREENS): T[] {
  return screens
    .filter((s) => s.score !== null)
    .slice()
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || b.findings - a.findings || a.screen.localeCompare(b.screen))
    .slice(0, n);
}

/** A subset of the admin StatusPill tones. */
export type ScoreTone = 'neutral' | 'good' | 'warn' | 'bad';

export function scoreTone(v: number | null): ScoreTone {
  if (v === null) return 'neutral';
  if (v < 2.5) return 'bad';
  if (v <= DESIGN_LOW_SCORE) return 'warn';
  return 'good';
}

export const fmtScore = (v: number | null): string => (v === null ? '—' : v.toFixed(1));

/** "משוב דמו" type-filter value for every tester design finding (design categories + design rule ids + score records). */
export const DESIGN_FILTER = 'design';

/** Design rule-id families (every checklist area except behaviour: STAB-*, HEALTH-*). */
const DESIGN_RULE_RE = /^(V2|LAY|RTL|MOB|A11Y|STATE|RUN|SUM|PREV|DESIGN)-[A-Z0-9-]+$/;
const DESIGN_CATEGORIES = new Set(['design-rule', 'a11y', 'copy']);

/** Same test as the overseer's isDesignFinding (scripts/qa/lib/overseer/design-aggregate.ts), plus score records. */
export function isDesignQaFinding(f: { category: string; rule: string | null }): boolean {
  if (f.rule === 'STAB-CONSOLE') return false;
  return (f.rule !== null && DESIGN_RULE_RE.test(f.rule)) || DESIGN_CATEGORIES.has(f.category);
}

const ENCODED = /^\[scores clarity=([1-5]) consistency=([1-5]) density=([1-5]) rtl=([1-5])\]/;

/** A score record's four numbers (encoded at the start of `actual`), else null. */
export function decodeDesignScores(rule: string | null, actual: string): Record<QaDesignDimension, number> | null {
  if (rule !== DESIGN_SCORE_RULE) return null;
  const m = ENCODED.exec(actual);
  if (!m) return null;
  return Object.fromEntries(QA_DESIGN_DIMENSIONS.map((d, i) => [d, Number(m[i + 1])])) as Record<QaDesignDimension, number>;
}
