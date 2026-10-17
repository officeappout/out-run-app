'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { AGE_BRACKET_LABELS_HE, type AgeBracket } from '@/features/user/onboarding/utils/goal-note';

interface GoalNoteRow {
  key: string;
  note: string;
  at: string | null;
  goal: 'health' | 'body_focus' | 'skills' | null;
  ageBracket: AgeBracket | null;
  gender: 'male' | 'female' | 'other' | null;
}

const GOAL_LABELS: Record<NonNullable<GoalNoteRow['goal']>, string> = {
  health: 'להרגיש טוב וחזק',
  body_focus: 'לחטב ולבנות שריר',
  skills: 'קליסטניקס',
};
const GENDER_LABELS: Record<NonNullable<GoalNoteRow['gender']>, string> = {
  male: 'גבר',
  female: 'אישה',
  other: 'אחר',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * /admin/goal-notes — read-only list of what users wrote in the onboarding
 * goal picker's optional "יש עוד משהו שחשוב לך?" field. Super admin only:
 * this gate is UX; the real boundary is GET /api/admin/goal-notes'
 * requireSuperAdminApi.
 */
export default function GoalNotesPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GoalNoteRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const role = await checkUserRole(user.uid);
        setAllowed(role.isSuperAdmin);
      } catch {
        setAllowed(false);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/goal-notes', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { notes: GoalNoteRow[] };
      setRows(data.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">המסך הזה זמין לסופר-אדמין בלבד.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">מה עוד חשוב למשתמשים</h1>
          <p className="text-sm text-slate-500">מה שנכתב בשדה ״יש עוד משהו שחשוב לך?״ בבחירת המטרה באונבורדינג</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          רענן
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">עוד אין הערות.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-bold">תאריך</th>
                <th className="px-3 py-2 text-right font-bold">מגדר</th>
                <th className="px-3 py-2 text-right font-bold">גיל</th>
                <th className="px-3 py-2 text-right font-bold">מטרה</th>
                <th className="px-3 py-2 text-right font-bold">מה נכתב</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key} className="align-top">
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDate(row.at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.gender ? GENDER_LABELS[row.gender] : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.ageBracket ? AGE_BRACKET_LABELS_HE[row.ageBracket] : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.goal ? GOAL_LABELS[row.goal] : '—'}</td>
                  <td className="px-3 py-2 text-slate-800 whitespace-pre-wrap break-words">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
