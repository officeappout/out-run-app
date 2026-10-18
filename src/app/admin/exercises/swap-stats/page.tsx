'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/exercises/swap-stats — "תרגילים שמחליפים הכי הרבה" (soft-adaptation
 * Phase 0, 18.10.2026). Reads ONLY exercise_stats — anonymous per-exercise
 * counters kept by the onExerciseSwapCreated / onWorkoutCreateExerciseStats
 * Cloud Functions (no uid anywhere). Read-only; changes nothing in the app.
 *
 * The page gate below is UX only — the real boundary is firestore.rules
 * (exercise_stats: read isAdmin(), write never from a client).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  AUTO_LABEL_TEXT,
  MIN_SAMPLE,
  buildSwapStatsTables,
  type ExerciseStatsDoc,
  type SwapStatsRow,
} from '@/features/admin/services/exercise-swap-stats.utils';
import { ArrowRight, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

const LOCATION_LABELS: Record<string, string> = {
  park: 'פארק',
  home: 'בית',
  gym: 'חדר כושר',
  street: 'רחוב',
  office: 'משרד',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

function DirectionSplit({ d }: { d: SwapStatsRow['direction'] }) {
  return (
    <span className="whitespace-nowrap font-mono text-xs">
      <span className="text-orange-600" title="לרמה נמוכה יותר">↓{d.lower}</span>{' '}
      <span className="text-sky-600" title="לאותה רמה">={d.same}</span>{' '}
      <span className="text-emerald-600" title="לרמה גבוהה יותר">↑{d.higher}</span>
    </span>
  );
}

function SwapTable({ rows, showRank }: { rows: SwapStatsRow[]; showRank: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-10">אין נתונים עדיין.</p>;
  }
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            {showRank && <th className="px-3 py-2 text-right font-bold">#</th>}
            <th className="px-3 py-2 text-right font-bold">תרגיל</th>
            <th className="px-3 py-2 text-right font-bold">רמה</th>
            <th className="px-3 py-2 text-right font-bold" title="הושלם כפי שנרשם (לא כתחליף)">הושלם</th>
            <th className="px-3 py-2 text-right font-bold">הוחלף</th>
            <th className="px-3 py-2 text-right font-bold" title="הוחלף ÷ (הוחלף + הושלם). בסוגריים: גבול תחתון (Wilson 95%) — לפיו הדירוג">שיעור החלפה</th>
            <th className="px-3 py-2 text-right font-bold">כיוון</th>
            <th className="px-3 py-2 text-right font-bold">הוחלף ב־</th>
            <th className="px-3 py-2 text-right font-bold">סיבות</th>
            <th className="px-3 py-2 text-right font-bold">מיקום</th>
            <th className="px-3 py-2 text-right font-bold">תיוג אוטומטי</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.id} className="align-top">
              {showRank && <td className="px-3 py-2 text-slate-400">{i + 1}</td>}
              <td className="px-3 py-2">
                <Link href={`/admin/exercises/${r.id}`} className="font-bold text-slate-800 hover:text-cyan-600">
                  {r.name}
                </Link>
                {r.domain && <div className="text-[11px] text-slate-400">{r.domain}</div>}
              </td>
              <td className="px-3 py-2 text-slate-600">{r.level ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{r.prescribedCompleted}</td>
              <td className="px-3 py-2 font-bold text-slate-800">{r.swappedAway}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {pct(r.swapRate)} <span className="text-[11px] text-slate-400">({pct(r.wilsonLower)})</span>
              </td>
              <td className="px-3 py-2"><DirectionSplit d={r.direction} /></td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {r.topReplacements.length === 0
                  ? '—'
                  : r.topReplacements.map((t) => (
                      <div key={t.id}>{t.name} <span className="text-slate-400">×{t.count}</span></div>
                    ))}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {r.topReasons.length === 0
                  ? '—'
                  : r.topReasons.map((t) => (
                      <div key={t.reason}>{t.label} <span className="text-slate-400">×{t.count}</span></div>
                    ))}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {r.locations.length === 0
                  ? '—'
                  : r.locations.map((l) => (
                      <div key={l.location}>{LOCATION_LABELS[l.location] ?? l.location} <span className="text-slate-400">×{l.count}</span></div>
                    ))}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.labels.length === 0
                  ? <span className="text-slate-300">—</span>
                  : r.labels.map((l) => (
                      <span key={l} className="inline-block mb-1 ml-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                        {AUTO_LABEL_TEXT[l]}
                      </span>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ExerciseSwapStatsPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ExerciseStatsDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const role = await checkUserRole(user.uid);
        setAllowed(role.isRootAdmin || role.isSuperAdmin || role.isSystemAdmin);
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
      const snap = await getDocs(collection(db, 'exercise_stats'));
      setDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExerciseStatsDoc, 'id'>) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  const { ranked, lowData } = useMemo(() => buildSwapStatsTables(docs), [docs]);

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
        <p className="text-sm">המסך הזה זמין למנהלי מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/exercises" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-1">
            <ArrowRight size={12} /> בנק תרגילים
          </Link>
          <h1 className="text-xl font-black text-slate-900">תרגילים שמחליפים הכי הרבה</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            החלפות שמשתמשים עשו בעצמם (תצוגה מקדימה, באמצע אימון, אימון משולב), מול הפעמים שהתרגיל הושלם כפי שנרשם.
            מדורג לפי הגבול התחתון של שיעור ההחלפה (Wilson 95%), כדי שתרגיל עם 2 החלפות מתוך 2 לא יקפוץ לראש.
            החלפות של ״כואב״ נספרות בסיבות בלבד — לא בכיוון ולא בתחליפים. נתונים אנונימיים, לקריאה בלבד.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          רענן
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {loading && docs.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700">מדורג (לפחות {MIN_SAMPLE} הזדמנויות)</h2>
            <SwapTable rows={ranked} showRank />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700">מעט נתונים (פחות מ־{MIN_SAMPLE})</h2>
            <SwapTable rows={lowData} showRank={false} />
          </section>
        </>
      )}
    </div>
  );
}
