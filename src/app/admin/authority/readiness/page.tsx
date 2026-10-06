'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import PendingLinkSection from '@/features/admin/components/readiness-roster/PendingLinkSection';
import SoldiersRosterTable from '@/features/admin/components/readiness-roster/SoldiersRosterTable';
import AddSoldierModal from '@/features/admin/components/readiness-roster/AddSoldierModal';
import LinkExistingSoldierModal from '@/features/admin/components/readiness-roster/LinkExistingSoldierModal';
import type {
  RosterSoldierEntry,
  RosterPendingEntry,
  RosterUnitEntry,
} from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessMatchSuggestionsBody } from '@/features/readiness/core/services/readiness-match.service';
import DeclaredNotInRosterSection from '@/features/admin/components/readiness-roster/DeclaredNotInRosterSection';
import Link from 'next/link';
import SearchableSelect from '@/features/admin/components/SearchableSelect';
import { useMilitaryTenantSelection } from '@/features/admin/hooks/useMilitaryTenantSelection';
import { Loader2, ShieldCheck, AlertCircle, ClipboardList, LayoutDashboard, UploadCloud, Building2 } from 'lucide-react';

/**
 * Round 1 of the "unit soldiers" screen (02.10.2026, locked spec). ONE
 * list — soldiers.length always reflects every readiness_soldiers record
 * in the officer's full command span (no per-unit navigation, David's
 * explicit confirmation). No results-entry UI here — that's a later
 * round; this screen only creates/links/unlinks soldier records.
 */
