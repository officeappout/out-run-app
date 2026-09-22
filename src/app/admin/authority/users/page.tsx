'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  Users, Loader2, AlertCircle, Shield, ShieldCheck, Info,
} from 'lucide-react';

interface CitySummary {
  authorityId: string;
  authorityName: string;
  totalUsers: number;
  approvedUsers: number;
}

// ── Page ──────────────────────────────────────────────────────────────
//
// Per SPEC-PERMISSIONS-MODEL.md §5 ("מנהל בריאות רשותי... לא — מצטברים
// בלבד") an authority manager gets aggregate counts for his own city, never
// individual resident documents. This page used to run a client-side
// getDocs(query(users, where('core.authorityId','==',aId))) — that's the
// exact shape §5.1 forbids (a resident's name/gender/birthDate reaching the
// browser even if the UI only renders a first name), and it's also denied
// outright by firestore.rules for a real-shape manager (no managerIds-based
// read path on users/{userId} — see the 22.09.2026 full-tour audit). Fixed
// by calling GET /api/authority-manager/city-summary instead, which returns
// COUNT-aggregate numbers only — no per-resident data exists to render, so
// there is no roster/leaderboard table on this page anymore.

export default function AuthorityUsersPage() {
  const [summary, setSummary] = useState<CitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/authority-manager/city-summary', {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (res.status === 403) {
          setError('החשבון הזה אינו מוגדר כמנהל רשות עבור אף עיר.');
          return;
        }
        if (res.status === 401) {
          setError('יש להתחבר מחדש.');
          return;
        }
        if (!res.ok) {
          setError('לא ניתן לטעון את נתוני העיר כרגע. נסה שוב מאוחר יותר.');
          return;
        }

        const data = (await res.json()) as CitySummary;
        setSummary(data);
      } catch (err) {
        console.error('[AuthorityUsersPage] failed to load city summary:', err);
        setError('לא ניתן לטעון את נתוני העיר כרגע. נסה שוב מאוחר יותר.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Loading / Error ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="animate-spin text-cyan-500" size={28} />
        <span className="text-slate-600">טוען נתוני משתמשים...</span>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error || 'לא ניתן לטעון את נתוני העיר כרגע.'}</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6" dir="rtl">

      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users size={24} className="text-cyan-600" />
            תושבים רשומים
          </h1>
          {summary.authorityName && (
            <div className="flex items-center gap-2 mt-1">
              <Shield size={14} className="text-cyan-500" />
              <span className="text-sm text-slate-500 font-bold">{summary.authorityName}</span>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                תצוגה מוגנת פרטיות
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Stats Row — aggregate-only, from /api/authority-manager/city-summary ═══ */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Users} label="סה״כ רשומים" value={summary.totalUsers} color="cyan" />
        <StatCard icon={ShieldCheck} label="מאושרים" value={summary.approvedUsers} color="green" />
      </div>

      {/* ═══ Explanation instead of a per-resident roster ═══ */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-start gap-3" dir="rtl">
        <Info size={20} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600 leading-relaxed">
          פירוט תושבים בודדים — שם, גיל, מגדר או פעילות אישית — אינו מוצג בתצוגת מנהל רשות,
          בהתאם למדיניות הפרטיות (ראו מפרט ההרשאות §5). המסך מציג נתונים מצטברים בלבד עבור העיר שלך.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'from-cyan-50 to-cyan-100/50 border-cyan-200 text-cyan-700',
    green: 'from-green-50 to-green-100/50 border-green-200 text-green-700',
  };
  const iconColorMap: Record<string, string> = {
    cyan: 'text-cyan-500', green: 'text-green-500',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center ${iconColorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black">{value}</p>
      </div>
    </div>
  );
}
