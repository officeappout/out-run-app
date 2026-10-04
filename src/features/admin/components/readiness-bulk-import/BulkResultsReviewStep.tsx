'use client';

import type { ParsedResultsRow, RosterMatchResult } from '@/features/readiness/core/services/readiness-results-import-parse';
import { READINESS_COLORS } from '../readiness-dashboard/colors';

/** 'pass'/'fail'/'not_yet_tested' only — this import format has no
 *  not-performed-reason concept, so the 4th real status
 *  (not_performed) never appears here. Preview only: the server
 *  computes the authoritative outcome at write time against
 *  whatever the global threshold config is AT THAT MOMENT — a stale
 *  client-side config (fetched once when the screen loaded) could in
 *  principle disagree if an admin changes thresholds mid-session; an
 *  edge case, not a correctness bug in what gets WRITTEN. */
export type PreviewTestStatus = 'pass' | 'fail' | 'not_yet_tested';

export interface BulkResultsReviewRow {
  parsed: ParsedResultsRow;
  isDuplicateVsRoster: boolean;
  isDuplicateWithinPaste: boolean;
  duplicateChoice: 'add' | 'skip';
  rosterMatch: RosterMatchResult | null;
  chosenSoldierId: string | null;
  runStatus: PreviewTestStatus;
  pullupsStatus: PreviewTestStatus;
  dipsStatus: PreviewTestStatus;
  overallLabel: 'כשיר' | 'לא כשיר' | 'חלקי' | 'טרם נבדק';
  /**
   * 04.10.2026 (§13.87, "תיקון מוצהר") — 'existing_roster' mode only: at
   * least one test value in this row already has an active organized_
   * test result on file for the matched/chosen soldier. Purely
   * informational here (never excludes the row) — the ONE paste-level
   * conflictMode choice (not per-row) decides what happens to every
   * conflicting row at submit time.
   */
  conflictsWithExisting: boolean;
}

function parseErrorsOf(row: BulkResultsReviewRow, mode: 'new_roster' | 'existing_roster'): string[] {
  const errs: string[] = [];
  if (mode === 'new_roster' && row.parsed.genderError) errs.push(row.parsed.genderError);
  if (row.parsed.runError) errs.push(`ריצה: ${row.parsed.runError}`);
  if (row.parsed.pullupsError) errs.push(`עליות מתח: ${row.parsed.pullupsError}`);
  if (row.parsed.dipsError) errs.push(`מקבילים: ${row.parsed.dipsError}`);
  if (row.parsed.dateError) errs.push(`תאריך: ${row.parsed.dateError}`);
  return errs;
}

export function rowHasBlockingError(row: BulkResultsReviewRow, mode: 'new_roster' | 'existing_roster'): boolean {
  return parseErrorsOf(row, mode).length > 0;
}

export function rowIsExcluded(row: BulkResultsReviewRow, mode: 'new_roster' | 'existing_roster'): boolean {
  if (mode === 'new_roster') {
    return (row.isDuplicateVsRoster || row.isDuplicateWithinPaste) && row.duplicateChoice === 'skip';
  }
  if (!row.rosterMatch) return true;
  if (row.rosterMatch.kind === 'not_found') return true;
  if (row.rosterMatch.kind === 'ambiguous' && !row.chosenSoldierId) return true;
  return false;
}

function statusDot(status: PreviewTestStatus) {
  const color = status === 'pass' ? READINESS_COLORS.pass : status === 'fail' ? READINESS_COLORS.fail : READINESS_COLORS.notYetTested;
  return <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />;
}

