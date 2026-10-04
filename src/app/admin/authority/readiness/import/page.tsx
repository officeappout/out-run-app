'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import BulkResultsInputStep from '@/features/admin/components/readiness-bulk-import/BulkResultsInputStep';
import BulkResultsReviewStep, { type BulkResultsReviewRow, type PreviewTestStatus } from '@/features/admin/components/readiness-bulk-import/BulkResultsReviewStep';
import {
  parseResultsGrid, matchRowToRoster,
  type CellValue, type ParsedResultsRow,
} from '@/features/readiness/core/services/readiness-results-import-parse';
import type { RosterSoldierEntry, RosterUnitEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessThresholdsConfig } from '@/features/readiness/core/services/readiness-write.service';
import { Loader2, UploadCloud, ArrowRight } from 'lucide-react';

/** Mirrors BULK_RESULTS_IMPORT_MAX_ROWS in readiness-write.service.ts —
 *  NOT the older BULK_IMPORT_MAX_ROWS (300), which this screen no
 *  longer calls into. Lower because a results row can need up to 4
 *  Firestore operations (1 soldier-create + up to 3 result-creates),
 *  not 1 — see that constant's own doc comment for the full margin-vs-
 *  500-cap reasoning. Not imported directly since that file is
 *  server-only ('server-only' guard via firebase-admin import chain)
 *  and this is a client component. */
const BULK_RESULTS_IMPORT_MAX_ROWS = 100;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function previewStatus(value: number | null, test: ReadinessThresholdsConfig['tests'][number] | undefined, gender: 'male' | 'female' | null): PreviewTestStatus {
  if (value === null || !test || !gender) return 'not_yet_tested';
  const threshold = test.threshold[gender];
  const pass = test.lowerIsBetter ? value <= threshold : value >= threshold;
  return pass ? 'pass' : 'fail';
}

/** Same reduceOverallStatus priority (fail > pass-if-all > not_yet_tested)
 *  as readiness-read.service.ts's own (server-only) function — this is
 *  a small, deliberate, PREVIEW-ONLY duplicate for a client component,
 *  not an import of that file. The server computes the authoritative
 *  outcome at write time regardless of what this shows. */
function overallPreviewLabel(statuses: PreviewTestStatus[]): 'כשיר' | 'לא כשיר' | 'חלקי' | 'טרם נבדק' {
  if (statuses.includes('fail')) return 'לא כשיר';
  if (statuses.every((s) => s === 'pass')) return 'כשיר';
  const measured = statuses.filter((s) => s !== 'not_yet_tested').length;
  return measured === 0 ? 'טרם נבדק' : 'חלקי';
}

/**
 * Results bulk-import — paste or file upload, two explicit modes
 * (04.10.2026, 00-MASTER-PLAN.md §13.83). Supersedes the previous
 * names-only flow on this same route: 'new_roster' mode with every
 * result column empty is exactly that old behavior, just reached
 * through the same unified screen instead of a separate one. Two
 * steps side by side, not two screens (same layout precedent as the
 * names-only build) — the right-side input stays live; "המשך לבדיקה"
 * (re-)parses it into the left-side review table. Nothing is written
 * until the officer confirms the preview — the actual POST happens
 * once, atomically, via /api/units/readiness/results/bulk-import.
 */
