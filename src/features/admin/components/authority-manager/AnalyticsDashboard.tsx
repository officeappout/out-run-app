'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getDailyActiveUsers,
  getMonthlyActiveUsers,
  getGenderDistribution,
  getAgeDistribution,
  getPopularParks,
  getActivityTrend,
  getNeighborhoodBreakdown,
  getNeighborhoodList,
  getFilteredUserIds,
  getDateRangeForFilter,
  getActivityByHour,
  getPersonaDistribution,
  getEntryRouteDistribution,
  getRunningStats,
  isWorkoutsIndexBuilding,
  DEFAULT_FILTERS,
  GenderDistribution,
  AgeDistribution,
  ActivityTrend,
  NeighborhoodBreakdownRow,
  HourlyBucket,
  DashboardFilters,
  PersonaCount,
  EntryRouteDistribution,
  RunningStats,
} from '@/features/admin/services/analytics.service';
import NeighborhoodBreakdown from './NeighborhoodBreakdown';
import FilterBar from './FilterBar';
import ActivityByHourChart from './ActivityByHourChart';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { TrendingUp, Users, Calendar, MapPin, Map, Target, DollarSign, Bell, Send, AlertCircle, Route, Footprints, Heart } from 'lucide-react';
import { getParksByAuthority } from '@/features/parks';
import { Park } from '@/types/admin-types';
import {
  getWHO150Tracker,
  getHealthSavings,
  getSavingsOverTime,
  WHO150TrackerResult,
  HealthSavingsResult,
  SavingsOverTimeData,
} from '@/features/admin/services/health-economics.service';
import {
  getManagerNotifications,
  sendEncouragementPush,
  ManagerNotification,
} from '@/features/admin/services/engagement.service';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AnalyticsDashboardProps {
  authorityId: string;
}

const COLORS = ['#00AEEF', '#06B6D4', '#0891B2', '#0E7490', '#155E75'];

