'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterSoldierEntry, RosterSoldierTestDetail } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessThresholdsConfig, ReadinessTestDefinition, NotPerformedReason, RecordResultChoice } from '@/features/readiness/core/services/readiness-write.service';
import ReadinessStatusBadge from './ReadinessStatusBadge';
import RunTimeInput from './RunTimeInput';

/**
 * Results-entry grid (03.10.2026 locked spec; corrected twice since:
 * "not performed" is per-cell not per-row; and 03.10.2026 live-test
 * finding — "אסור שיוצג פסק דין בלי הראיה שמאחוריו", no verdict without
 * the evidence behind it). Hardcodes awareness of the 3 known test
 * roles (run / pull-ups / dips) to drive the "which components were
 * measured today" grouping and the mm:ss run input — actual threshold
 * NUMBERS are always read live from `config`/`testDetails`, never
 * hardcoded.
 *
 * David's live-test report looked like a bug ("entered passing values,
 * status stayed לא כשיר") but the real production data showed the
 * aggregation was correct — one component had a genuinely failing
 * value, and "one failure is enough" is the locked rule. The actual
 * problem was that the screen gave no way to SEE which component, what
 * value, or how stale it was. This file's per-cell evidence block (every
 * test, always rendered, regardless of session state) is the fix —
 * not a change to the aggregation logic, which was already correct.
 *
 * "Not performed" is a per-CELL value, each with its own reason — a
 * soldier medically exempt from the run still does pull-ups and dips
 * normally, and forcing one row-level flag would make the officer
 * either discard two valid results or leave them blank (which reads as
 * "not yet tested," not "exempt" — wrong in a different way). The
 * row-level control is kept as a one-click SHORTCUT that bulk-applies a
 * chosen reason to every currently-active, not-yet-saved cell in the
 * row — convenience, not the model; each cell can still be toggled
 * individually afterward.
 *
 * Iron rules enforced by construction, not validation:
 *  - Status is never typed — only `value`/`notPerformedReason`/`testDate`
 *    ever leave this component.
 *  - Each test is its own independent POST — partial entry never
 *    implicitly fails an untouched component.
 *  - source is always 'organized_test', hardcoded.
 *  - testDate is the SAME for the whole entry session (one header field,
 *    passed down as a prop) — separate from recordedAt, which the
 *    server still stamps itself at write time.
 *  - A cell already saved this session (or carrying an existing active
 *    result from before this session) shows the now-current evidence
 *    by default, with a "הזן תוצאה נוספת" button to reopen it — no
 *    silent retry. 04.10.2026 (§13.87, "תיקון מוצהר") lifted the
 *    §13.69 decision-1 lock described here historically: a resubmit
 *    used to recreate an unresolvable "correction or new test"
 *    ambiguity, so it was blocked outright. Now that ambiguity has a
 *    real answer — the officer explicitly picks "מבדק חדש" or "תיקון
 *    של הקודמת" the moment a conflicting test is reopened — so
 *    reopening is safe again.
 */

type ComponentsMode = 'both' | 'run_only' | 'strength_only';

const REASON_OPTIONS: { value: NotPerformedReason; label: string }[] = [
  { value: 'medical_exemption', label: 'פטור רפואי' },
  { value: 'no_show', label: 'לא התייצב' },
  { value: 'other', label: 'אחר' },
];
const REASON_LABEL: Record<NotPerformedReason, string> = {
  medical_exemption: 'פטור רפואי',
  no_show: 'לא התייצב',
  other: 'אחר',
};

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'seconds') return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  return String(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL');
}

interface CellState {
  value: number | null;
  notPerformed: boolean;
  notPerformedReason: NotPerformedReason | '';
  /** 04.10.2026 (§13.87) — true while the officer has explicitly
   *  reopened a cell that already shows evidence (saved this session,
   *  or an existing active result from before it), to enter another
   *  value. Resets to false the moment that new entry is saved. */
  reentering: boolean;
  /** Required ONLY when this cell's test already has an active result
   *  — 'new_test' | 'correction' | '' (unset, blocks save). */
  choice: RecordResultChoice | '';
}

