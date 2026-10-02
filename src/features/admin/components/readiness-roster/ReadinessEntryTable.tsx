'use client';

import { useState, useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterSoldierEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessThresholdsConfig, NotPerformedReason } from '@/features/readiness/core/services/readiness-write.service';
import ReadinessStatusBadge from './ReadinessStatusBadge';
import RunTimeInput from './RunTimeInput';

/**
 * Results-entry grid (03.10.2026 locked spec). Hardcodes awareness of
 * the 3 known test roles (run / pull-ups / dips) to drive the "which
 * components were measured today" grouping and the mm:ss run input —
 * actual threshold NUMBERS are always read live from `config`, never
 * hardcoded, so a future threshold edit (root-only, later round) is
 * reflected here without a code change.
 *
 * Iron rules enforced by construction, not validation:
 *  - Status is never typed — the component only ever sends `value` or
 *    `notPerformedReason` to POST /api/units/readiness/results; there is
 *    no field anywhere in this file that could carry an outcome.
 *  - Each test is its own independent POST — a soldier with only the
 *    run filled in submits exactly one call, leaving pull-ups/dips
 *    untouched (they stay "טרם נבדק", never implicitly failed).
 *  - source is always 'organized_test', hardcoded — never a prop, never
 *    user-selectable.
 *  - Once a specific cell's save succeeds THIS SESSION, it's locked
 *    (shows a checkmark, no retry) — point 1 of §13.69's decision: this
 *    screen creates new results only, it has no correction action, so
 *    there is no safe way to let an already-saved cell be resubmitted
 *    without silently creating the exact "is this a correction or a
 *    new test" ambiguity David's decision explicitly avoided.
 */

type ComponentsMode = 'both' | 'run_only' | 'strength_only';

const REASON_OPTIONS: { value: NotPerformedReason; label: string }[] = [
  { value: 'medical_exemption', label: 'פטור רפואי' },
  { value: 'no_show', label: 'לא התייצב' },
  { value: 'other', label: 'אחר' },
];

interface RowState {
  runSeconds: number | null;
  pullups: number | null;
  dips: number | null;
  notPerformed: boolean;
  notPerformedReason: NotPerformedReason | '';
  savedTestIds: Set<string>;
  pendingTestIds: Set<string>;
  error: string | null;
}

function emptyRow(): RowState {
  return {
    runSeconds: null,
    pullups: null,
    dips: null,
    notPerformed: false,
    notPerformedReason: '',
    savedTestIds: new Set(),
    pendingTestIds: new Set(),
    error: null,
  };
}

interface ReadinessEntryTableProps {
  soldiers: RosterSoldierEntry[];
  config: ReadinessThresholdsConfig;
  componentsMode: ComponentsMode;
  onSaved: () => void;
}