export default function AnalyticsDashboard({ authorityId }: AnalyticsDashboardProps) {
  const [dau, setDau] = useState<number>(0);
  const [mau, setMau] = useState<number>(0);
  const [genderData, setGenderData] = useState<GenderDistribution | null>(null);
  const [ageData, setAgeData] = useState<AgeDistribution | null>(null);
  const [activityTrend, setActivityTrend] = useState<ActivityTrend[]>([]);
  const [popularParks, setPopularParks] = useState<any[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [neighborhoodBreakdown, setNeighborhoodBreakdown] = useState<NeighborhoodBreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexBuilding, setIndexBuilding] = useState(false);

  // Cross-Reference Filter State
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [filterLoading, setFilterLoading] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<{ id: string; name: string }[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyBucket[]>([]);
  const [hourlyCompareData, setHourlyCompareData] = useState<HourlyBucket[] | null>(null);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persona / Entry Route / Running State
  const [personaData, setPersonaData] = useState<PersonaCount[]>([]);
  const [entryRouteData, setEntryRouteData] = useState<EntryRouteDistribution | null>(null);
  const [runningStats, setRunningStats] = useState<RunningStats | null>(null);

  // Health Economics State
  const [whoTracker, setWhoTracker] = useState<WHO150TrackerResult | null>(null);
  const [healthSavings, setHealthSavings] = useState<HealthSavingsResult | null>(null);
  const [savingsOverTime, setSavingsOverTime] = useState<SavingsOverTimeData[]>([]);
  
  // Engagement State
  const [notifications, setNotifications] = useState<ManagerNotification[]>([]);
  const [showEncouragementModal, setShowEncouragementModal] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<ManagerNotification | null>(null);
  const [encouragementTitle, setEncouragementTitle] = useState('');
  const [encouragementMessage, setEncouragementMessage] = useState('');
  const [sendingPush, setSendingPush] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
    loadAll();
    loadNotifications();
  }, [authorityId]);

  // Debounced filter re-query (300ms) — does NOT re-run the full loadAll
  useEffect(() => {
    if (loading) return; // skip during initial load
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => loadFiltered(filters), 300);
    return () => { if (filterTimerRef.current) clearTimeout(filterTimerRef.current); };
  }, [filters]);

  /**
   * Single parallel load — all KPIs, charts, health economics, and initial
   * hourly data fire at once. Also fetches neighborhood list for FilterBar.
   */
  const loadAll = async () => {
    console.time('DashboardLoad');
    setLoading(true);
    try {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear  = today.getFullYear();

      const defaultDateRange = getDateRangeForFilter('month');
      const initialUserIds  = await getFilteredUserIds(authorityId, DEFAULT_FILTERS);

      const [
        dailyActive, monthlyActive, gender, age,
        popularParksData, trend, parksData, breakdown,
        whoData, savingsData, savingsHistory,
        neighborhoodsList, hourly,
        personas, entryRoutes, running,
      ] = await Promise.all([
        getDailyActiveUsers(authorityId, today),
        getMonthlyActiveUsers(authorityId, currentYear, currentMonth),
        getGenderDistribution(authorityId),
        getAgeDistribution(authorityId),
        getPopularParks(authorityId, 5),
        getActivityTrend(authorityId, 30),
        getParksByAuthority(authorityId),
        getNeighborhoodBreakdown(authorityId),
        getWHO150Tracker(authorityId),
        getHealthSavings(authorityId),
        getSavingsOverTime(authorityId, 12),
        getNeighborhoodList(authorityId),
        getActivityByHour(initialUserIds, defaultDateRange),
        getPersonaDistribution(authorityId),
        getEntryRouteDistribution(authorityId),
        getRunningStats(authorityId, initialUserIds, defaultDateRange),
      ]);

      setDau(dailyActive);
      setMau(monthlyActive);
      setGenderData(gender);
      setAgeData(age);
      setPopularParks(popularParksData);
      setActivityTrend(trend);
      setParks(parksData);
      setNeighborhoodBreakdown(breakdown);
      setIndexBuilding(isWorkoutsIndexBuilding());

      setWhoTracker(whoData);
      setHealthSavings(savingsData);
      setSavingsOverTime(savingsHistory);

      setNeighborhoods(neighborhoodsList);
      setHourlyData(hourly);
      setHourlyCompareData(null);

      setPersonaData(personas);
      setEntryRouteData(entryRoutes);
      setRunningStats(running);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      console.timeEnd('DashboardLoad');
    }
  };

  /**
   * Lightweight filter re-query — only re-fetches the hourly chart data.
   * KPI cards remain fixed to global authority-wide numbers.
   */
  const loadFiltered = useCallback(async (f: DashboardFilters) => {
    console.time('FilteredLoad');
    setFilterLoading(true);
    try {
      const dateRange = getDateRangeForFilter(f.timeRange);

      const primaryIds = await getFilteredUserIds(authorityId, f);
      const compareIds = f.compareNeighborhoodId
        ? await getFilteredUserIds(authorityId, { ...f, neighborhoodId: f.compareNeighborhoodId })
        : null;

      const [hourly, hourlyCompare, filteredRunning] = await Promise.all([
        getActivityByHour(primaryIds, dateRange),
        compareIds ? getActivityByHour(compareIds, dateRange) : Promise.resolve(null),
        getRunningStats(authorityId, primaryIds, dateRange),
      ]);

      setHourlyData(hourly);
      setHourlyCompareData(hourlyCompare);
      setRunningStats(filteredRunning);
    } catch (error) {
      console.error('Error loading filtered data:', error);
    } finally {
      setFilterLoading(false);
      console.timeEnd('FilteredLoad');
    }
  }, [authorityId]);

  const loadNotifications = async () => {
    try {
      const notifs = await getManagerNotifications(authorityId, 10);
      setNotifications(notifs);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const handleSendEncouragement = async () => {
    if (!selectedNotification || !currentUserId || !encouragementTitle || !encouragementMessage) {
      return;
    }

    setSendingPush(true);
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(currentUserId);
      const adminName = userProfile?.core?.name || 'מנהל רשות';

      await sendEncouragementPush(authorityId, {
        title: encouragementTitle,
        message: encouragementMessage,
        parkId: selectedNotification.parkId,
        targetAudience: 'all',
        sentBy: {
          adminId: currentUserId,
          adminName,
        },
      });

      // Refresh notifications
      await loadNotifications();
      setShowEncouragementModal(false);
      setSelectedNotification(null);
      setEncouragementTitle('');
      setEncouragementMessage('');
    } catch (error) {
      console.error('Error sending encouragement:', error);
      alert('שגיאה בשליחת הודעת עידוד');
    } finally {
      setSendingPush(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען נתונים...</div>;
  }

  // Prepare chart data
  const genderChartData = genderData
    ? [
        { name: 'גברים', value: genderData.male },
        { name: 'נשים', value: genderData.female },
        { name: 'אחר', value: genderData.other },
      ]
    : [];

  const ageChartData = ageData
    ? [
        { name: '18-25', value: ageData['18-25'] },
        { name: '26-35', value: ageData['26-35'] },
        { name: '36-45', value: ageData['36-45'] },
        { name: '46-55', value: ageData['46-55'] },
        { name: '56+', value: ageData['56+'] },
      ]
    : [];

  // Total users from any available source
  const totalUsers = genderData?.total ?? ageData?.total ?? 0;

  // Dynamic title reflecting active filters
  function buildHourlyTitle(
    f: DashboardFilters,
    hoods: { id: string; name: string }[]
  ): string {
    const parts: string[] = ['פעילות לפי שעה ביום'];
    const tags: string[] = [];
    if (f.gender === 'female') tags.push('נשים');
    else if (f.gender === 'male') tags.push('גברים');
    if (f.neighborhoodId !== 'all') {
      const n = hoods.find(h => h.id === f.neighborhoodId);
      if (n) tags.push(n.name);
    }
    const timeLabels: Record<string, string> = { day: 'היום', week: 'השבוע', month: 'החודש', year: 'השנה' };
    tags.push(timeLabels[f.timeRange]);
    if (tags.length > 0) parts.push(`— ${tags.join(', ')}`);
    return parts.join(' ');
  }

  return (
    <div className="space-y-6">

      {/* ── Health ROI Hero Banner — the "Money Shot" ────────────────── */}
      {healthSavings ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-green-700 via-emerald-600 to-teal-500 rounded-2xl p-8 text-white shadow-xl" dir="rtl">
          {/* Decorative glow */}
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex items-start justify-between flex-wrap gap-6">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Heart size={20} className="text-white" />
                </div>
                <span className="text-sm font-black text-white/90 uppercase tracking-wider">החזר השקעה בריאותי — שדרות</span>
              </div>
              <div className="text-6xl font-black tabular-nums leading-none">
                ₪{healthSavings.estimatedMonthlySavings.toLocaleString()}
              </div>
              <div className="text-base text-white/70 mt-2 font-semibold">חיסכון חודשי מוערך בהוצאות בריאות</div>
            </div>
            <div className="flex flex-col gap-3 text-right min-w-[200px]">
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-4 border border-white/10">
                <div className="text-3xl font-black tabular-nums">₪{healthSavings.estimatedYearlySavings.toLocaleString()}</div>
                <div className="text-xs text-white/70 font-semibold">חיסכון שנתי מוערך</div>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-4 border border-white/10">
                <div className="flex items-baseline gap-1.5">
                  <div className="text-3xl font-black tabular-nums">{healthSavings.activeUsers}</div>
                  <div className="text-sm font-bold text-white/60">/ {healthSavings.totalUsers}</div>
                </div>
                <div className="text-xs text-white/70 font-semibold">עומדים ביעד 150 דק׳ WHO בשבוע</div>
              </div>
            </div>
          </div>
          <p className="relative text-[11px] text-white/50 mt-5 leading-relaxed">
            * מבוסס על מודל ה-WHO: ₪500 חיסכון חודשי לאדם המבצע 150+ דקות פעילות גופנית בשבוע. מודל אקדמי לצורכי הצגה בלבד.
          </p>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-green-700 via-emerald-600 to-teal-500 rounded-2xl p-8 text-white shadow-xl animate-pulse">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Heart size={20} className="text-white" />
            </div>
            <span className="text-sm font-black text-white/80">מחשב החזר השקעה בריאותי...</span>
          </div>
          <div className="h-14 bg-white/20 rounded-lg w-56" />
        </div>
      )}

      {/* Manager Notifications */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-6 border-2 border-yellow-300">
          <div className="flex items-center gap-3 mb-4">
            <Bell size={24} className="text-yellow-600" />
            <h3 className="text-xl font-bold text-gray-900">התראות והישגים</h3>
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 3).map((notif) => (
              <div
                key={notif.id}
                className="bg-white rounded-lg p-4 border border-yellow-200 flex items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={18} className="text-yellow-600" />
                    <h4 className="font-bold text-gray-900">{notif.title}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{notif.message}</p>
                  {notif.savingsAmount && (
                    <p className="text-lg font-black text-green-600">
                      ₪{notif.savingsAmount.toLocaleString()}
                    </p>
                  )}
                </div>
                {!notif.actionTaken && (
                  <button
                    onClick={() => {
                      setSelectedNotification(notif);
                      setShowEncouragementModal(true);
                      setEncouragementTitle(`כל הכבוד על ההישג! 🎉`);
                      setEncouragementMessage(
                        notif.parkName
                          ? `תושבי ${notif.parkName} - אתם עושים עבודה מצוינת! המשיכו כך! 💪`
                          : `תושבי הרשות - אתם עושים עבודה מצוינת! המשיכו כך! 💪`
                      );
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 transition-colors whitespace-nowrap"
                  >
                    <Send size={16} />
                    שלח עידוד
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* DAU */}
        <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-6 border border-cyan-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">משתמשים פעילים יומיים</span>
            <TrendingUp size={20} className="text-cyan-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{dau}</div>
          {indexBuilding && dau === 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-semibold bg-amber-50 rounded-lg px-2 py-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              אינדקס Firestore בבנייה — נתונים זמניים
            </div>
          )}
        </div>

        {/* MAU */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">משתמשים פעילים חודשיים</span>
            <Users size={20} className="text-purple-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{mau}</div>
          {indexBuilding && mau === 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-semibold bg-amber-50 rounded-lg px-2 py-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              אינדקס בבנייה
            </div>
          )}
        </div>

        {/* Total Users */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">סה"כ משתמשים רשומים</span>
            <Calendar size={20} className="text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{totalUsers}</div>
        </div>

        {/* WHO 150-Min Tracker */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">יעד WHO 150 דק'/שבוע</span>
            <Target size={20} className="text-blue-600" />
          </div>
          {whoTracker ? (
            <>
              <div className="text-3xl font-black text-gray-900">
                {whoTracker.percentageReachingGoal.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {whoTracker.usersReachingGoal} מתוך {whoTracker.totalUsers} משתמשים
              </div>
            </>
          ) : (
            <div className="text-3xl font-black text-gray-300 animate-pulse">—</div>
          )}
        </div>
      </div>

      {/* ── Cross-Reference Filter Bar ─────────────────────────────────── */}
      <FilterBar
        filters={filters}
        neighborhoods={neighborhoods}
        onChange={setFilters}
      />

      {/* Activity by Hour Chart (responds to filters) */}
      <div className="relative">
        {filterLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
            <span className="text-sm font-bold text-gray-400 animate-pulse">מעדכן...</span>
          </div>
        )}
        <ActivityByHourChart
          data={hourlyData}
          compareData={hourlyCompareData}
          title={buildHourlyTitle(filters, neighborhoods)}
          primaryLabel={
            filters.neighborhoodId !== 'all'
              ? neighborhoods.find(n => n.id === filters.neighborhoodId)?.name ?? 'שכונה ראשית'
              : 'כל העיר'
          }
          compareLabel={
            filters.compareNeighborhoodId
              ? neighborhoods.find(n => n.id === filters.compareNeighborhoodId)?.name ?? 'השוואה'
              : 'השוואה'
          }
        />
      </div>

      {/* ── Section: Personas & Entry Routes ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Entry Route Donut */}
        {entryRouteData && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
            <div className="flex items-center gap-2 mb-4">
              <Route size={20} className="text-cyan-600" />
              <h3 className="text-lg font-black text-gray-900">נתיב כניסה לאפליקציה</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'תוכנית מלאה', value: entryRouteData.FULL_PROGRAM },
                    { name: 'ריצה', value: entryRouteData.RUNNING },
                    { name: 'מפה בלבד', value: entryRouteData.MAP_ONLY },
                    ...(entryRouteData.unknown > 0 ? [{ name: 'לא ידוע', value: entryRouteData.unknown }] : []),
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  dataKey="value"
                >
                  <Cell fill="#00AEEF" />
                  <Cell fill="#10B981" />
                  <Cell fill="#F59E0B" />
                  {entryRouteData.unknown > 0 && <Cell fill="#94A3B8" />}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Persona Horizontal Bar */}
        {personaData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-purple-600" />
              <h3 className="text-lg font-black text-gray-900">התפלגות פרסונות</h3>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={personaData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12, fontWeight: 700 }} width={75} />
                <Tooltip formatter={(v: number) => [v, 'משתמשים']} />
                <Bar dataKey="count" fill="#A855F7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              * משתמש יכול להשתייך ליותר מפרסונה אחת
            </p>
          </div>
        )}
      </div>

      {/* Gender + Age Demographics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {genderChartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
            <h3 className="text-lg font-black text-gray-900 mb-4">התפלגות מגדרית</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={genderChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  dataKey="value"
                >
                  {genderChartData.map((_, index) => (
                    <Cell key={`g-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {ageChartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
            <h3 className="text-lg font-black text-gray-900 mb-4">התפלגות גילאים</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ageChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#00AEEF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Section: Activity & Running Stats ─────────────────────────── */}

      {/* Activity Trend */}
      {activityTrend.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
          <h3 className="text-lg font-black text-gray-900 mb-4">מגמת פעילות (30 יום אחרונים)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={activityTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="dau" stroke="#00AEEF" strokeWidth={2} name="משתמשים פעילים יומיים" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Running KPI + Target Distance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total City Mileage KPI */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200 flex flex-col justify-center" dir="rtl">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-green-100 rounded-xl">
              <Footprints size={24} className="text-green-600" />
            </div>
            <div>
              <span className="text-sm font-bold text-gray-500">ק"מ עירוניים (ריצה + הליכה)</span>
              {filters.gender !== 'all' || filters.neighborhoodId !== 'all' ? (
                <div className="text-[10px] text-green-600 font-semibold">מסונן לפי הפילטרים הפעילים</div>
              ) : null}
            </div>
          </div>
          <div className="text-5xl font-black text-gray-900 tabular-nums">
            {runningStats ? runningStats.totalCityKm.toLocaleString() : '—'}
          </div>
          <div className="text-sm text-gray-500 mt-1">ק"מ סה"כ</div>
        </div>

        {/* Target Distance Distribution */}
        {runningStats && runningStats.targetDistribution.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
            <div className="flex items-center gap-2 mb-4">
              <Target size={20} className="text-green-600" />
              <h3 className="text-lg font-black text-gray-900">התפלגות מרחק יעד</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={runningStats.targetDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, 'רצים']} />
                <Bar dataKey="count" fill="#10B981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Section: Neighborhood & Maintenance ─────────────────────── */}

      <NeighborhoodBreakdown data={neighborhoodBreakdown} loading={loading} />

      {/* Savings Over Time */}
      {savingsOverTime.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6" dir="rtl">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={20} className="text-green-600" />
            <h3 className="text-lg font-black text-gray-900">חיסכון בעלויות בריאות לאורך זמן</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={savingsOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => [`₪${value.toLocaleString()}`, 'חיסכון']}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="savings"
                stroke="#10B981"
                strokeWidth={3}
                name="חיסכון (₪)"
                dot={{ fill: '#10B981', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Popular Parks */}
      {popularParks.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={20} className="text-gray-600" />
            <h3 className="text-lg font-bold text-gray-900">פארקים פופולריים</h3>
          </div>
          <div className="space-y-3">
            {popularParks.map((park, index) => (
              <div
                key={park.parkId}
                className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{park.parkName}</div>
                    <div className="text-sm text-gray-500">{park.checkInCount} ביקורים</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parks Heatmap Placeholder */}
      {parks.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Map size={20} className="text-gray-600" />
            <h3 className="text-lg font-bold text-gray-900">מפת פארקים</h3>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {parks.map((park) => (
              <div
                key={park.id}
                className="bg-white rounded-lg p-4 border-2 border-gray-200 hover:border-cyan-400 transition-colors cursor-pointer"
                title={`${park.name} - ${park.city}`}
              >
                <div className="text-center">
                  <MapPin size={24} className="text-cyan-500 mx-auto mb-2" />
                  <div className="text-xs font-bold text-gray-900 truncate">{park.name}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{park.city}</div>
                  {park.status && (
                    <div className={`mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      park.status === 'open' ? 'bg-green-100 text-green-700' :
                      park.status === 'under_repair' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {park.status === 'open' ? 'פתוח' :
                       park.status === 'under_repair' ? 'בתיקון' : 'סגור'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            לחץ על פארק לפרטים נוספים
          </p>
        </div>
      )}

      {/* Privacy Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>🔒 פרטיות:</strong> כל הנתונים המוצגים כאן הם מצטברים ואנונימיים בלבד.
          אין גישה למידע אישי מזהה (PII) של משתמשים.
        </p>
      </div>

      {/* Encouragement Modal */}
      {showEncouragementModal && selectedNotification && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">שלח הודעת עידוד</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">כותרת</label>
                <input
                  type="text"
                  value={encouragementTitle}
                  onChange={(e) => setEncouragementTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                  placeholder="כותרת ההודעה"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">תוכן ההודעה</label>
                <textarea
                  value={encouragementMessage}
                  onChange={(e) => setEncouragementMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                  placeholder="תוכן ההודעה"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSendEncouragement}
                  disabled={sendingPush || !encouragementTitle || !encouragementMessage}
                  className="flex-1 px-6 py-3 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  {sendingPush ? 'שולח...' : 'שלח'}
                </button>
                <button
                  onClick={() => {
                    setShowEncouragementModal(false);
                    setSelectedNotification(null);
                    setEncouragementTitle('');
                    setEncouragementMessage('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