export default function ReadinessPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  // 06.10.2026 — root/chief-officer have no own brigade; every tenant_owner/
  // unit_admin never sees selection.needsSelection===true, so their own
  // path below is byte-for-byte what it was before this hook existed.
  const selection = useMilitaryTenantSelection();

  const [soldiers, setSoldiers] = useState<RosterSoldierEntry[]>([]);
  const [pending, setPending] = useState<RosterPendingEntry[]>([]);
  const [units, setUnits] = useState<RosterUnitEntry[]>([]);
  const [unapprovedPendingCount, setUnapprovedPendingCount] = useState(0);
  // §13.84 — match suggestions are a separate, additional fetch
  // (computeReadinessMatchSuggestions), never folded into the roster
  // endpoint above — a failure here degrades to "no suggestions shown"
  // (every row just falls back to מחובר/לא מחובר), never blocks loading
  // the roster itself.
  const [matchData, setMatchData] = useState<ReadinessMatchSuggestionsBody>({ suggestions: [], ambiguities: [], declaredNotInRoster: [] });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ uid: string; name: string; gender: 'male' | 'female' | null } | undefined>(undefined);
  const [linkTarget, setLinkTarget] = useState<RosterPendingEntry | null>(null);

  const loadRoster = useCallback(async (tenantId: string | null) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const res = await fetch(`/api/units/readiness/roster${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);
    setSoldiers(body.soldiers ?? []);
    setPending(body.pending ?? []);
    setUnits(body.units ?? []);
    setUnapprovedPendingCount(body.unapprovedPendingCount ?? 0);

    try {
      const matchQs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
      const matchRes = await fetch(`/api/units/readiness/match-suggestions${matchQs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const matchBody = await matchRes.json().catch(() => ({}));
      if (matchRes.ok) {
        setMatchData({
          suggestions: matchBody.suggestions ?? [],
          ambiguities: matchBody.ambiguities ?? [],
          declaredNotInRoster: matchBody.declaredNotInRoster ?? [],
        });
      }
    } catch {
      // Degrades silently to "no suggestions" — the roster itself already loaded successfully above.
    }
  }, []);

  // Ready to fetch once role resolution is done AND (this caller has its
  // own tenant OR has explicitly picked one). A tenant_owner/unit_admin
  // is ready the instant role resolution finishes, same as always.
  const ready = !selection.roleLoading && (!selection.needsSelection || !!selection.tenantId);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    loadRoster(selection.needsSelection ? selection.tenantId : null)
      .then(() => { if (!cancelled) setLoadError(null); })
      .catch((err) => {
        console.error('[Readiness] load error:', err);
        if (!cancelled) setLoadError(err?.message ?? 'שגיאה בטעינת נתוני היחידה.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, selection.needsSelection, selection.tenantId, retrySeq, loadRoster]);

  const refresh = useCallback(() => {
    loadRoster(selection.needsSelection ? selection.tenantId : null).catch((err) => console.error('[Readiness] refresh error:', err));
  }, [loadRoster, selection.needsSelection, selection.tenantId]);

  if (selection.roleLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // 06.10.2026 — root/chief-officer with no brigade picked yet: a Hebrew
  // empty state pointing at the overview list, never the raw "tenantId is
  // required" server error. A real tenant_owner/unit_admin never reaches
  // this branch (selection.needsSelection is false for them).
  if (selection.needsSelection && !selection.tenantId) {
    return (
      <div dir="rtl" className="max-w-4xl mx-auto px-4 pt-6 space-y-4">
        <AdminBreadcrumb items={[
          { label: 'ארגונים', href: '/admin/organizations' },
          { label: 'מד כשירות' },
        ]} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center space-y-3">
          <Building2 size={40} className="mx-auto text-slate-300" />
          <p className="text-lg font-bold text-gray-900">בחר חטיבה להצגה</p>
          <p className="text-sm text-gray-500">כדי לצפות בחיילי היחידה, בחר חטיבה מתוך רשימת כל החטיבות.</p>
          <Link
            href="/admin/authority/readiness/vertical-overview"
            className="inline-flex items-center gap-2 bg-lime-700 hover:bg-lime-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            לרשימת כל החטיבות
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-4xl mx-auto">
      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        { label: 'מד כשירות' },
      ]} />

      {/* 06.10.2026 — root/chief-officer only; reuses the SAME
          SearchableSelect component the units ("team") screen's own
          super-admin switcher already uses, never a new control. A real
          tenant_owner/unit_admin never sees this (selection.needsSelection
          is false for them) — zero diff to their screen. */}
      {selection.needsSelection && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <Building2 size={20} className="text-lime-700 flex-shrink-0" />
          <div className="flex-1" style={{ position: 'relative', zIndex: 20 }}>
            <label className="text-xs font-bold text-slate-500 block mb-1">חטיבה</label>
            <SearchableSelect
              options={selection.options.map((o) => ({ id: o.id, label: o.name }))}
              value={selection.tenantId ?? ''}
              onChange={(newId) => { if (newId) selection.selectTenant(newId); }}
              placeholder="בחר חטיבה..."
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-lime-50 rounded-2xl flex items-center justify-center">
            <ShieldCheck size={24} className="text-lime-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">חיילי היחידה</h1>
            <p className="text-sm text-gray-500">רשימת חיילים, שיוך לחשבונות ומעקב סטטוס כשירות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <LayoutDashboard size={16} /> לוח כשירות
          </Link>
          <Link
            href="/admin/authority/readiness/import"
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <UploadCloud size={16} /> ייבוא רשימה
          </Link>
          <Link
            href="/admin/authority/readiness/entry"
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all bg-lime-700 hover:bg-lime-800"
          >
            <ClipboardList size={16} /> רישום תוצאות בוחן
          </Link>
        </div>
      </div>

      {loadError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 font-semibold">{loadError}</p>
          <button
            onClick={() => { setLoading(true); setRetrySeq((s) => s + 1); }}
            className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
          >
            נסה שוב
          </button>
        </div>
      )}

      {!loadError && unapprovedPendingCount > 0 && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="flex-shrink-0" />
            {unapprovedPendingCount === 1
              ? 'יש הצהרה אחת הממתינה לאישור קצין — היא תופיע כאן לשיוך רק לאחר האישור.'
              : `יש ${unapprovedPendingCount} הצהרות הממתינות לאישור קצין — הן יופיעו כאן לשיוך רק לאחר האישור.`}
          </p>
          <Link
            href="/admin/authority/units"
            className="text-xs font-bold text-amber-800 bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors flex-shrink-0"
          >
            לאישור הצהרות
          </Link>
        </div>
      )}

      {!loadError && (
        <>
          <PendingLinkSection
            pending={pending}
            onLinkExisting={(entry) => setLinkTarget(entry)}
            onOpenNew={(entry) => {
              setAddPrefill({ uid: entry.uid, name: entry.name, gender: entry.gender });
              setShowAddModal(true);
            }}
          />

          <SoldiersRosterTable
            soldiers={soldiers}
            suggestions={matchData.suggestions}
            ambiguities={matchData.ambiguities}
            onAddSoldier={() => { setAddPrefill(undefined); setShowAddModal(true); }}
            onUnlinked={refresh}
            onMatchResolved={refresh}
          />

          <DeclaredNotInRosterSection entries={matchData.declaredNotInRoster} />
        </>
      )}

      <AddSoldierModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        units={units}
        prefill={addPrefill}
        onSuccess={() => { setShowAddModal(false); setAddPrefill(undefined); refresh(); }}
      />

      {linkTarget && (
        <LinkExistingSoldierModal
          isOpen={true}
          onClose={() => setLinkTarget(null)}
          pendingUid={linkTarget.uid}
          pendingName={linkTarget.name}
          unlinkedSoldiers={soldiers.filter((s) => !s.uid)}
          onSuccess={() => { setLinkTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}