function emptyCell(): CellState {
  return { value: null, notPerformed: false, notPerformedReason: '', reentering: false, choice: '' };
}

interface RowState {
  run: CellState;
  pullups: CellState;
  dips: CellState;
  savedTestIds: Set<string>;
  pendingTestIds: Set<string>;
  error: string | null;
  bulkReason: NotPerformedReason | '';
}

function emptyRow(): RowState {
  return {
    run: emptyCell(),
    pullups: emptyCell(),
    dips: emptyCell(),
    savedTestIds: new Set(),
    pendingTestIds: new Set(),
    error: null,
    bulkReason: '',
  };
}

interface ReadinessEntryTableProps {
  soldiers: RosterSoldierEntry[];
  config: ReadinessThresholdsConfig;
  componentsMode: ComponentsMode;
  testDate: string; // ISO yyyy-mm-dd, shared across the whole entry session
  onSaved: () => void;
}

export default function ReadinessEntryTable({ soldiers, config, componentsMode, testDate, onSaved }: ReadinessEntryTableProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const runTest = config.tests.find((t) => t.id === 'run_3000m') ?? null;
  const pullupsTest = config.tests.find((t) => t.id === 'pullups') ?? null;
  const dipsTest = config.tests.find((t) => t.id === 'dips') ?? null;

  const runActive = componentsMode !== 'strength_only' && runTest !== null;
  const strengthActive = componentsMode !== 'run_only';
  const pullupsActive = strengthActive && pullupsTest !== null;
  const dipsActive = strengthActive && dipsTest !== null;

  const getRow = (soldierId: string): RowState => rows[soldierId] ?? emptyRow();
  const setRow = (soldierId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [soldierId]: { ...getRow(soldierId), ...patch } }));
  };
  const setCell = (soldierId: string, cell: 'run' | 'pullups' | 'dips', patch: Partial<CellState>) => {
    const row = getRow(soldierId);
    setRow(soldierId, { [cell]: { ...row[cell], ...patch }, error: null } as Partial<RowState>);
  };

  /** 04.10.2026 (§13.87) — an existing ACTIVE result for this test, from
   *  either before this session or saved earlier in it (both show up
   *  identically in testDetails — the roster refetches after every
   *  save). A soldier with no result at all for this test has nothing
   *  to disambiguate, so no choice is ever required. */
  const hasExistingResult = (detailByTestId: Record<string, RosterSoldierTestDetail>, testId: string): boolean => {
    return detailByTestId[testId]?.status !== 'not_yet_tested';
  };

  const cellReady = (cell: CellState, existing: boolean): boolean => {
    if (existing && cell.choice === '') return false;
    if (cell.notPerformed) return cell.notPerformedReason !== '';
    return cell.value !== null;
  };
  const isDirty = (row: RowState): boolean => {
    return (runActive && (row.run.value !== null || row.run.notPerformed)) ||
      (pullupsActive && (row.pullups.value !== null || row.pullups.notPerformed)) ||
      (dipsActive && (row.dips.value !== null || row.dips.notPerformed));
  };
  const hasIncompleteNotPerformed = (row: RowState): boolean => {
    return (runActive && row.run.notPerformed && !row.run.notPerformedReason) ||
      (pullupsActive && row.pullups.notPerformed && !row.pullups.notPerformedReason) ||
      (dipsActive && row.dips.notPerformed && !row.dips.notPerformedReason);
  };
  const hasIncompleteChoice = (row: RowState, detailByTestId: Record<string, RosterSoldierTestDetail>): boolean => {
    const missing = (active: boolean, test: typeof runTest, cell: CellState) => {
      if (!active || !test) return false;
      const dirty = cell.value !== null || cell.notPerformed;
      return dirty && hasExistingResult(detailByTestId, test.id) && cell.choice === '';
    };
    return missing(runActive, runTest, row.run) || missing(pullupsActive, pullupsTest, row.pullups) || missing(dipsActive, dipsTest, row.dips);
  };

  const applyBulkReason = (soldierId: string, reason: NotPerformedReason) => {
    const row = getRow(soldierId);
    const patch: Partial<RowState> = { bulkReason: reason };
    if (runActive && !row.savedTestIds.has(runTest!.id)) patch.run = { ...row.run, value: null, notPerformed: true, notPerformedReason: reason };
    if (pullupsActive && !row.savedTestIds.has(pullupsTest!.id)) patch.pullups = { ...row.pullups, value: null, notPerformed: true, notPerformedReason: reason };
    if (dipsActive && !row.savedTestIds.has(dipsTest!.id)) patch.dips = { ...row.dips, value: null, notPerformed: true, notPerformedReason: reason };
    setRow(soldierId, patch);
  };

  const recordOne = async (soldierId: string, testId: string, body: { value?: number; notPerformedReason?: NotPerformedReason; choice?: RecordResultChoice }) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const res = await fetch('/api/units/readiness/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ soldierId, testId, source: 'organized_test', testDate, ...body }),
    });
    const responseBody = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof responseBody.error === 'string' ? responseBody.error : `שגיאה (${res.status})`);
  };

  const handleSaveRow = async (soldierId: string) => {
    const row = getRow(soldierId);
    const soldier = soldiers.find((s) => s.id === soldierId);
    const detailByTestId = Object.fromEntries((soldier?.testDetails ?? []).map((d) => [d.testId, d]));

    if (hasIncompleteNotPerformed(row)) {
      setRow(soldierId, { error: 'יש לבחור סיבה לכל מרכיב שסומן כ"לא ביצע".' });
      return;
    }
    if (hasIncompleteChoice(row, detailByTestId)) {
      setRow(soldierId, { error: 'כבר קיימת תוצאה למרכיב זה — יש לבחור מבדק חדש או תיקון של הקודמת.' });
      return;
    }

    const toSubmit: Array<{ testId: string; body: { value?: number; notPerformedReason?: NotPerformedReason; choice?: RecordResultChoice } }> = [];
    const addIfReady = (active: boolean, test: typeof runTest, cell: CellState) => {
      if (!active || !test) return;
      if (row.savedTestIds.has(test.id) && !cell.reentering) return;
      const existing = hasExistingResult(detailByTestId, test.id);
      if (!cellReady(cell, existing)) return;
      const choice = existing ? (cell.choice as RecordResultChoice) : undefined;
      if (cell.notPerformed) toSubmit.push({ testId: test.id, body: { notPerformedReason: cell.notPerformedReason as NotPerformedReason, choice } });
      else toSubmit.push({ testId: test.id, body: { value: cell.value as number, choice } });
    };
    addIfReady(runActive, runTest, row.run);
    addIfReady(pullupsActive, pullupsTest, row.pullups);
    addIfReady(dipsActive, dipsTest, row.dips);
    if (toSubmit.length === 0) return;

    setRow(soldierId, { error: null, pendingTestIds: new Set(toSubmit.map((s) => s.testId)) });

    const results = await Promise.allSettled(toSubmit.map((s) => recordOne(soldierId, s.testId, s.body)));

    const current = getRow(soldierId);
    const nextSaved = new Set(current.savedTestIds);
    const failures: string[] = [];
    const resetPatch: Partial<RowState> = {};
    results.forEach((r, i) => {
      const testId = toSubmit[i].testId;
      if (r.status === 'fulfilled') {
        nextSaved.add(testId);
        // Back to the default "just saved, showing evidence" cell state
        // — reentering/choice are per-submission, never carried forward.
        if (testId === runTest?.id) resetPatch.run = emptyCell();
        if (testId === pullupsTest?.id) resetPatch.pullups = emptyCell();
        if (testId === dipsTest?.id) resetPatch.dips = emptyCell();
      } else {
        failures.push(testId);
      }
    });
    setRow(soldierId, {
      ...resetPatch,
      savedTestIds: nextSaved,
      pendingTestIds: new Set(),
      error: failures.length > 0 ? 'חלק מהשמירה נכשל — נסה שוב עבור השדות שלא נשמרו.' : null,
    });
    if (failures.length === 0) onSaved();
  };

  /**
   * The evidence block — ALWAYS rendered for every active test, whether
   * there's a saved result or not. This is the direct fix for "no
   * verdict without the evidence behind it": value, date, threshold,
   * pass/fail, all visible, not just the collapsed badge. Highlighted
   * red when this specific test is the (or one of the) reason the
   * overall status reads "לא כשיר" — so the officer never has to guess
   * which component to investigate.
   */
  const renderEvidence = (detail: RosterSoldierTestDetail, test: ReadinessTestDefinition, isCulprit: boolean) => {
    const thresholdDisplay = formatValue(detail.thresholdValue, test.unit);
    if (detail.status === 'not_yet_tested') {
      return <p className="text-[10px] text-slate-400">טרם נבדק · סף: {thresholdDisplay}</p>;
    }
    const valueDisplay = detail.status === 'not_performed'
      ? (detail.notPerformedReason ? REASON_LABEL[detail.notPerformedReason] : 'לא ביצע')
      : formatValue(detail.value, test.unit);
    return (
      <div className={`text-[10px] rounded-lg px-2 py-1 ${isCulprit ? 'bg-red-50 text-red-700 font-bold border border-red-200' : 'bg-slate-50 text-slate-600'}`}>
        <div>ערך: {valueDisplay} · סף: {thresholdDisplay}</div>
        <div className={isCulprit ? 'text-red-600' : 'text-slate-400'}>{formatDate(detail.testDate)}</div>
      </div>
    );
  };

  const renderCell = (
    soldierId: string,
    kind: 'run' | 'pullups' | 'dips',
    test: NonNullable<typeof runTest>,
    detail: RosterSoldierTestDetail,
    cell: CellState,
    saved: boolean,
    pending: boolean,
    isCulprit: boolean,
  ) => {
    const existing = detail?.status !== 'not_yet_tested';
    if ((saved || existing) && !cell.reentering) {
      // The just-saved (or already-existing) value is shown via the
      // evidence block itself — no separate "✓ saved" marker needed
      // once the evidence IS the value. 04.10.2026 (§13.87) — a button
      // to reopen it, instead of a permanent lock: reopening is safe
      // now that the officer must explicitly pick "מבדק חדש" or "תיקון
      // של הקודמת" the moment they do.
      return (
        <div className="space-y-1">
          {renderEvidence(detail, test, isCulprit)}
          <button
            type="button"
            onClick={() => setCell(soldierId, kind, { reentering: true })}
            className="text-[10px] text-cyan-700 hover:underline font-semibold"
          >
            הזן תוצאה נוספת
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {renderEvidence(detail, test, isCulprit)}
        {existing && (
          <div className="text-[10px] bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 space-y-1">
            <p className="font-bold text-amber-800">כבר קיימת תוצאה — מה זה?</p>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`choice-${soldierId}-${test.id}`}
                checked={cell.choice === 'new_test'}
                onChange={() => setCell(soldierId, kind, { choice: 'new_test' })}
              />
              מבדק חדש — נוספת לצד הקודמת
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`choice-${soldierId}-${test.id}`}
                checked={cell.choice === 'correction'}
                onChange={() => setCell(soldierId, kind, { choice: 'correction' })}
              />
              תיקון של הקודמת — מחליפה אותה
            </label>
          </div>
        )}
        {cell.notPerformed ? (
          <select
            value={cell.notPerformedReason}
            onChange={(e) => setCell(soldierId, kind, { notPerformedReason: e.target.value as NotPerformedReason })}
            disabled={pending}
            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-200 w-full"
            dir="rtl"
          >
            <option value="">בחר סיבה...</option>
            {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        ) : kind === 'run' ? (
          <RunTimeInput totalSeconds={cell.value} onChange={(v) => setCell(soldierId, kind, { value: v })} disabled={pending} />
        ) : (
          <input
            type="number"
            min={0}
            disabled={pending}
            value={cell.value ?? ''}
            onChange={(e) => setCell(soldierId, kind, { value: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-300"
          />
        )}
        <label className="flex items-center gap-1 text-[10px] text-slate-500">
          <input
            type="checkbox"
            checked={cell.notPerformed}
            disabled={pending}
            onChange={(e) => setCell(soldierId, kind, { notPerformed: e.target.checked, value: null, notPerformedReason: e.target.checked ? cell.notPerformedReason : '' })}
          />
          לא ביצע
        </label>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
            <th className="text-right py-2 px-3 w-8">#</th>
            <th className="text-right py-2 px-3">שם</th>
            {runActive && <th className="text-right py-2 px-3">ריצת 3,000 מ׳</th>}
            {pullupsActive && <th className="text-right py-2 px-3">עליות מתח</th>}
            {dipsActive && <th className="text-right py-2 px-3">מקבילים</th>}
            <th className="text-right py-2 px-3">תוצאה</th>
            <th className="text-right py-2 px-3">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {soldiers.map((s, i) => {
            const row = getRow(s.id);
            const detailByTestId = Object.fromEntries(s.testDetails.map((d) => [d.testId, d]));
            const isOverallFail = s.currentStatus === 'fail';
            return (
              <tr key={s.id} className="border-b border-slate-100 last:border-b-0 align-top">
                <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                <td className="py-2.5 px-3 font-bold text-slate-800">{s.name}</td>
                {runActive && runTest && (
                  <td className="py-2.5 px-3">
                    {renderCell(s.id, 'run', runTest, detailByTestId[runTest.id], row.run, row.savedTestIds.has(runTest.id), row.pendingTestIds.has(runTest.id), isOverallFail && detailByTestId[runTest.id]?.status === 'fail')}
                  </td>
                )}
                {pullupsActive && pullupsTest && (
                  <td className="py-2.5 px-3">
                    {renderCell(s.id, 'pullups', pullupsTest, detailByTestId[pullupsTest.id], row.pullups, row.savedTestIds.has(pullupsTest.id), row.pendingTestIds.has(pullupsTest.id), isOverallFail && detailByTestId[pullupsTest.id]?.status === 'fail')}
                  </td>
                )}
                {dipsActive && dipsTest && (
                  <td className="py-2.5 px-3">
                    {renderCell(s.id, 'dips', dipsTest, detailByTestId[dipsTest.id], row.dips, row.savedTestIds.has(dipsTest.id), row.pendingTestIds.has(dipsTest.id), isOverallFail && detailByTestId[dipsTest.id]?.status === 'fail')}
                  </td>
                )}
                <td className="py-2.5 px-3"><ReadinessStatusBadge status={s.currentStatus} notPerformedReason={s.notPerformedReason} /></td>
                <td className="py-2.5 px-3 space-y-1.5 min-w-[140px]">
                  <div className="flex items-center gap-1">
                    <select
                      value={row.bulkReason}
                      onChange={(e) => { if (e.target.value) applyBulkReason(s.id, e.target.value as NotPerformedReason); }}
                      className="text-[10px] border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      dir="rtl"
                      title="סמן את כל המרכיבים הפעילים כלא ביצע, בסיבה אחת"
                    >
                      <option value="">לא ביצע הכל...</option>
                      {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => handleSaveRow(s.id)}
                    disabled={!isDirty(row) || row.pendingTestIds.size > 0}
                    className="flex items-center gap-1.5 bg-lime-700 hover:bg-lime-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {row.pendingTestIds.size > 0 ? <Loader2 size={12} className="animate-spin" /> : null}
                    שמור
                  </button>
                  {row.error && <p className="text-[10px] text-red-600 font-semibold">{row.error}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