function TestCell({ rawLabel, status }: { rawLabel: string; status: PreviewTestStatus }) {
  return (
    <div className="flex items-center gap-1.5">
      {statusDot(status)}
      <span className={status === 'not_yet_tested' ? 'text-slate-400' : 'font-bold text-slate-800'}>{rawLabel}</span>
    </div>
  );
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Step 2 — review before import, two explicit modes (David's locked
 * spec, §13.83): 'new_roster' creates soldiers (duplicate vs. roster /
 * within-paste handling, same convention as the existing name-only
 * import); 'existing_roster' creates NOTHING, ever — a row resolves to
 * exactly one existing soldier or it is excluded, period. Nothing is
 * written from here; onSubmit (owned by the page) is the only path to
 * the server, only once the officer clicks it explicitly, and a row
 * carrying any parse error BLOCKS the whole submit (never silently
 * drops one person's result while the rest sail through).
 */
interface BulkResultsReviewStepProps {
  mode: 'new_roster' | 'existing_roster';
  rows: BulkResultsReviewRow[];
  onDuplicateChoiceChange: (index: number, choice: 'add' | 'skip') => void;
  onSoldierPick: (index: number, soldierId: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  /** 04.10.2026 (§13.87) — ONE choice for the whole paste, not per row. '' = unset (blocks submit whenever at least one INCLUDED row conflicts). */
  conflictMode: 'new_test' | 'correction' | '';
  onConflictModeChange: (mode: 'new_test' | 'correction') => void;
}

export default function BulkResultsReviewStep({
  mode, rows, onDuplicateChoiceChange, onSoldierPick, onCancel, onSubmit, submitting, submitError,
  conflictMode, onConflictModeChange,
}: BulkResultsReviewStepProps) {
  const included = rows.filter((r) => !rowIsExcluded(r, mode) && !rowHasBlockingError(r, mode));
  const blockingCount = rows.filter((r) => rowHasBlockingError(r, mode)).length;
  const excludedCount = rows.filter((r) => rowIsExcluded(r, mode) && !rowHasBlockingError(r, mode)).length;
  const vsRosterCount = mode === 'new_roster' ? rows.filter((r) => r.isDuplicateVsRoster).length : 0;
  const withinPasteCount = mode === 'new_roster' ? rows.filter((r) => r.isDuplicateWithinPaste).length : 0;
  const notFoundCount = mode === 'existing_roster' ? rows.filter((r) => r.rosterMatch?.kind === 'not_found').length : 0;
  const ambiguousUnresolvedCount = mode === 'existing_roster'
    ? rows.filter((r) => r.rosterMatch?.kind === 'ambiguous' && !r.chosenSoldierId).length
    : 0;
  const conflictingIncludedCount = included.filter((r) => r.conflictsWithExisting).length;

  const summaryCounts = included.reduce(
    (acc, r) => { acc[r.overallLabel] = (acc[r.overallLabel] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  const needsConflictChoice = conflictingIncludedCount > 0 && conflictMode === '';
  const blocked = blockingCount > 0 || included.length === 0 || needsConflictChoice;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-black text-gray-900">2 · בדיקה לפני ייבוא</h2>
        {rows.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{included.length} ייובאו</span>
            {Object.entries(summaryCounts).map(([label, count]) => (
              <span key={label} className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-50 text-slate-500">{label}: {count}</span>
            ))}
            {blockingCount > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: `${READINESS_COLORS.fail}1A`, color: READINESS_COLORS.fail }}>{blockingCount} שגיאות — חוסם ייבוא</span>}
            {vsRosterCount > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{vsRosterCount} כפילות מול הרשימה</span>}
            {withinPasteCount > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{withinPasteCount} כפילות בתוך ההדבקה</span>}
            {notFoundCount > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{notFoundCount} שם לא נמצא</span>}
            {ambiguousUnresolvedCount > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{ambiguousUnresolvedCount} דורשים הכרעה</span>}
            {conflictingIncludedCount > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{conflictingIncludedCount} מתנגשות עם תוצאות קיימות</span>}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 text-center py-10">
          הדבק או העלה קובץ מימין כדי להתחיל
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200 sticky top-0 bg-white">
                <th className="text-right py-2 px-2 w-10">#</th>
                <th className="text-right py-2 px-2">שם</th>
                {mode === 'new_roster' && <th className="text-right py-2 px-2">מגדר</th>}
                <th className="text-right py-2 px-2">ריצה</th>
                <th className="text-right py-2 px-2">מתח</th>
                <th className="text-right py-2 px-2">מקבילים</th>
                <th className="text-right py-2 px-2">סטטוס</th>
                <th className="text-right py-2 px-2">מצב</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const errors = parseErrorsOf(row, mode);
                const excluded = rowIsExcluded(row, mode);
                const blocking = errors.length > 0;
                const rowBg = blocking ? 'bg-red-50' : excluded ? 'bg-amber-50' : '';
                return (
                  <tr key={i} className={`border-b border-slate-100 last:border-b-0 ${rowBg}`}>
                    <td className="py-2 px-2 text-[11px] text-slate-400">{i + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-800">{row.parsed.name}</td>
                    {mode === 'new_roster' && (
                      <td className="py-2 px-2 text-xs">{row.parsed.gender === 'male' ? 'זכר' : row.parsed.gender === 'female' ? 'נקבה' : '—'}</td>
                    )}
                    <td className="py-2 px-2"><TestCell rawLabel={formatSeconds(row.parsed.runSeconds)} status={row.runStatus} /></td>
                    <td className="py-2 px-2"><TestCell rawLabel={row.parsed.pullupsReps !== null ? String(row.parsed.pullupsReps) : '—'} status={row.pullupsStatus} /></td>
                    <td className="py-2 px-2"><TestCell rawLabel={row.parsed.dipsReps !== null ? String(row.parsed.dipsReps) : '—'} status={row.dipsStatus} /></td>
                    <td className="py-2 px-2 text-xs font-bold">{row.overallLabel}</td>
                    <td className="py-2 px-2">
                      {blocking ? (
                        <span className="text-[11px] font-bold text-red-600" title={errors.join(' · ')}>{errors[0]}</span>
                      ) : mode === 'new_roster' && (row.isDuplicateVsRoster || row.isDuplicateWithinPaste) ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-amber-700">
                            {row.isDuplicateVsRoster && row.isDuplicateWithinPaste ? 'כבר קיים · כפילות בהדבקה' : row.isDuplicateVsRoster ? 'כבר קיים ברשימה' : 'כפילות בתוך ההדבקה'}
                          </span>
                          <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                            <button onClick={() => onDuplicateChoiceChange(i, 'skip')} className={`text-[10px] font-bold px-2 py-1 ${row.duplicateChoice === 'skip' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>דלג</button>
                            <button onClick={() => onDuplicateChoiceChange(i, 'add')} className={`text-[10px] font-bold px-2 py-1 border-r border-gray-200 ${row.duplicateChoice === 'add' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>הוסף בכל זאת</button>
                          </div>
                        </div>
                      ) : mode === 'existing_roster' && row.rosterMatch?.kind === 'not_found' ? (
                        <span className="text-[11px] font-bold text-amber-700">שם לא נמצא ברשימה — לא יישמר</span>
                      ) : mode === 'existing_roster' && row.rosterMatch?.kind === 'ambiguous' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-amber-700">מתאים ל-{row.rosterMatch.candidateIds.length} רשומות</span>
                          <select
                            value={row.chosenSoldierId ?? ''}
                            onChange={(e) => onSoldierPick(i, e.target.value)}
                            className="text-[11px] border border-amber-300 rounded-lg px-1.5 py-1 bg-white"
                          >
                            <option value="">בחר רשומה</option>
                            {row.rosterMatch.candidateIds.map((id, idx) => (
                              <option key={id} value={id}>רשומה {idx + 1}</option>
                            ))}
                          </select>
                        </div>
                      ) : row.conflictsWithExisting ? (
                        <span className="text-[11px] font-bold text-amber-700">
                          מתנגש עם תוצאה קיימת — {conflictMode === 'correction' ? 'יוחלף' : conflictMode === 'new_test' ? 'יתווסף לצד הקיים' : 'ממתין לבחירה'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold" style={{ color: READINESS_COLORS.pass }}>מוכן לייבוא</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {conflictingIncludedCount > 0 && (
        <div className="mt-3 text-[11px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 space-y-1.5">
          <p className="font-bold text-amber-800">
            {conflictingIncludedCount} שורות מתנגשות עם תוצאות קיימות. ההדבקה היא אירוע אחד — בחירה אחת לכל השורות המתנגשות:
          </p>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="bulk-conflict-mode" checked={conflictMode === 'new_test'} onChange={() => onConflictModeChange('new_test')} />
            מבדק חדש — כל השורות המתנגשות נוספות לצד הקיימות
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="bulk-conflict-mode" checked={conflictMode === 'correction'} onChange={() => onConflictModeChange('correction')} />
            תיקון של אותו יום — כל השורות המתנגשות מחליפות את הקיימות
          </label>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pt-4 mt-2 border-t border-gray-100">
          {submitError && <p className="text-xs text-red-600 font-semibold mb-2">{submitError}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-500 flex-1">
              {blockingCount > 0 ? (
                <span className="font-bold text-red-600">{blockingCount} שורות עם שגיאה — הייבוא חסום עד שיתוקנו.</span>
              ) : included.length === 0 ? (
                <span className="font-bold text-amber-700">אין שורות לייבוא.</span>
              ) : needsConflictChoice ? (
                <span className="font-bold text-amber-700">יש לבחור מבדק חדש או תיקון לפני ייבוא.</span>
              ) : (
                <>הייבוא הוא פעולה אחת — או שהכל נכנס או שכלום לא.{excludedCount > 0 && ` ${excludedCount} שורות לא יישמרו (דולגו/לא נמצאו/לא הוכרעו).`}</>
              )}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={onCancel} className="text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all">ביטול</button>
              <button
                onClick={onSubmit}
                disabled={blocked || submitting}
                className="text-sm font-bold text-white bg-lime-700 hover:bg-lime-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl transition-all"
              >
                {submitting ? 'מייבא…' : `ייבוא ${included.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
