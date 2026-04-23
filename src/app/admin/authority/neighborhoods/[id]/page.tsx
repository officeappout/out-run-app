'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthority, getAllAuthorities, getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import {
  getNeighborhoodBreakdown,
  getActivityTrend,
  getPopularParks,
  NeighborhoodBreakdownRow,
  ActivityTrend,
  PopularPark,
} from '@/features/admin/services/analytics.service';
import { getReportsByAuthority } from '@/features/admin/services/maintenance.service';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import type { Authority, KpiSettings, DEFAULT_KPI_SETTINGS as DefaultKpiType } from '@/types/admin-types';
import { DEFAULT_KPI_SETTINGS } from '@/types/admin-types';
import type { MaintenanceReport } from '@/types/maintenance.types';
import type { Park } from '@/features/parks';
import {
  Loader2,
  ArrowRight,
  Users,
  Dumbbell,
  Wrench,
  MapPin,
  Building2,
  TrendingUp,
  AlertTriangle,
  Search,
  ChevronDown,
  Clock,
  Flag,
  Star,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import dynamic_import from 'next/dynamic';

const MapComponent = dynamic_import(
  () => import('react-map-gl').then(mod => {
    const { default: MapGL, Marker } = mod;
    return { default: ({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) => (
      <MapGL
        initialViewState={{ latitude: lat, longitude: lng, zoom }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        interactive={true}
        attributionControl={false}
      >
        <Marker latitude={lat} longitude={lng} color="#06B6D4" />
      </MapGL>
    )};
  }),
  { ssr: false, loading: () => <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" /> },
);

// ── Privacy helpers ──────────────────────────────────────────────────

function getPrivacyName(fullName: string): { firstName: string; lastInitial: string } {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts[0] || 'ללא שם';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '\u05F3' : '';
  return { firstName, lastInitial };
}

function calcAge(birthDate: any): number | null {
  if (!birthDate) return null;
  const d = birthDate instanceof Date ? birthDate
    : typeof birthDate?.toDate === 'function' ? birthDate.toDate()
    : typeof birthDate === 'string' ? new Date(birthDate) : null;
  if (!d || isNaN(d.getTime())) return null;
  return new Date().getFullYear() - d.getFullYear();
}

// ── Score computation ────────────────────────────────────────────────

function computeScore(
  row: NeighborhoodBreakdownRow,
  allRows: NeighborhoodBreakdownRow[],
  kpi: KpiSettings,
): number {
  const totalWeight = kpi.weightWorkoutVolume + kpi.weightAppPenetration + kpi.weightActiveMinutes;
  if (totalWeight === 0 || row.totalUsers === 0) return 0;

  const maxWpu = Math.max(...allRows.map(r => r.activeUsers > 0 ? r.workouts / r.activeUsers : 0), 1);
  const maxMpu = Math.max(...allRows.map(r => r.activeUsers > 0 ? r.totalActiveMinutes / r.activeUsers : 0), 1);

  const penRatio = row.totalUsers > 0 ? row.activeUsers / row.totalUsers : 0;
  const wpu = row.activeUsers > 0 ? row.workouts / row.activeUsers : 0;
  const mpu = row.activeUsers > 0 ? row.totalActiveMinutes / row.activeUsers : 0;

  const score = (
    (maxWpu > 0 ? Math.min(wpu / maxWpu, 1) : 0) * (kpi.weightWorkoutVolume / totalWeight) +
    Math.min(penRatio / 0.5, 1) * (kpi.weightAppPenetration / totalWeight) +
    (maxMpu > 0 ? Math.min(mpu / maxMpu, 1) : 0) * (kpi.weightActiveMinutes / totalWeight)
  ) * 100;

  return Math.round(score * 10) / 10;
}

// ── Types ────────────────────────────────────────────────────────────

interface PrivacyResident {
  uid: string;
  firstName: string;
  lastInitial: string;
  age: number | null;
  neighborhood: string;
}

interface EquipmentCount {
  id: string;
  name: string;
  count: number;
}

const REPORT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  reported:    { label: 'דווח',      color: 'bg-red-100 text-red-700' },
  in_review:   { label: 'בבדיקה',    color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'בטיפול',    color: 'bg-blue-100 text-blue-700' },
  resolved:    { label: 'טופל',      color: 'bg-green-100 text-green-700' },
  dismissed:   { label: 'נדחה',      color: 'bg-slate-100 text-slate-500' },
};

// ── Page ─────────────────────────────────────────────────────────────

export default function NeighborhoodProfilePage() {
  const params = useParams();
  const neighborhoodId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [neighborhood, setNeighborhood] = useState<Authority | null>(null);
  const [stats, setStats] = useState<NeighborhoodBreakdownRow | null>(null);
  const [trend, setTrend] = useState<ActivityTrend[]>([]);
  const [topParks, setTopParks] = useState<PopularPark[]>([]);
  const [openReports, setOpenReports] = useState<MaintenanceReport[]>([]);
  const [performanceScore, setPerformanceScore] = useState(0);
  const [kpiSettings, setKpiSettings] = useState<KpiSettings>(DEFAULT_KPI_SETTINGS);

  // New enriched sections
  const [residents, setResidents] = useState<PrivacyResident[]>([]);
  const [topEquipment, setTopEquipment] = useState<EquipmentCount[]>([]);
  const [residentSearch, setResidentSearch] = useState('');
  const [showAllResidents, setShowAllResidents] = useState(false);

  useEffect(() => {
    if (!neighborhoodId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);

        // Resolve the parent authority for BI context
        let parentAuthId: string | null = null;
        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          const stored = typeof window !== 'undefined' ? localStorage.getItem('admin_selected_authority_id') : null;
          parentAuthId = stored && allAuths.find(a => a.id === stored) ? stored : allAuths[0]?.id ?? null;
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          parentAuthId = role.authorityIds?.[0] ?? auths[0]?.id ?? null;
        }

        // Load parent KPI settings
        let parentKpi = DEFAULT_KPI_SETTINGS;
        if (parentAuthId) {
          const parentDoc = await getAuthority(parentAuthId);
          if (parentDoc && (parentDoc as any).kpiSettings) {
            parentKpi = (parentDoc as any).kpiSettings;
          }
        }
        setKpiSettings(parentKpi);

        // Load all data in parallel
        const [
          neighborhoodDoc,
          trendData,
          popularParks,
          reports,
          breakdownData,
          neighborhoodParks,
        ] = await Promise.all([
          getAuthority(neighborhoodId),
          getActivityTrend(neighborhoodId, 14),
          getPopularParks(neighborhoodId, 5),
          getReportsByAuthority(neighborhoodId).catch(() => [] as MaintenanceReport[]),
          parentAuthId ? getNeighborhoodBreakdown(parentAuthId, { min: parentKpi.targetAgeMin, max: parentKpi.targetAgeMax }) : Promise.resolve([]),
          getParksByAuthority(neighborhoodId).catch(() => [] as Park[]),
        ]);

        setNeighborhood(neighborhoodDoc);
        setTrend(trendData);
        setTopParks(popularParks);

        // Active infrastructure reports
        const activeReports = reports.filter(r =>
          r.status === 'reported' || r.status === 'in_review' || r.status === 'in_progress'
        );
        setOpenReports(activeReports);

        // Performance score from parent breakdown
        const row = breakdownData.find(r => r.neighborhoodId === neighborhoodId);
        if (row) {
          setStats(row);
          setPerformanceScore(computeScore(row, breakdownData, parentKpi));
        }

        // Residents list (privacy-safe)
        try {
          const usersSnap = await getDocs(query(
            collection(db, 'users'),
            where('core.authorityId', '==', neighborhoodId),
          ));
          const resList: PrivacyResident[] = usersSnap.docs.map(d => {
            const data = d.data();
            const core = data.core as Record<string, any> ?? {};
            const displayName = core.displayName ?? core.fullName ?? '';
            const { firstName, lastInitial } = getPrivacyName(displayName);
            const age = calcAge(core.birthDate);
            const hood = core.neighborhoodName ?? '';
            return { uid: d.id, firstName, lastInitial, age, neighborhood: hood };
          });
          setResidents(resList);
        } catch { /* non-fatal */ }

        // Top equipment from parks
        const equipMap = new Map<string, { name: string; count: number }>();
        for (const park of neighborhoodParks) {
          const eq = (park as any).gymEquipment as { equipmentId: string; brandName: string }[] | undefined;
          if (eq) {
            for (const item of eq) {
              const existing = equipMap.get(item.equipmentId);
              if (existing) existing.count++;
              else equipMap.set(item.equipmentId, { name: item.brandName || item.equipmentId, count: 1 });
            }
          }
        }
        const sorted = Array.from(equipMap.entries())
          .map(([id, v]) => ({ id, name: v.name, count: v.count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
        setTopEquipment(sorted);

      } catch (err) {
        console.error('[NeighborhoodProfile] load failed:', err);
        setError('שגיאה בטעינת נתוני השכונה');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [neighborhoodId]);

  const neighborhoodName = useMemo(() => {
    if (!neighborhood) return neighborhoodId;
    return typeof neighborhood.name === 'string' ? neighborhood.name : neighborhood.name?.he || neighborhoodId;
  }, [neighborhood, neighborhoodId]);

  const coords = neighborhood?.coordinates;
  const scoreColor = getScoreColor(performanceScore);

  // Filtered residents
  const filteredResidents = useMemo(() => {
    let list = residents;
    if (residentSearch.trim()) {
      const q = residentSearch.trim().toLowerCase();
      list = list.filter(r => r.firstName.toLowerCase().includes(q) || r.lastInitial.toLowerCase().includes(q));
    }
    if (!showAllResidents && list.length > 20) return list.slice(0, 20);
    return list;
  }, [residents, residentSearch, showAllResidents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Building2 className="w-10 h-10 text-amber-400" />
        <p className="text-lg font-bold text-slate-700">{error}</p>
        <Link href="/admin/authority-manager" className="text-cyan-600 text-sm font-bold hover:underline">
          חזור לדשבורד
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto" dir="rtl">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-cyan-50 rounded-2xl flex items-center justify-center">
            <Building2 size={28} className="text-cyan-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">{neighborhoodName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">צלילה עמוקה — נתוני ביצועים</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl ring-1 ${scoreColor.bg} ${scoreColor.ring}`}>
            <span className={`text-3xl font-black ${scoreColor.text}`}>{performanceScore}</span>
            <span className={`text-xs font-bold ${scoreColor.text} opacity-70`}>BI</span>
          </div>

          <Link
            href="/admin/authority-manager"
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <ArrowRight size={14} />
            חזור לדשבורד
          </Link>
        </div>
      </div>

      {/* ═══ Top Row Stats ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="סה״כ תושבים" value={stats?.totalUsers ?? 0} icon={Users} color="cyan" />
        <StatCard label="סה״כ אימונים" value={stats?.workouts ?? 0} icon={Dumbbell} color="violet" />
        <StatCard label="דיווחים פתוחים" value={openReports.length} icon={Wrench} color={openReports.length > 0 ? 'amber' : 'emerald'} />
        <StatCard label="פארק מוביל" value={topParks[0]?.parkName || 'אין נתונים'} icon={MapPin} color="blue" isText />
      </div>

      {/* ═══ Activity Trend Chart ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">פעילות — 14 ימים אחרונים</h2>
            <p className="text-xs text-gray-500">מספר משתמשים פעילים לפי יום</p>
          </div>
        </div>

        {trend.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorDau" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  labelFormatter={d => new Date(d).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long' })}
                  formatter={(v: number) => [v, 'משתמשים פעילים']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: 13, direction: 'rtl' }}
                />
                <Area type="monotone" dataKey="dau" stroke="#06B6D4" strokeWidth={2.5} fill="url(#colorDau)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#06B6D4' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <p className="text-sm font-bold">אין מספיק נתונים להציג גרף</p>
          </div>
        )}
      </div>

      {/* ═══ Two-Column: Residents + Active Tasks ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Residents List (P5 Privacy-Safe) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-cyan-50 rounded-xl flex items-center justify-center">
                <Users size={18} className="text-cyan-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900">תושבים רשומים</h2>
                <p className="text-[11px] text-gray-500">{residents.length} תושבים (תצוגה מוגנת)</p>
              </div>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={residentSearch}
              onChange={e => setResidentSearch(e.target.value)}
              placeholder="חפש שם..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent"
            />
          </div>

          {filteredResidents.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p className="text-sm font-bold">{residentSearch ? 'לא נמצאו תוצאות' : 'אין תושבים רשומים'}</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
                      <th className="text-right py-2 px-3 w-8">#</th>
                      <th className="text-right py-2 px-3">שם</th>
                      <th className="text-right py-2 px-3">גיל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResidents.map((r, i) => (
                      <tr key={r.uid} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-100/50 transition-colors">
                        <td className="py-2 px-3 text-[11px] text-slate-400">{i + 1}</td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-800">{r.firstName}</span>
                          {r.lastInitial && <span className="text-slate-400 mr-1">{r.lastInitial}</span>}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-500">{r.age ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {residents.length > 20 && !showAllResidents && !residentSearch && (
                <button
                  onClick={() => setShowAllResidents(true)}
                  className="mt-3 text-xs font-bold text-cyan-600 hover:text-cyan-800 flex items-center gap-1"
                >
                  <ChevronDown size={12} />
                  הצג את כל {residents.length} התושבים
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Active Tasks (Infrastructure Reports) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <Flag size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900">משימות פתוחות</h2>
              <p className="text-[11px] text-gray-500">{openReports.length} דיווחי תשתית פעילים</p>
            </div>
          </div>

          {openReports.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Wrench className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p className="text-sm font-bold">אין דיווחים פתוחים</p>
              <p className="text-xs text-slate-400 mt-1">כל הדיווחים טופלו</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {openReports.map(report => {
                const statusInfo = REPORT_STATUS_LABELS[report.status] ?? { label: report.status, color: 'bg-slate-100 text-slate-500' };
                return (
                  <div key={report.id} className="bg-slate-50 rounded-xl p-3 flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <AlertTriangle size={14} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{report.description || 'דיווח תשתית'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        {report.parkName && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <MapPin size={9} />{report.parkName}
                          </span>
                        )}
                        {report.reportedAt && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Clock size={9} />
                            {(report.reportedAt instanceof Date ? report.reportedAt : typeof (report.reportedAt as any)?.toDate === 'function' ? (report.reportedAt as any).toDate() : new Date(report.reportedAt as any))
                              .toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Top Equipment ═══ */}
      {topEquipment.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
              <Dumbbell size={18} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900">ציוד מוביל בשכונה</h2>
              <p className="text-[11px] text-gray-500">ציוד כושר הנפוץ ביותר בפארקים</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {topEquipment.map((eq, i) => (
              <div key={eq.id} className="bg-slate-50 rounded-xl p-3 text-center relative">
                {i === 0 && <Star size={12} className="absolute top-2 left-2 text-amber-400" fill="currentColor" />}
                <p className="text-lg font-black text-violet-700">{eq.count}</p>
                <p className="text-[11px] font-bold text-slate-600 truncate">{eq.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Top Parks ═══ */}
      {topParks.length > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <MapPin size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900">פארקים פופולריים</h2>
              <p className="text-[11px] text-gray-500">לפי צ׳ק-אין ואימונים</p>
            </div>
          </div>
          <div className="space-y-2">
            {topParks.map((park, i) => (
              <div key={park.parkId} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${
                  i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : 'bg-amber-600'
                }`}>{i + 1}</span>
                <p className="text-sm font-bold text-slate-800 flex-1">{park.parkName}</p>
                <span className="text-xs font-bold text-cyan-600">{park.checkInCount} ביקורים</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Map ═══ */}
      {coords && coords.lat && coords.lng && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                <MapPin size={18} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">מפת השכונה</h2>
                <p className="text-xs text-gray-500">מיקום מרכזי ותחום פעילות</p>
              </div>
            </div>
          </div>
          <div className="h-80">
            <MapComponent lat={coords.lat} lng={coords.lng} zoom={14} />
          </div>
        </div>
      )}

      {/* ═══ Additional stats ═══ */}
      {stats && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">מדדים נוספים</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-slate-800">{stats.activeUsers}</p>
              <p className="text-[11px] text-slate-500 font-bold">פעילים החודש</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-slate-800">
                {stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}%
              </p>
              <p className="text-[11px] text-slate-500 font-bold">שיעור חדירה</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-slate-800">{Math.round(stats.totalActiveMinutes)}</p>
              <p className="text-[11px] text-slate-500 font-bold">דקות פעילות</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-purple-700">{stats.targetAudiencePercent}%</p>
              <p className="text-[11px] text-purple-500 font-bold">
                קהל יעד ({kpiSettings.targetAgeMin}–{kpiSettings.targetAgeMax})
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function getScoreColor(score: number) {
  if (score >= 70) return { text: 'text-green-700', bg: 'bg-green-100', ring: 'ring-green-300' };
  if (score >= 40) return { text: 'text-cyan-700',  bg: 'bg-cyan-100',  ring: 'ring-cyan-300'  };
  if (score >= 20) return { text: 'text-amber-700', bg: 'bg-amber-100', ring: 'ring-amber-300' };
  return              { text: 'text-slate-600', bg: 'bg-slate-100', ring: 'ring-slate-300' };
}

function StatCard({
  label, value, icon: Icon, color, isText,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  isText?: boolean;
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
    cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    iconBg: 'bg-cyan-100' },
    violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  iconBg: 'bg-violet-100' },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    iconBg: 'bg-blue-100' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   iconBg: 'bg-amber-100' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', iconBg: 'bg-emerald-100' },
  };
  const c = colorMap[color] ?? colorMap.cyan;

  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <div className={`w-8 h-8 ${c.iconBg} rounded-lg flex items-center justify-center`}>
          <Icon size={16} className={c.text} />
        </div>
      </div>
      {isText ? (
        <p className={`text-base font-black ${c.text} truncate`}>{value}</p>
      ) : (
        <p className={`text-3xl font-black ${c.text}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
      )}
    </div>
  );
}
