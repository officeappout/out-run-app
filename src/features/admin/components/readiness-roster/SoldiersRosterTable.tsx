'use client';

import { useState } from 'react';
import { Users, Plus, Unlink } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterSoldierEntry } from '@/features/readiness/core/services/readiness-read.service';
import ReadinessStatusBadge from './ReadinessStatusBadge';

const GENDER_LABEL: Record<'male' | 'female', string> = { male: 'זכר', female: 'נקבה' };

interface SoldiersRosterTableProps {
  soldiers: RosterSoldierEntry[];
  onAddSoldier: () => void;
  onUnlinked: () => void;
}

export default function SoldiersRosterTable({ soldiers, onAddSoldier, onUnlinked }: SoldiersRosterTableProps) {
  const [confirmUnlink, setConfirmUnlink] = useState<RosterSoldierEntry | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlink = async () => {
    if (!confirmUnlink) return;
    setUnlinking(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ soldierId: confirmUnlink.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה (${res.status})`);
      setConfirmUnlink(null);
      onUnlinked();
    } catch (err: any) {
      console.error('[SoldiersRosterTable] unlink failed:', err);
      setError(err?.message ?? 'שגיאה בביטול השיוך.');
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-black text-gray-900">רשימת חיילים ({soldiers.length})</h3>
        <button
          onClick={onAddSoldier}
          className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all bg-lime-700 hover:bg-lime-800"
        >
          <Plus size={16} /> הוסף חייל
        </button>
      </div>

      {soldiers.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex p-4 rounded-full mb-4 bg-lime-50">
            <Users size={32} className="text-lime-700" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">אין עדיין חיילים ביחידה</h3>
          <p className="text-gray-500 mt-2">התחל בהוספת חיילים</p>
          <button
            onClick={onAddSoldier}
            className="mt-4 inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-bold transition-all bg-lime-700 hover:bg-lime-800"
          >
            <Plus size={18} /><span>הוסף חייל</span>
          </button>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                <th className="text-right py-2 px-3 w-8">#</th>
                <th className="text-right py-2 px-3">שם</th>
                <th className="text-right py-2 px-3">מגדר</th>
                <th className="text-right py-2 px-3">מחובר לאפליקציה</th>
                <th className="text-right py-2 px-3">תוצאה אחרונה</th>
                <th className="text-right py-2 px-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {soldiers.map((s, i) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-100/50 transition-colors">
                  <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-800">{s.name}</td>
                  <td className="py-2.5 px-3 text-slate-600">{GENDER_LABEL[s.gender]}</td>
                  <td className="py-2.5 px-3 text-slate-600">{s.uid ? 'כן' : 'לא'}</td>
                  <td className="py-2.5 px-3"><ReadinessStatusBadge status={s.currentStatus} /></td>
                  <td className="py-2.5 px-3">
                    {s.uid && (
                      <button
                        onClick={() => { setConfirmUnlink(s); setError(null); }}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-100 transition-colors"
                      >
                        <Unlink size={11} /> בטל שיוך
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmUnlink && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !unlinking && setConfirmUnlink(null)}
        >
          <div dir="rtl" className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900">ביטול שיוך — {confirmUnlink.name}</h3>
            <p className="text-sm text-gray-600">
              החשבון יוסר מהרשומה. הרשומה ותוצאותיה הקיימות <span className="font-bold">לא יימחקו</span> — ניתן לשייך אליה חשבון מחדש בכל עת.
            </p>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmUnlink(null)}
                disabled={unlinking}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                {unlinking ? 'מבטל...' : 'בטל שיוך'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
