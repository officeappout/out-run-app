'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  Trash2,
} from 'lucide-react';
import {
  cleanSderotMockData,
  runSderotDemoSeed,
  type ProgressUpdate,
  type StepName,
} from '@/features/admin/services/demo-seed-sderot';

type RunPhase = 'idle' | 'running' | 'done' | 'error';

interface StepRow {
  id: StepName;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message: string;
  count: number | null;
}

const STEP_DEFINITIONS: ReadonlyArray<{ id: StepName; label: string }> = [
  { id: 'cleanup',                label: '1. ניקוי דאטה ישנה' },
  { id: 'users',                  label: '2. יצירת 60 משתמשים' },
  { id: 'workouts',               label: '3. יצירת היסטוריית אימונים' },
  { id: 'presence',               label: '4. נוכחות חיה (20)' },
  { id: 'active_workouts',        label: '5. אימונים פעילים (10)' },
  { id: 'sessions',               label: '6. ביקורים בפארקים' },
  { id: 'feed_posts',             label: '7. פוסטים לפיד' },
  { id: 'community_groups',       label: '8. עדכון קבוצות קהילה' },
  { id: 'manager_notifications',  label: '9. התראות מנהל' },
  { id: 'route_analytics',        label: '10. עדכון נתוני מסלולים' },
];

const COLLECTION_LABELS: Record<string, string> = {
  cleanup_legacy:             'דאטה ישנה (נמחקה)',
  users:                      'users',
  workouts:                   'workouts',
  presence:                   'presence',
  active_workouts:            'active_workouts',
  sessions:                   'sessions',
  feed_posts:                 'feed_posts',
  community_groups:           'community_groups',
  manager_notifications:      'manager_notifications',
  route_analytics:            'official_routes (מסלולים)',
  route_analytics_reset:      'official_routes (איפוס analytics)',
  authority_userCount_reset:  'authorities (איפוס userCount)',
};

function buildInitialSteps(): StepRow[] {
  return STEP_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    status: 'pending' as const,
    message: '',
    count: null,
  }));
}

export default function DemoSeedPage() {
  const [seedPhase, setSeedPhase] = useState<RunPhase>('idle');
  const [cleanPhase, setCleanPhase] = useState<RunPhase>('idle');
  const [steps, setSteps] = useState<StepRow[]>(buildInitialSteps);
  const [seedCounts, setSeedCounts] = useState<Record<string, number> | null>(null);
  const [cleanDeleted, setCleanDeleted] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const onProgress = useCallback((update: ProgressUpdate) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === update.step
          ? {
              ...s,
              status: update.status,
              message: update.message,
              count: update.count ?? s.count,
            }
          : s,
      ),
    );
  }, []);

  const handleSeed = useCallback(async () => {
    setSeedPhase('running');
    setSeedCounts(null);
    setCleanDeleted(null);
    setErrorMsg('');
    setSteps(buildInitialSteps());

    try {
      const result = await runSderotDemoSeed(onProgress);
      setSeedCounts(result.counts);
      if (result.success) {
        setSeedPhase('done');
      } else {
        setSeedPhase('error');
        setErrorMsg(result.errors.join('\n'));
      }
    } catch (err: unknown) {
      setSeedPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [onProgress]);

  const handleClean = useCallback(async () => {
    if (!confirm('האם למחוק את כל נתוני הדמו של שדרות?')) return;
    setCleanPhase('running');
    setSeedCounts(null);
    setCleanDeleted(null);
    setErrorMsg('');

    try {
      const result = await cleanSderotMockData(onProgress);
      setCleanDeleted(result.deleted);
      if (result.success) {
        setCleanPhase('done');
      } else {
        setCleanPhase('error');
        setErrorMsg(result.errors.join('\n'));
      }
    } catch (err: unknown) {
      setCleanPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [onProgress]);

  const seedRunning = seedPhase === 'running';
  const cleanRunning = cleanPhase === 'running';
  const totalSeedDocs = seedCounts
    ? Object.entries(seedCounts)
        .filter(([k]) => k !== 'cleanup_legacy')
        .reduce((sum, [, n]) => sum + n, 0)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8" dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="text-fuchsia-500" size={28} />
          <h1 className="text-2xl font-black text-gray-900">כלי דמו — שדרות</h1>
        </div>
        <p className="text-gray-500 text-sm">
          יוצר 60 משתמשי דמו עם דאטה מלאה ב-9 קולקציות, כך שכל מטריקה בלוח הבקרה של שדרות
          תציג ערך לא-אפס. כל מסמך משתמש בקידומת <code dir="ltr">sderot-mock-</code> לניקוי קל.
        </p>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>שים לב:</strong> כל הרצה מנקה אוטומטית דאטה ישנה (
        <code dir="ltr">sderot-demo-user-*</code>, <code dir="ltr">mock_lemur_*</code>,{' '}
        <code dir="ltr">sderot-mock-*</code>) לפני יצירת הדאטה החדשה. הרצה חוזרת בטוחה.
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSeed}
          disabled={seedRunning || cleanRunning}
          className="flex items-center gap-2 px-6 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
        >
          {seedRunning ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          הפעל דמו מלא
        </button>

        <button
          onClick={handleClean}
          disabled={seedRunning || cleanRunning}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
        >
          {cleanRunning ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          נקה מוק דאטה
        </button>
      </div>

      {/* Per-step progress list (only shown during/after a seed run) */}
      {(seedPhase !== 'idle') && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {steps.map((s) => (
            <StepIndicator key={s.id} row={s} />
          ))}
        </div>
      )}

      {/* Seed result summary */}
      {seedCounts && seedPhase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-green-700 font-bold text-lg mb-3">
            <CheckCircle2 size={22} />
            הסיד הושלם בהצלחה!
          </div>
          <p className="text-sm text-green-800 mb-3">
            סה&quot;כ <strong>{totalSeedDocs.toLocaleString('he-IL')}</strong> מסמכים נוצרו.
          </p>
          <ResultTable counts={seedCounts} />
        </div>
      )}

      {/* Cleanup result summary */}
      {cleanDeleted && cleanPhase === 'done' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-lg mb-3">
            <CheckCircle2 size={22} />
            הניקוי הושלם!
          </div>
          <ResultTable counts={cleanDeleted} />
        </div>
      )}

      {/* Error display */}
      {(seedPhase === 'error' || cleanPhase === 'error') && errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">שגיאה:</p>
            <pre className="text-xs font-mono mt-1 whitespace-pre-wrap">{errorMsg}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ row }: { row: StepRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusIcon status={row.status} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{row.label}</p>
        {row.message && <p className="text-xs text-slate-500 mt-0.5">{row.message}</p>}
      </div>
      {row.count !== null && row.status === 'done' && (
        <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">
          {row.count.toLocaleString('he-IL')}
        </span>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: StepRow['status'] }) {
  if (status === 'running') return <Loader2 size={18} className="text-fuchsia-500 animate-spin" />;
  if (status === 'done') return <CheckCircle2 size={18} className="text-green-500" />;
  if (status === 'error') return <AlertCircle size={18} className="text-red-500" />;
  return <div className="w-[18px] h-[18px] rounded-full border-2 border-slate-300" />;
}

function ResultTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-start">קולקציה</th>
            <th className="px-3 py-2 text-end">מסמכים</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, count]) => (
            <tr key={key}>
              <td className="px-3 py-2 text-slate-900">{COLLECTION_LABELS[key] ?? key}</td>
              <td className="px-3 py-2 text-end font-mono text-slate-700">
                {count.toLocaleString('he-IL')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
