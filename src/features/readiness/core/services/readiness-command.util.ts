/**
 * Pure logic for the Command screen ("כל החטיבות" / battalion / company
 * drill-down), 06.10.2026. Deliberately dependency-free (no Firestore,
 * no React) so it is directly unit-testable — same "pure module" pattern
 * as readiness-training-status.service.ts. The UI (CommandEntityGrid and
 * friends) calls these functions; it never re-derives this logic inline.
 *
 * === Sample floor (David, verbatim) ===
 * "חטיבה שנבדקו בה פחות מ-10 חיילים מסומנת 'מדגם קטן' ולא משתתפת בדירוג
 * הקצה — לא בראש ולא בתחתית. האחוז שלה מוצג עם הסימון." Read as: the
 * floor gates ONLY the 3 insight cards (pickMostFit/pickBiggestGap/
 * pickMostNearThreshold — "דירוג הקצה", the ranking of extremes) — the
 * main sorted grid still lists every entity with data in its natural
 * position, small-sample ones included, just tagged. David asked for
 * this number to be flagged if 10 doesn't fit the real data rather than
 * silently changed — see the build report, not this file.
 */

export const SAMPLE_FLOOR_DEFAULT = 10;

export function isSmallSample(testedCount: number, floor: number = SAMPLE_FLOOR_DEFAULT): boolean {
  return testedCount < floor;
}

export type CommandSortKey = 'size' | 'passPercent' | 'gap' | 'appActive';
export type CommandSortDirection = 'asc' | 'desc';

/** Switching sort key resets to ITS OWN sensible default direction — size/gap/appActive default to "biggest first" (desc), passPercent defaults to "lowest first" (asc), per David's explicit instruction ("מי שצריך תשומת לב קודם"). */
export const DEFAULT_DIRECTION_BY_SORT_KEY: Record<CommandSortKey, CommandSortDirection> = {
  size: 'desc',
  passPercent: 'asc',
  gap: 'desc',
  appActive: 'desc',
};

export const DEFAULT_SORT_KEY: CommandSortKey = 'size';

/** The minimal shape every pure function here needs — level-0 (VerticalBrigadeRow) and level-1/2 (DashboardUnitRow) rows both map onto this, so the same sort/floor/insight logic runs at every drill level without a type per level. */
export interface CommandRankableRow {
  id: string;
  hasData: boolean;
  totalCount: number;
  testedCount: number;
  passPercent: number | null;
  nearThresholdCount: number;
  appActiveCount: number;
  /** This entity's own internal spread among ITS direct children (battalions-within-a-brigade at level 0, companies-within-a-battalion at level 1) — null when fewer than 2 children qualify (see computeInternalGap). Precomputed by the caller via computeInternalGap, not derived here. */
  gap: number | null;
}

function metricForSortKey(row: CommandRankableRow, key: CommandSortKey): number | null {
  if (key === 'size') return row.totalCount;
  if (key === 'passPercent') return row.passPercent;
  if (key === 'gap') return row.gap;
  return row.appActiveCount;
}

/**
 * Always partitions hasData rows before !hasData rows, regardless of
 * sort key/direction — David: "כל מיון שהמשתמש יבחר דוחף את הריקות
 * לסוף — אין להן ערך למיין לפיו." Within the hasData group, a row whose
 * chosen metric is null (e.g. sorting by "gap" but this entity has
 * fewer than 2 qualifying children) sorts after every row with a real
 * value — same reasoning, one level down.
 */
export function sortCommandRows<T extends CommandRankableRow>(
  rows: T[],
  key: CommandSortKey,
  direction: CommandSortDirection,
): T[] {
  const withData = rows.filter((r) => r.hasData);
  const withoutData = rows.filter((r) => !r.hasData);
  const sign = direction === 'asc' ? 1 : -1;
  withData.sort((a, b) => {
    const ma = metricForSortKey(a, key);
    const mb = metricForSortKey(b, key);
    if (ma === null && mb === null) return a.id.localeCompare(b.id, 'he');
    if (ma === null) return 1;
    if (mb === null) return -1;
    if (ma !== mb) return (ma - mb) * sign;
    return a.id.localeCompare(b.id, 'he');
  });
  withoutData.sort((a, b) => a.id.localeCompare(b.id, 'he'));
  return [...withData, ...withoutData];
}

