'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import {
  getReadinessConfig,
  getUnitReadiness,
  type ReadinessConfig,
  type UnitReadinessSummary,
} from '@/features/admin/services/readiness.service';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import ReadinessGauge from '@/features/admin/components/readiness/ReadinessGauge';
import ThresholdConfig from '@/features/admin/components/readiness/ThresholdConfig';
import { Loader2, ShieldCheck, Settings2, User } from 'lucide-react';
import Link from 'next/link';

export default function ReadinessPage() {
  const [loading, setLoading] = useState(true);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [config, setConfig] = useState<ReadinessConfig | null>(null);
  const [summary, setSummary] = useState<UnitReadinessSummary | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setAdminUid(user.uid);

      try {
        const role = await checkUserRole(user.uid);
        const auths = await getAuthoritiesByManager(user.uid);
        const authority = auths[0];

        if (!authority) { setLoading(false); return; }

        setUnitId(authority.id);

        const [cfg, readiness] = await Promise.all([
          getReadinessConfig(authority.id),
          getUnitReadiness(authority.id),
        ]);

        setConfig(cfg ?? {
          unitId: authority.id,
          tenantId: (authority as any).tenantId ?? authority.id,
          tests: [],
        });
        setSummary(readiness);
      } catch (err) {
        console.error('[Readiness] load error:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const refresh = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const [cfg, readiness] = await Promise.all([
        getReadinessConfig(unitId),
        getUnitReadiness(unitId),
      ]);
      setConfig(cfg ?? config);
      setSummary(readiness);
    } catch { /* */ } finally {
      setLoading(false);
    }
  };

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
        { label: 'כשירות יחידה' },
      ]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
            <ShieldCheck size={24} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">כשירות יחידה</h1>
            <p className="text-sm text-gray-500">סטטוס כשירות לפי מבחנים מוגדרים</p>
          </div>
        </div>
        <button
          onClick={() => setShowConfig(prev => !prev)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 transition-all"
        >
          <Settings2 size={14} />
          {showConfig ? 'הסתר הגדרות' : 'הגדר סף'}
        </button>
      </div>

      {/* Threshold Config */}
      {showConfig && config && adminUid && (
        <ThresholdConfig
          config={config}
          adminUid={adminUid}
          onSaved={() => {
            setShowConfig(false);
            refresh();
          }}
        />
      )}

      {/* Gauge */}
      {summary && <ReadinessGauge summary={summary} />}

      {/* Soldiers Table */}
      {summary && summary.soldiers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-black text-gray-900 mb-4">
            רשימת חיילים ({summary.total})
          </h3>

          <div className="bg-slate-50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                  <th className="text-right py-2 px-3">#</th>
                  <th className="text-right py-2 px-3">שם</th>
                  <th className="text-right py-2 px-3">סטטוס</th>
                  {config?.tests.map(t => (
                    <th key={t.id} className="text-right py-2 px-3">{t.label}</th>
                  ))}
                  <th className="text-right py-2 px-3">פעילות אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {summary.soldiers.map((soldier, i) => (
                  <tr
                    key={soldier.uid}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-100/50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/admin/authority/units/${soldier.uid}`}
                        className="font-bold text-slate-800 hover:text-cyan-600 flex items-center gap-1.5"
                      >
                        <User size={12} className="text-slate-400" />
                        {soldier.name}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={soldier.status} />
                    </td>
                    {soldier.testResults.map(tr => (
                      <td key={tr.testId} className="py-2.5 px-3">
                        <span className={`text-xs font-bold ${
                          tr.status === 'green' ? 'text-green-600' :
                          tr.status === 'yellow' ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {tr.value !== null ? tr.value : '—'}
                        </span>
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {soldier.lastActivityDate ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'green' | 'yellow' | 'red' }) {
  const cfg = {
    green: { bg: 'bg-green-100', text: 'text-green-700', label: 'כשיר' },
    yellow: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'חלקי' },
    red: { bg: 'bg-red-100', text: 'text-red-700', label: 'לא כשיר' },
  }[status];

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
