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
import Link from 'next/link';
import { Loader2, ShieldCheck, AlertCircle, ClipboardList, LayoutDashboard } from 'lucide-react';

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

  const [soldiers, setSoldiers] = useState<RosterSoldierEntry[]>([]);
  const [pending, setPending] = useState<RosterPendingEntry[]>([]);
  const [units, setUnits] = useState<RosterUnitEntry[]>([]);
  const [unapprovedPendingCount, setUnapprovedPendingCount] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ uid: string; name: string; gender: 'male' | 'female' | null } | undefined>(undefined);
  const [linkTarget, setLinkTarget] = useState<RosterPendingEntry | null>(null);

  const loadRoster = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const res = await fetch('/api/units/readiness/roster', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);
    setSoldiers(body.soldiers ?? []);
    setPending(body.pending ?? []);
    setUnits(body.units ?? []);
    setUnapprovedPendingCount(body.unapprovedPendingCount ?? 0);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        await loadRoster();
        setLoadError(null);
      } catch (err: any) {
        console.error('[Readiness] load error:', err);
        setLoadError(err?.message ?? 'שגיאה בטעינת נתוני היחידה.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [retrySeq, loadRoster]);

  const refresh = useCallback(() => {
    loadRoster().catch((err) => console.error('[Readiness] refresh error:', err));
  }, [loadRoster]);

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
            onAddSoldier={() => { setAddPrefill(undefined); setShowAddModal(true); }}
            onUnlinked={refresh}
          />
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
