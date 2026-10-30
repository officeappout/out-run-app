/**
 * Week sheet model (enable_feature_info_sheets_v1, board DragCard as corrected 29.10): the "i"
 * next to "לו״ז אימונים" explains how the week is changed: "שינוי לוז" → "סידור השבוע" → the
 * week builder, where a session moves by its handle (or by tapping the date) → "אישור השבוע".
 * PURE. Built from the user's real week on the home strip: the demo moves the first session
 * still ahead of the user to the next free day after it. No such pair (a full or finished
 * week) → no move, the demo shows the rows and the buttons only.
 */

export interface WeekInfoDayInput {
  /** 0 = Sunday. */
  dow: number;
  /** The strip's own day letter. */
  letter: string;
  /** Day of month. */
  date: number;
  planned: boolean;
  done: boolean;
  /** Before today. */
  past: boolean;
}

export interface WeekInfoRow extends WeekInfoDayInput {
  /** A session sits on this row before the move (planned or done). */
  hasSession: boolean;
}

export interface WeekInfoModel {
  /** The rows the demo shows, in day order (at most MAX_ROWS unless the move needs more). */
  rows: WeekInfoRow[];
  /** The session the demo moves, and where to. Null = no move (fallback). */
  move: { fromDow: number; toDow: number } | null;
}

export const WEEK_INFO_MAX_ROWS = 4;

export function buildWeekInfo(days: readonly WeekInfoDayInput[]): WeekInfoModel | null {
  if (days.length !== 7) return null;
  const sorted = [...days].sort((a, b) => a.dow - b.dow);
  const rows: WeekInfoRow[] = sorted.map((d) => ({ ...d, hasSession: d.planned || d.done }));
  const from = rows.find((d) => !d.past && d.planned && !d.done);
  const to = from ? rows.find((d) => d.dow > from.dow && !d.past && !d.hasSession) : undefined;
  if (from && to) {
    const start = Math.max(0, Math.min(from.dow, to.dow - (WEEK_INFO_MAX_ROWS - 1)));
    return { rows: rows.slice(start, to.dow + 1), move: { fromDow: from.dow, toDow: to.dow } };
  }
  // Fallback: today and the next days, as they are.
  const firstAhead = Math.max(0, rows.findIndex((d) => !d.past));
  const start = Math.min(firstAhead, 7 - WEEK_INFO_MAX_ROWS);
  return { rows: rows.slice(start, start + WEEK_INFO_MAX_ROWS), move: null };
}