export default function ReadinessBulkImportPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [units, setUnits] = useState<RosterUnitEntry[]>([]);
  const [soldiers, setSoldiers] = useState<RosterSoldierEntry[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [thresholdsConfig, setThresholdsConfig] = useState<ReadinessThresholdsConfig | null>(null);

  const [mode, setMode] = useState<'new_roster' | 'existing_roster'>('new_roster');
  const [defaultTestDate, setDefaultTestDate] = useState<string>(todayIsoDate());
  const [grid, setGrid] = useState<CellValue[][]>([]);

  const [reviewRows, setReviewRows] = useState<BulkResultsReviewRow[]>([]);
  /** 04.10.2026 (§13.87) — ONE choice for the whole paste; reset whenever mode changes (same reset handleModeChange already does for reviewRows). */
  const [conflictMode, setConflictMode] = useState<'new_test' | 'correction' | ''>('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const [rosterRes, thresholdsRes] = await Promise.all([
      fetch('/api/units/readiness/roster', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/units/readiness/thresholds', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const rosterBody = await rosterRes.json().catch(() => ({}));
    if (!rosterRes.ok) throw new Error(typeof rosterBody.error === 'string' ? rosterBody.error : `שגיאה בטעינה (${rosterRes.status})`);
    setUnits(rosterBody.units ?? []);
    setSoldiers(rosterBody.soldiers ?? []);
    setSelectedUnitId((prev) => prev || (rosterBody.units?.[0]?.id ?? ''));

    const thresholdsBody = await thresholdsRes.json().catch(() => ({}));
    if (thresholdsRes.ok) setThresholdsConfig(thresholdsBody.config ?? null);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        await load();
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message ?? 'שגיאה בטעינת היחידות.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [load]);

  const existingUnitRoster = useMemo(
    () => soldiers.filter((s) => s.unitId === selectedUnitId),
    [soldiers, selectedUnitId],
  );
  const existingNames = useMemo(() => new Set(existingUnitRoster.map((s) => s.name)), [existingUnitRoster]);

  const liveParse = useMemo(() => parseResultsGrid(grid), [grid]);

  const testById = useMemo(() => {
    const map = new Map<string, ReadinessThresholdsConfig['tests'][number]>();
    (thresholdsConfig?.tests ?? []).forEach((t) => map.set(t.id, t));
    return map;
  }, [thresholdsConfig]);

  const buildReviewRow = useCallback((parsed: ParsedResultsRow, seenWithinPaste: Set<string>): BulkResultsReviewRow => {
    const isDuplicateWithinPaste = parsed.name !== null && seenWithinPaste.has(parsed.name);
    if (parsed.name !== null) seenWithinPaste.add(parsed.name);
    const isDuplicateVsRoster = parsed.name !== null && mode === 'new_roster' && existingNames.has(parsed.name);

    const rosterMatch = mode === 'existing_roster' && parsed.name !== null
      ? matchRowToRoster(parsed.name, existingUnitRoster)
      : null;
    const matchedSoldier = rosterMatch?.kind === 'matched' ? existingUnitRoster.find((s) => s.id === rosterMatch.soldierId) : null;
    const effectiveGender = mode === 'new_roster' ? parsed.gender : (matchedSoldier?.gender ?? null);

    const runStatus = previewStatus(parsed.runSeconds, testById.get('run_3000m'), effectiveGender);
    const pullupsStatus = previewStatus(parsed.pullupsReps, testById.get('pullups'), effectiveGender);
    const dipsStatus = previewStatus(parsed.dipsReps, testById.get('dips'), effectiveGender);

    // §13.87 "תיקון מוצהר" — 'existing_roster' only (a 'new_roster' soldier
    // is brand new, can't already have a result). testDetails is already
    // fetched as part of the roster load — no extra request.
    const conflictsWithExisting = mode === 'existing_roster' && matchedSoldier
      ? [
          { present: parsed.runSeconds !== null, testId: 'run_3000m' },
          { present: parsed.pullupsReps !== null, testId: 'pullups' },
          { present: parsed.dipsReps !== null, testId: 'dips' },
        ].some(({ present, testId }) => present && matchedSoldier.testDetails.find((t) => t.testId === testId)?.status !== 'not_yet_tested')
      : false;

    return {
      parsed,
      isDuplicateVsRoster,
      isDuplicateWithinPaste,
      duplicateChoice: 'skip',
      rosterMatch,
      chosenSoldierId: rosterMatch?.kind === 'matched' ? rosterMatch.soldierId : null,
      runStatus,
      pullupsStatus,
      dipsStatus,
      overallLabel: overallPreviewLabel([runStatus, pullupsStatus, dipsStatus]),
      conflictsWithExisting,
    };
  }, [mode, existingNames, existingUnitRoster, testById]);

  const handleContinue = () => {
    const seenWithinPaste = new Set<string>();
    setReviewRows(liveParse.rows.map((r) => buildReviewRow(r, seenWithinPaste)));
    setSubmitError(null);
    setConflictMode('');
  };

  const handleDuplicateChoiceChange = (index: number, choice: 'add' | 'skip') => {
    setReviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, duplicateChoice: choice } : r)));
  };

  const handleSoldierPick = (index: number, soldierId: string) => {
    setReviewRows((prev) => prev.map((r, i) => {
      if (i !== index) return r;
      // §13.87 — an ambiguous row's conflict check couldn't know the
      // matched soldier at buildReviewRow time (nothing was chosen
      // yet); recompute it now that one has been.
      const picked = soldierId ? soldiers.find((s) => s.id === soldierId) : null;
      const conflictsWithExisting = picked
        ? [
            { present: r.parsed.runSeconds !== null, testId: 'run_3000m' },
            { present: r.parsed.pullupsReps !== null, testId: 'pullups' },
            { present: r.parsed.dipsReps !== null, testId: 'dips' },
          ].some(({ present, testId }) => present && picked.testDetails.find((t) => t.testId === testId)?.status !== 'not_yet_tested')
        : false;
      return { ...r, chosenSoldierId: soldierId || null, conflictsWithExisting };
    }));
  };

  const handleModeChange = (next: 'new_roster' | 'existing_roster') => {
    setMode(next);
    setReviewRows([]);
    setConflictMode('');
  };

  const handleCancel = () => {
    router.push('/admin/authority/readiness');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');

      const included = reviewRows.filter((r) => {
        const hasError = !!(r.parsed.genderError && mode === 'new_roster') || !!r.parsed.runError || !!r.parsed.pullupsError || !!r.parsed.dipsError || !!r.parsed.dateError;
        if (hasError) return false;
        if (mode === 'new_roster') return !((r.isDuplicateVsRoster || r.isDuplicateWithinPaste) && r.duplicateChoice === 'skip');
        if (!r.rosterMatch) return false;
        if (r.rosterMatch.kind === 'not_found') return false;
        if (r.rosterMatch.kind === 'ambiguous' && !r.chosenSoldierId) return false;
        return true;
      });

      const rows = included.map((r) => ({
        ...(mode === 'new_roster' ? { name: r.parsed.name, gender: r.parsed.gender } : { soldierId: r.chosenSoldierId }),
        testDate: r.parsed.dateOverrideIso ?? undefined,
        runSeconds: r.parsed.runSeconds,
        pullupsReps: r.parsed.pullupsReps,
        dipsReps: r.parsed.dipsReps,
      }));

      const res = await fetch('/api/units/readiness/results/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          unitId: selectedUnitId,
          mode,
          defaultTestDate: new Date(defaultTestDate).toISOString(),
          rows,
          ...(conflictMode ? { conflictMode } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאת ייבוא (${res.status})`);

      router.push('/admin/authority/readiness');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'שגיאה בייבוא. שום דבר לא נשמר.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-6xl mx-auto">
      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        { label: 'מד כשירות', href: '/admin/authority/readiness' },
        { label: 'ייבוא תוצאות' },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-lime-50 rounded-2xl flex items-center justify-center">
            <UploadCloud size={24} className="text-lime-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">ייבוא תוצאות בוחן</h1>
            <p className="text-sm text-gray-500">שם, מגדר ותוצאות · ללא מספר אישי, ת&quot;ז, טלפון או גיל</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/admin/authority/readiness')}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
        >
          <ArrowRight size={14} /> חזרה לרשימת החיילים
        </button>
      </div>

      {loadError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold">{loadError}</p>
        </div>
      )}

      {!loadError && units.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-lg font-bold text-gray-900">אין יחידה זמינה לייבוא</p>
        </div>
      )}

      {!loadError && units.length > 0 && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">יחידה:</label>
              {units.length > 1 ? (
                <select
                  value={selectedUnitId}
                  onChange={(e) => { setSelectedUnitId(e.target.value); setReviewRows([]); }}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-white"
                  dir="rtl"
                >
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <span className="text-sm font-bold text-gray-800">{units[0]?.name ?? '—'}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">מצב:</label>
              <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                <button
                  onClick={() => handleModeChange('new_roster')}
                  className={`text-xs font-bold px-3 py-1.5 transition-colors ${mode === 'new_roster' ? 'bg-lime-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  רשימה חדשה
                </button>
                <button
                  onClick={() => handleModeChange('existing_roster')}
                  className={`text-xs font-bold px-3 py-1.5 border-r border-gray-200 transition-colors ${mode === 'existing_roster' ? 'bg-lime-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  תוצאות לרשימה קיימת
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">תאריך הבוחן:</label>
              <input
                type="date"
                value={defaultTestDate}
                onChange={(e) => setDefaultTestDate(e.target.value)}
                max={todayIsoDate()}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              />
            </div>
          </div>

          {mode === 'existing_roster' && (
            <p className="text-[11px] text-slate-400 px-1">
              מצב זה לא יוצר חיילים חדשים לעולם — שם שלא נמצא ברשימת היחידה יסומן ולא יישמר.
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_2fr] gap-4 items-stretch">
            <div className="flex flex-col gap-3">
              <BulkResultsInputStep
                onGridChange={setGrid}
                rowCount={liveParse.rows.length}
                maxRows={BULK_RESULTS_IMPORT_MAX_ROWS}
              />
              <button
                onClick={handleContinue}
                disabled={liveParse.rows.length === 0 || liveParse.rows.length > BULK_RESULTS_IMPORT_MAX_ROWS}
                className="w-full bg-lime-700 hover:bg-lime-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 rounded-xl transition-all"
              >
                המשך לבדיקה
              </button>
            </div>
            <BulkResultsReviewStep
              mode={mode}
              rows={reviewRows}
              onDuplicateChoiceChange={handleDuplicateChoiceChange}
              onSoldierPick={handleSoldierPick}
              onCancel={handleCancel}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
              conflictMode={conflictMode}
              onConflictModeChange={setConflictMode}
            />
          </div>
        </>
      )}
    </div>
  );
}
