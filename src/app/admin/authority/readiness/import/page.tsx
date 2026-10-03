'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import BulkImportPasteStep from '@/features/admin/components/readiness-bulk-import/BulkImportPasteStep';
import BulkImportReviewStep, { type BulkImportReviewRow } from '@/features/admin/components/readiness-bulk-import/BulkImportReviewStep';
import BulkImportExtraFieldsModal from '@/features/admin/components/readiness-bulk-import/BulkImportExtraFieldsModal';
import { parseImportText } from '@/features/readiness/core/services/readiness-import-parse';
import type { RosterSoldierEntry, RosterUnitEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessGender } from '@/features/readiness/core/services/readiness-write.service';
import { Loader2, UploadCloud, ArrowRight } from 'lucide-react';

/** Mirrors BULK_IMPORT_MAX_ROWS in readiness-write.service.ts (David, 03.10.2026: dropped from 500 to 300 — Firestore's own WriteBatch caps at 500 operations, 300 leaves real margin). Not imported directly since that file is server-only ('server-only' guard via firebase-admin import chain) and this is a client component. */
const BULK_IMPORT_MAX_ROWS = 300;

/**
 * Bulk soldier-list import (Stage 5, 03.10.2026, 00-MASTER-PLAN.md
 * §13.75). Two steps side by side, not two screens (David's explicit
 * layout instruction) — the right-side paste box stays live the whole
 * time; "המשך לבדיקה" (re-)parses it into the left-side review table.
 * Nothing is written until the officer confirms the preview — the
 * actual POST happens once, atomically, via
 * /api/units/readiness/soldiers/bulk.
 */
export default function ReadinessBulkImportPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [units, setUnits] = useState<RosterUnitEntry[]>([]);
  const [soldiers, setSoldiers] = useState<RosterSoldierEntry[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  const [pasteText, setPasteText] = useState('');
  const [showExtraFields, setShowExtraFields] = useState(false);

  const [rows, setRows] = useState<BulkImportReviewRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const res = await fetch('/api/units/readiness/roster', { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);
    setUnits(body.units ?? []);
    setSoldiers(body.soldiers ?? []);
    setSelectedUnitId((prev) => prev || (body.units?.[0]?.id ?? ''));
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

  // Compares against the SELECTED unit's existing names only — "שם
  // שכבר קיים ברשימה" refers to the roster this import targets, not
  // the officer's whole command span.
  const existingNames = useMemo(() => {
    return new Set(soldiers.filter((s) => s.unitId === selectedUnitId).map((s) => s.name));
  }, [soldiers, selectedUnitId]);

  // Live preview as the officer types — parsed once per keystroke, not
  // 2-3x per render.
  const liveParse = useMemo(() => parseImportText(pasteText), [pasteText]);

  const handleParse = () => {
    setRows(
      liveParse.rows.map((r) => ({
        name: r.name,
        gender: null,
        isDuplicate: existingNames.has(r.name),
        // Default "add anyway" — a skip-by-default would silently
        // under-import a real person who happens to share a name with
        // someone already on the roster ("שני אנשים יכולים להיקרא אותו
        // דבר"); the officer actively opts OUT via "דלג" instead.
        duplicateChoice: 'add',
        extraFields: r.extraFields,
      })),
    );
    setSubmitError(null);
  };

  const handleGenderChange = (index: number, gender: ReadinessGender) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, gender } : r)));
  };

  const handleDuplicateChoiceChange = (index: number, choice: 'add' | 'skip') => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, duplicateChoice: choice } : r)));
  };

  const handleCancel = () => {
    router.push('/admin/authority/readiness');
  };

  const handleSubmit = async () => {
    if (rows.some((r) => r.gender === null)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');

      const toSubmit = rows
        .filter((r) => !(r.isDuplicate && r.duplicateChoice === 'skip'))
        .map((r) => ({ name: r.name, gender: r.gender }));

      const res = await fetch('/api/units/readiness/soldiers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ unitId: selectedUnitId, soldiers: toSubmit }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאת ייבוא (${res.status})`);

      router.push('/admin/authority/readiness');
    } catch (err: any) {
      setSubmitError(err?.message ?? 'שגיאה בייבוא. שום חייל לא נוסף.');
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
        { label: 'ייבוא רשימת חיילים' },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-lime-50 rounded-2xl flex items-center justify-center">
            <UploadCloud size={24} className="text-lime-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">ייבוא רשימת חיילים</h1>
            <p className="text-sm text-gray-500">שם ומגדר בלבד · ללא מספר אישי, ת&quot;ז, טלפון או גיל</p>
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-2">
            <label className="text-xs font-bold text-gray-600">יחידה:</label>
            {units.length > 1 ? (
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-white"
                dir="rtl"
              >
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <span className="text-sm font-bold text-gray-800">{units[0]?.name ?? '—'}</span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_2fr] gap-4 items-stretch">
            <BulkImportPasteStep
              text={pasteText}
              onTextChange={setPasteText}
              rowCount={liveParse.rows.length}
              maxRows={BULK_IMPORT_MAX_ROWS}
              rowsWithExtraFields={liveParse.rowsWithExtraFields}
              onShowExtraFields={() => setShowExtraFields(true)}
              onContinue={handleParse}
            />
            <BulkImportReviewStep
              rows={rows}
              onGenderChange={handleGenderChange}
              onDuplicateChoiceChange={handleDuplicateChoiceChange}
              onCancel={handleCancel}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          </div>
        </>
      )}

      <BulkImportExtraFieldsModal isOpen={showExtraFields} onClose={() => setShowExtraFields(false)} rows={liveParse.rows} />
    </div>
  );
}
