'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/demo — "מרכז הדמו" (owner, 20.10.2026): start / stop the demo world live and see
 * what it costs. Super admin only (the page checks the role for the UX; the real boundary
 * is requireSuperAdminApi on /api/admin/demo/** and the admin-only rule on feature_flags).
 *
 *   switches   system_config/feature_flags (live listener; one key per press)
 *   everything else  /api/admin/demo/status, polled while the tab is visible
 *              (demo_registry is server-only — no client SDK reads)
 */
import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { subscribeDemoSwitches, writeDemoSwitch } from '@/features/admin/services/demo-switch.service';
import { ErrorState, PageHeader, Skeleton } from '@/features/admin/components/ui';
import type { DemoSwitchKey } from '@/lib/demo-control/paths';
import { demoFetch, readError } from '@/features/admin/components/demo-control/demo-client';
import { useDemoStatus } from '@/features/admin/components/demo-control/useDemoStatus';
import DemoStatusCards from '@/features/admin/components/demo-control/DemoStatusCards';
import DemoSwitches from '@/features/admin/components/demo-control/DemoSwitches';
import TesterRunPanel from '@/features/admin/components/demo-control/TesterRunPanel';
import LiveCostPanel from '@/features/admin/components/demo-control/LiveCostPanel';
import CapsEditor from '@/features/admin/components/demo-control/CapsEditor';

const CONFIRM_ON: Partial<Record<DemoSwitchKey, string>> = {
  demo_life_llm: 'להדליק AI בצ׳אט? כל תגובה בצ׳אט הדמו תעלה כסף, עד התקרה שהגדרתם.',
  enable_ai_testers: 'להדליק את בודקי ה-AI? סיורים עולים כסף, עד התקרה שהגדרתם.',
};

export default function DemoControlCenterPage() {
  const [checking, setChecking] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [switches, setSwitches] = useState<Record<DemoSwitchKey, boolean> | null>(null);
  const [busyKey, setBusyKey] = useState<DemoSwitchKey | null>(null);
  const [runBusy, setRunBusy] = useState<'run' | 'stop' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      setUid(user.uid);
      try {
        setAllowed((await checkUserRole(user.uid)).isSuperAdmin);
      } catch {
        setAllowed(false);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const { data, error, lastFetchedAt, reload, loading } = useDemoStatus(allowed);

  // Live switches — one doc listener, unsubscribed on unmount.
  useEffect(() => {
    if (!allowed) return;
    return subscribeDemoSwitches(setSwitches, () => setSwitches(null));
  }, [allowed]);

  // "עודכן לפני X שנ׳" ticker.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const toggle = useCallback(
    async (key: DemoSwitchKey, next: boolean) => {
      if (!uid) return;
      const ask = next ? CONFIRM_ON[key] : undefined;
      if (ask && !window.confirm(ask)) return;
      setBusyKey(key);
      setNotice(null);
      try {
        await writeDemoSwitch(key, next, uid);
        void reload();
      } catch {
        setNotice({ ok: false, text: 'שמירת המתג נכשלה. נסו שוב.' });
      } finally {
        setBusyKey(null);
      }
    },
    [uid, reload],
  );

  const testers = useCallback(
    async (action: 'run' | 'stop') => {
      setRunBusy(action);
      setNotice(null);
      try {
        const res = await demoFetch('/api/admin/demo/testers', { method: 'POST', body: JSON.stringify({ action }) });
        if (!res.ok) throw new Error(await readError(res));
        setNotice({ ok: true, text: action === 'run' ? 'הסיור נשלח להרצה. הסטטוס יתעדכן כשהבודקים יתחילו.' : 'נשלחה עצירה לבודקים.' });
      } catch (err) {
        setNotice({ ok: false, text: err instanceof Error ? err.message : 'הפעולה נכשלה' });
      } finally {
        setRunBusy(null);
        void reload();
      }
    },
    [reload],
  );

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm">המסך הזה זמין לסופר-אדמין בלבד.</p>
      </div>
    );
  }

  const liveSwitches = switches ?? data?.switches ?? null;
  const updatedAgoSec = lastFetchedAt === null ? null : Math.max(0, Math.round((now - lastFetchedAt) / 1000));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8" dir="rtl">
      <PageHeader
        eyebrow="עולם הדמו"
        title="מרכז"
        strong="הדמו"
        subtitle="מדליקים ומכבים את עולם הדמו ואת בודקי ה-AI, ורואים כמה זה עולה, בזמן אמת. משתמשי דמו לעולם לא מופיעים למשתמשים אמיתיים."
      />

      {notice && (
        <p role="status" className={`rounded-xl px-3 py-2 text-[14px] font-bold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </p>
      )}

      {loading && <Skeleton height={110} count={3} />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {error && data && <p className="text-[13px] font-bold text-amber-700">הרענון האחרון נכשל ({error}). מוצגים הנתונים האחרונים.</p>}

      {data && (
        <>
          <DemoStatusCards data={{ ...data, switches: liveSwitches ?? data.switches }} />
          <div className="grid gap-5 lg:grid-cols-2">
            {liveSwitches && <DemoSwitches values={liveSwitches} busyKey={busyKey} onToggle={toggle} />}
            <TesterRunPanel data={{ ...data, switches: liveSwitches ?? data.switches }} busy={runBusy} onRun={() => void testers('run')} onStop={() => void testers('stop')} />
          </div>
          <LiveCostPanel data={data} updatedAgoSec={updatedAgoSec} />
          <CapsEditor config={data.config} onSaved={() => void reload()} />
        </>
      )}
    </div>
  );
}
