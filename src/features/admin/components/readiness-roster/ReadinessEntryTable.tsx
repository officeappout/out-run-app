'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterSoldierEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessThresholdsConfig, NotPerformedReason } from '@/features/readiness/core/services/readiness-write.service';
import ReadinessStatusBadge from './ReadinessStatusBadge';
import RunTimeInput from './RunTimeInput';

/**
 * Results-entry grid (03.10.2026 locked spec; "not performed" corrected
 * 03.10.2026 — David: per-cell, not per-row). Hardcodes awareness of the
 * 3 known test roles (run / pull-ups / dips) to drive the "which
 * components were measured today" grouping and the mm:ss run input —
 * actual threshold NUMBERS are always read live from `config`, never
 * hardcoded.
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
 *  - A cell already saved this session is locked (shows a checkmark, no
 *    retry) — no correction action exists yet (§13.69 decision 1), so a
 *    resubmit would recreate the exact "correction or new test"
 *    ambiguity that decision avoided.
 */

type ComponentsMode = 'both' | 'run_only' | 'strength_only';

const REASON_OPTIONS: { value: NotPerformedReason; label: string }[] = [
  { value: 'medical_exemption', label: 'פטור רפואי' },
  { value: 'no_show', label: 'לא התייצב' },
  { value: 'other', label: 'אחר' },
];

interface CellState {
  value: number | null;
  notPerformed: boolean;
  notPerformedReason: NotPerformedReason | '';
}

function emptyCell(): CellState {
  return { value: null, notPerformed: false, notPerformedReason: '' };
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

  const cellReady = (cell: CellState): boolean => {
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

  const applyBulkReason = (soldierId: string, reason: NotPerformedReason) => {
    const row = getRow(soldierId);
    const patch: Partial<RowState> = { bulkReason: reason };
    if (runActive && !row.savedTestIds.has(runTest!.id)) patch.run = { value: null, notPerformed: true, notPerformedReason: reason };
    if (pullupsActive && !row.savedTestIds.has(pullupsTest!.id)) patch.pullups = { value: null, notPerformed: true, notPerformedReason: reason };
    if (dipsActive && !row.savedTestIds.has(dipsTest!.id)) patch.dips = { value: null, notPerformed: true, notPerformedReason: reason };
    setRow(soldierId, patch);
  };

  const recordOne = async (soldierId: string, testId: string, body: { value?: number; notPerformedReason?: NotPerformedReason }) => {
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
    if (hasIncompleteNotPerformed(row)) {
      setRow(soldierId, { error: 'יש לבחור סיבה לכל מרכיב שסומן כ"לא ביצע".' });
      return;
    }

    const toSubmit: Array<{ testId: string; body: { value?: number; notPerformedReason?: NotPerformedReason } }> = [];
    const addIfReady = (active: boolean, test: typeof runTest, cell: CellState) => {
      if (!active || !test || row.savedTestIds.has(test.id) || !cellReady(cell)) return;
      if (cell.notPerformed) toSubmit.push({ testId: test.id, body: { notPerformedReason: cell.notPerformedReason as NotPerformedReason } });
      else toSubmit.push({ testId: test.id, body: { value: cell.value as number } });
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
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') nextSaved.add(toSubmit[i].testId);
      else failures.push(toSubmit[i].testId);
    });
    setRow(soldierId, {
      savedTestIds: nextSaved,
      pendingTestIds: new Set(),
      error: failures.length > 0 ? 'חלק מהשמירה נכשל — נסה שוב עבור השדות שלא נשמרו.' : null,
    });
    if (failures.length === 0) onSaved();
  };

  const renderCell = (
    soldierId: string,
    kind: 'run' | 'pullups' | 'dips',
    test: NonNullable<typeof runTest>,
    cell: CellState,
    gender: RosterSoldierEntry['gender'],
    saved: boolean,
    pending: boolean,
  ) => {
    if (saved) {
      return <span className="flex items-center gap-1 text-emerald-700 text-xs font-bold"><Check size={13} /> נשמר</span>;
    }
    const thresholdNote = test.threshold.male !== test.threshold.female
      ? (
        <span className="text-[10px] text-slate-400 block">
          סף: {test.unit === 'seconds'
            ? `${Math.floor(test.threshold[gender] / 60)}:${String(test.threshold[gender] % 60).padStart(2, '0')}`
            : test.threshold[gender]}
        </span>
      )
      : null;
    return (
      <div className="space-y-1">
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
        {thresholdNote}
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
            return (
              <tr key={s.id} className="border-b border-slate-100 last:border-b-0 align-top">
                <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                <td className="py-2.5 px-3 font-bold text-slate-800">{s.name}</td>
                {runActive && (
                  <td className="py-2.5 px-3">
                    {renderCell(s.id, 'run', runTest!, row.run, s.gender, row.savedTestIds.has(runTest!.id), row.pendingTestIds.has(runTest!.id))}
                  </td>
                )}
                {pullupsActive && (
                  <td className="py-2.5 px-3">
                    {renderCell(s.id, 'pullups', pullupsTest!, row.pullups, s.gender, row.savedTestIds.has(pullupsTest!.id), row.pendingTestIds.has(pullupsTest!.id))}
                  </td>
                )}
                {dipsActive && (
                  <td className="py-2.5 px-3">
                    {renderCell(s.id, 'dips', dipsTest!, row.dips, s.gender, row.savedTestIds.has(dipsTest!.id), row.pendingTestIds.has(dipsTest!.id))}
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
