'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/ai-coach/proactive — "קלי · הודעות יזומות" (Kelly phase 3, flag ai_coach_proactive):
 * sends per day by trigger, a per-user preview ("what would Kelly send today and why", read
 * only) and a test send to the admin's own account. Super / root admin: the real boundary is
 * requireKellyTeamAdmin on /api/admin/ai-coach/proactive.
 */
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import ProactiveStatsTable, { type ProactiveStatsRow } from '@/features/admin/components/ai-coach/ProactiveStatsTable';
import ProactivePreviewPanel from '@/features/admin/components/ai-coach/ProactivePreviewPanel';
import { proactiveAdminFetch } from '@/features/admin/components/ai-coach/proactive-api';

export default function KellyProactiveAdminPage() {
  const [stats, setStats] = useState<ProactiveStatsRow[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) return;
      void proactiveAdminFetch().then((r) => {
        if (r.status === 401 || r.status === 403) setDenied(true);
        else setStats(Array.isArray(r.data.stats) ? (r.data.stats as ProactiveStatsRow[]) : []);
      });
    });
  }, []);

  if (denied) return <p className="p-6 text-sm text-gray-500" dir="rtl">אין הרשאה.</p>;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div>
        <h1 className="text-xl font-black text-gray-900">קלי · הודעות יזומות</h1>
        <p className="text-sm text-gray-500">לכל היותר הודעה אחת ביום למשתמש. ההתראה נספרת במכסה היומית, לא בשעות שקט, לא בשבת למי שבחר, ולא למי שלא מתאמן כבר כמה ימים.</p>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-black text-gray-700">שליחות לפי יום (14 ימים)</h2>
        {stats ? <ProactiveStatsTable rows={stats} /> : <p className="text-sm text-gray-400">טוען...</p>}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-black text-gray-700">תצוגה מקדימה ובדיקה</h2>
        <ProactivePreviewPanel />
      </section>
    </div>
  );
}