export interface EdgePick<T> {
  row: T;
  value: number;
}

/** Card 1 — "הכי כשירה". Null when nothing qualifies (every entity is small-sample or has no determinable percent yet) — an honest empty state, never a forced pick. */
export function pickMostFit<T extends CommandRankableRow>(rows: T[], floor: number = SAMPLE_FLOOR_DEFAULT): EdgePick<T> | null {
  const candidates = rows.filter((r) => r.hasData && !isSmallSample(r.testedCount, floor) && r.passPercent !== null);
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => {
    if (b.passPercent! !== a.passPercent!) return b.passPercent! > a.passPercent! ? b : a;
    return b.testedCount !== a.testedCount ? (b.testedCount > a.testedCount ? b : a) : (b.id.localeCompare(a.id, 'he') < 0 ? b : a);
  });
  return { row: best, value: best.passPercent! };
}

/** Card 2 — "הפער הגדול ביותר בין גדודים" (or companies, one level down). Floor applies to the CHILDREN feeding computeInternalGap, not to this entity's own totals — see computeInternalGap. Null when no entity has a computable internal gap. */
export function pickBiggestGap<T extends CommandRankableRow>(rows: T[]): EdgePick<T> | null {
  const candidates = rows.filter((r) => r.hasData && r.gap !== null);
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => {
    if (b.gap! !== a.gap!) return b.gap! > a.gap! ? b : a;
    return b.id.localeCompare(a.id, 'he') < 0 ? b : a;
  });
  return { row: best, value: best.gap! };
}

/** Card 3 — "הכי הרבה קרובים לרף". A real 0 is still a valid pick (never hidden) — null only when nothing qualifies at all (same floor gate as card 1). */
export function pickMostNearThreshold<T extends CommandRankableRow>(rows: T[], floor: number = SAMPLE_FLOOR_DEFAULT): EdgePick<T> | null {
  const candidates = rows.filter((r) => r.hasData && !isSmallSample(r.testedCount, floor));
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => {
    if (b.nearThresholdCount !== a.nearThresholdCount) return b.nearThresholdCount > a.nearThresholdCount ? b : a;
    return b.id.localeCompare(a.id, 'he') < 0 ? b : a;
  });
  return { row: best, value: best.nearThresholdCount };
}

/**
 * The internal spread among a set of direct children (battalions under
 * one brigade, or companies under one battalion) — max(passPercent) -
 * min(passPercent) among children with testedCount >= floor AND a
 * determinable passPercent. Null when fewer than 2 children qualify —
 * a "gap" needs at least two real points to mean anything.
 */
export function computeInternalGap(children: { testedCount: number; passPercent: number | null }[], floor: number = SAMPLE_FLOOR_DEFAULT): number | null {
  const qualifying = children.filter((c) => !isSmallSample(c.testedCount, floor) && c.passPercent !== null).map((c) => c.passPercent as number);
  if (qualifying.length < 2) return null;
  return Math.round((Math.max(...qualifying) - Math.min(...qualifying)) * 10) / 10;
}

/**
 * Single-component view (David's 4 chips: הכל / ריצה / מתח / מקבילים —
 * finer-grained than the pre-existing DashboardUnitViewKey's combined
 * 'strength'). A DashboardComponentBreakdown has no notPerformedCount
 * split of its own (that distinction is only tracked at the combined-
 * view level) — notYetTestedCount is derived as totalCount-testedCount,
 * notPerformedCount is reported as 0 for a single component. An honest
 * simplification (no worse than data that doesn't exist elsewhere
 * either), not a silent approximation — see the build report.
 */
export function singleComponentBreakdown(
  totalCount: number,
  component: { passCount: number; failCount: number; testedCount: number; passPercent: number | null },
): { passCount: number; failCount: number; notPerformedCount: number; notYetTestedCount: number; testedCount: number; passPercent: number | null } {
  return {
    passCount: component.passCount,
    failCount: component.failCount,
    notPerformedCount: 0,
    notYetTestedCount: Math.max(0, totalCount - component.testedCount),
    testedCount: component.testedCount,
    passPercent: component.passPercent,
  };
}
