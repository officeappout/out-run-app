'use client';

import { useState, useMemo } from 'react';
import { X, Search, Link2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterSoldierEntry } from '@/features/readiness/core/services/readiness-read.service';
import ReadinessStatusBadge from './ReadinessStatusBadge';

/**
 * "שייך לרשומה קיימת" — locked spec, verbatim: alphabetical list with
 * search, NO "likely match" highlighting, NO similarity ranking, NO
 * sort-by-closeness. A plain substring filter over an already-alphabetized
 * list is the entire filtering logic — do not add scoring. Every row
 * shows the record's own name AND its last result, since that's what
 * distinguishes two people sharing a name.
 */

interface LinkExistingSoldierModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingUid: string;
  pendingName: string;
  /** Pre-filtered by the caller to unlinked soldiers (uid === null) only. */
  unlinkedSoldiers: RosterSoldierEntry[];
  onSuccess: () => void;
}

export default function LinkExistingSoldierModal({
  isOpen,
  onClose,
  pendingUid,
  pendingName,
  unlinkedSoldiers,
  onSuccess,
}: LinkExistingSoldierModalProps) {
  const [search, setSearch] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim();
    const base = q ? unlinkedSoldiers.filter((s) => s.name.includes(q)) : unlinkedSoldiers;
    // Already alphabetized by the server (computeUnitRoster) — re-sorted
    // here only as a defensive guarantee, same order either way.
    return [...base].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [search, unlinkedSoldiers]);

  if (!isOpen) return null;

  const handleLink = async (soldierId: string) => {
    setLinkingId(soldierId);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ soldierId, uid: pendingUid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה (${res.status})`);
      onSuccess();
    } catch (err: any) {
      console.error('[LinkExistingSoldierModal] link failed:', err);
      setError(err?.message ?? 'שגיאה בשיוך.');
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="flex items-start justify-center min-h-full py-6 px-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative max-h-[85vh] flex flex-col" dir="rtl">
          <button onClick={onClose} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
          <h3 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
            <Link2 size={22} className="text-lime-700" />
            שיוך לרשומה קיימת
          </h3>
          <p className="text-xs text-gray-500 mb-4">בחירת רשומה עבור {pendingName}.</p>

          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש לפי שם..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
              dir="rtl"
            />
          </div>

          {error && <p className="text-xs font-semibold text-red-600 mb-2">{error}</p>}

          <div className="overflow-y-auto flex-1 -mx-2 px-2">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">
                {search ? 'לא נמצאו תוצאות' : 'אין רשומות פנויות לשיוך'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={linkingId !== null}
                    onClick={() => handleLink(s.id)}
                    className="w-full flex items-center justify-between gap-3 bg-slate-50 hover:bg-cyan-50 rounded-xl px-3 py-2.5 text-right transition-colors disabled:opacity-50"
                  >
                    <span className="font-bold text-sm text-slate-800">{s.name}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <ReadinessStatusBadge status={s.currentStatus} />
                      {linkingId === s.id && <span className="text-[11px] text-slate-400">משייך...</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
