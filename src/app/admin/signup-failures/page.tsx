'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

interface SignupFailureRow {
  id: string;
  uid: string | null;
  stage: string | null;
  reason: string | null;
  timestampMs: number | null;
}

function formatTimestamp(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' });
}

/**
 * /admin/signup-failures — root-only. David, 24.09.2026: "זה לא מידע
 * שצריך להיות נגיש לאף אחד מלבדי". This page's own gate below is a UX
 * convenience only — the real boundary is GET /api/admin/signup-failures'
 * own isRootAdmin check, which this page's fetch will get a 403 from
 * regardless of anything client-side ("rules are not filters" applies to
 * UI gates the same way it applies to Firestore rules — see SPEC-
 * PERMISSIONS-MODEL.md §4).
 */
export default function SignupFailuresPage() {
  const [checking, setChecking] = useState(true);
  const [isRoot, setIsRoot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SignupFailureRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const role = await checkUserRole(user.uid);
        setIsRoot(role.isRootAdmin);
      } catch {
        setIsRoot(false);
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
      const res = await fetch('/api/admin/signup-failures', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { failures: SignupFailureRow[] };
      setRows(data.failures ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isRoot) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoot]);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isRoot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">המסך הזה זמין ל-root בלבד.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-slate-900">כשלי הרשמה — 100 האחרונים</h1>
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
        <p className="text-sm text-slate-400 text-center py-16">אין כשלים רשומים.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-bold">זמן</th>
                <th className="px-3 py-2 text-right font-bold">שלב</th>
                <th className="px-3 py-2 text-right font-bold">סיבה</th>
                <th className="px-3 py-2 text-right font-bold">uid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatTimestamp(row.timestampMs)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.stage ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.reason ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.uid ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