export default function ReadinessEntryTable({ soldiers, config, componentsMode, onSaved }: ReadinessEntryTableProps) {
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

  const isDirty = (row: RowState): boolean => {
    if (row.notPerformed) return row.notPerformedReason !== '';
    return (runActive && row.runSeconds !== null) || (pullupsActive && row.pullups !== null) || (dipsActive && row.dips !== null);
  };

  const recordOne = async (soldierId: string, testId: string, body: { value?: number; notPerformedReason?: NotPerformedReason }) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const res = await fetch('/api/units/readiness/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ soldierId, testId, source: 'organized_test', ...body }),
    });
    const responseBody = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof responseBody.error === 'string' ? responseBody.error : `שגיאה (${res.status})`);
  };

  const handleSaveRow = async (soldierId: string) => {
    const row = getRow(soldierId);
    if (row.notPerformed && !row.notPerformedReason) {
      setRow(soldierId, { error: 'יש לבחור סיבה.' });
      return;
    }

    const toSubmit: Array<{ testId: string; body: { value?: number; notPerformedReason?: NotPerformedReason } }> = [];
    if (row.notPerformed) {
      if (runActive && runTest) toSubmit.push({ testId: runTest.id, body: { notPerformedReason: row.notPerformedReason as NotPerformedReason } });
      if (pullupsActive && pullupsTest) toSubmit.push({ testId: pullupsTest.id, body: { notPerformedReason: row.notPerformedReason as NotPerformedReason } });
      if (dipsActive && dipsTest) toSubmit.push({ testId: dipsTest.id, body: { notPerformedReason: row.notPerformedReason as NotPerformedReason } });
    } else {
      if (runActive && runTest && row.runSeconds !== null) toSubmit.push({ testId: runTest.id, body: { value: row.runSeconds } });
      if (pullupsActive && pullupsTest && row.pullups !== null) toSubmit.push({ testId: pullupsTest.id, body: { value: row.pullups } });
      if (dipsActive && dipsTest && row.dips !== null) toSubmit.push({ testId: dipsTest.id, body: { value: row.dips } });
    }
    // Never resubmit a cell already saved this session (see file header).
    const toSubmitFresh = toSubmit.filter((s) => !row.savedTestIds.has(s.testId));
    if (toSubmitFresh.length === 0) return;

    setRow(soldierId, { error: null, pendingTestIds: new Set(toSubmitFresh.map((s) => s.testId)) });

    const results = await Promise.allSettled(toSubmitFresh.map((s) => recordOne(soldierId, s.testId, s.body)));

    const current = getRow(soldierId);
    const nextSaved = new Set(current.savedTestIds);
    const failures: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') nextSaved.add(toSubmitFresh[i].testId);
      else failures.push(toSubmitFresh[i].testId);
    });
    setRow(soldierId, {
      savedTestIds: nextSaved,
      pendingTestIds: new Set(),
      error: failures.length > 0 ? 'חלק מהשמירה נכשל — נסה שוב עבור השדות שלא נשמרו.' : null,
    });
    if (failures.length === 0) onSaved();
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
            <th className="text-right py-2 px-3">לא ביצע</th>
            <th className="text-right py-2 px-3">תוצאה</th>
            <th className="text-right py-2 px-3">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {soldiers.map((s, i) => {
            const row = getRow(s.id);
            const genderNote = (test: typeof runTest) => {
              if (!test) return null;
              if (test.threshold.male === test.threshold.female) return null;
              const mine = test.threshold[s.gender];
              return <span className="text-[10px] text-slate-400 block">סף: {test.unit === 'seconds' ? `${Math.floor(mine / 60)}:${String(mine % 60).padStart(2, '0')}` : mine}</span>;
            };
            return (
              <tr key={s.id} className="border-b border-slate-100 last:border-b-0 align-top">
                <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                <td className="py-2.5 px-3 font-bold text-slate-800">{s.name}</td>
                {runActive && (
                  <td className="py-2.5 px-3">
                    {row.savedTestIds.has(runTest!.id) ? (
                      <span className="flex items-center gap-1 text-emerald-700 text-xs font-bold"><Check size={13} /> נשמר</span>
                    ) : (
                      <>
                        <RunTimeInput
                          totalSeconds={row.runSeconds}
                          onChange={(v) => setRow(s.id, { runSeconds: v })}
                          disabled={row.notPerformed || row.pendingTestIds.has(runTest!.id)}
                        />
                        {genderNote(runTest)}
                      </>
                    )}
                  </td>
                )}
                {pullupsActive && (
                  <td className="py-2.5 px-3">
                    {row.savedTestIds.has(pullupsTest!.id) ? (
                      <span className="flex items-center gap-1 text-emerald-700 text-xs font-bold"><Check size={13} /> נשמר</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          disabled={row.notPerformed || row.pendingTestIds.has(pullupsTest!.id)}
                          value={row.pullups ?? ''}
                          onChange={(e) => setRow(s.id, { pullups: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-300"
                        />
                        {genderNote(pullupsTest)}
                      </>
                    )}
                  </td>
                )}
                {dipsActive && (
                  <td className="py-2.5 px-3">
                    {row.savedTestIds.has(dipsTest!.id) ? (
                      <span className="flex items-center gap-1 text-emerald-700 text-xs font-bold"><Check size={13} /> נשמר</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          disabled={row.notPerformed || row.pendingTestIds.has(dipsTest!.id)}
                          value={row.dips ?? ''}
                          onChange={(e) => setRow(s.id, { dips: e.target.value === '' ? null : Number(e.target.value) })}
                          className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-300"
                        />
                        {genderNote(dipsTest)}
                      </>
                    )}
                  </td>
                )}
                <td className="py-2.5 px-3">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={row.notPerformed}
                        onChange={(e) => setRow(s.id, { notPerformed: e.target.checked, runSeconds: null, pullups: null, dips: null, error: null })}
                      />
                      לא ביצע
                    </label>
                    {row.notPerformed && (
                      <select
                        value={row.notPerformedReason}
                        onChange={(e) => setRow(s.id, { notPerformedReason: e.target.value as NotPerformedReason })}
                        className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                        dir="rtl"
                      >
                        <option value="">בחר סיבה...</option>
                        {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3"><ReadinessStatusBadge status={s.currentStatus} notPerformedReason={s.notPerformedReason} /></td>
                <td className="py-2.5 px-3">
                  <button
                    onClick={() => handleSaveRow(s.id)}
                    disabled={!isDirty(row) || row.pendingTestIds.size > 0}
                    className="flex items-center gap-1.5 bg-lime-700 hover:bg-lime-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {row.pendingTestIds.size > 0 ? <Loader2 size={12} className="animate-spin" /> : null}
                    שמור
                  </button>
                  {row.error && <p className="text-[10px] text-red-600 font-semibold mt-1">{row.error}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
