'use client';

import { useMemo, useState } from 'react';
import { 
  TrendingUp, AlertCircle, Target, CheckCircle, Clock, Wallet,
  CalendarDays, ChevronDown, ChevronUp, DollarSign, BarChart3,
  Hourglass, Percent, ToggleLeft, ToggleRight, Landmark,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Authority, hasOverdueTasks, hasOverdueInstallments,
  PipelineStatus, formatMonthHebrew, getInstallmentsSum,
} from '@/types/admin-types';
// Migration utility removed — migration complete

// ============================================================================
// Types
// ============================================================================

interface AuthoritiesStatsDashboardProps {
  authorities: Authority[];
  onFilterByAuthorityIds?: (authorityIds: string[]) => void;
  onStatCardFilter?: (filterKey: StatCardFilterKey | null) => void;
  activeStatFilter?: StatCardFilterKey | null;
}

export type StatCardFilterKey =
  | 'closingSoon' | 'overdueTasks' | 'overdueInstallments'
  | 'activeLeads' | 'activeClients' | 'openTasks'
  | 'pipelineValue' | 'contractGap' | 'annualRevenue';

interface MonthContributor { id: string; name: string; amount: number; }

interface MonthForecast {
  month: string; totalAmount: number; paidAmount: number; pendingAmount: number;
  contributors: MonthContributor[];
}

interface YearForecast {
  year: string; totalAmount: number; paidAmount: number; pendingAmount: number;
  months: MonthForecast[]; contributors: MonthContributor[];
}

interface StatCard {
  key: StatCardFilterKey; label: string; value: number | string; subtitle?: string;
  icon: React.ReactNode; color: string; bgColor: string; borderColor: string;
  activeRingColor: string; isCurrency?: boolean;
}

// ============================================================================
// Color themes keyed by active filter
// ============================================================================
interface ForecastTheme {
  gradient: string; border: string; headerText: string;
  paidBar: string; pendingBar: string; gridStroke: string;
  axisFill: string; tileBg: string; tileBorder: string;
  tileText: string; tileBoldText: string; chipBg: string;
  chipText: string; chipBorder: string; legendPaidBg: string;
}

const THEMES: Record<string, ForecastTheme> = {
  default: {
    gradient: 'from-emerald-50 to-teal-50', border: 'border-emerald-200',
    headerText: 'text-emerald-800', paidBar: '#059669', pendingBar: '#fbbf24',
    gridStroke: '#d1fae5', axisFill: '#065f46',
    tileBg: 'bg-white/80', tileBorder: 'border-emerald-200', tileText: 'text-emerald-700',
    tileBoldText: 'text-emerald-900', chipBg: 'bg-emerald-100', chipText: 'text-emerald-700',
    chipBorder: 'border-emerald-200', legendPaidBg: 'bg-emerald-600',
  },
  pipelineValue: {
    gradient: 'from-indigo-50 to-blue-50', border: 'border-indigo-200',
    headerText: 'text-indigo-800', paidBar: '#4f46e5', pendingBar: '#818cf8',
    gridStroke: '#e0e7ff', axisFill: '#312e81',
    tileBg: 'bg-white/80', tileBorder: 'border-indigo-200', tileText: 'text-indigo-700',
    tileBoldText: 'text-indigo-900', chipBg: 'bg-indigo-100', chipText: 'text-indigo-700',
    chipBorder: 'border-indigo-200', legendPaidBg: 'bg-indigo-600',
  },
  contractGap: {
    gradient: 'from-amber-50 to-yellow-50', border: 'border-amber-200',
    headerText: 'text-amber-800', paidBar: '#d97706', pendingBar: '#fbbf24',
    gridStroke: '#fef3c7', axisFill: '#78350f',
    tileBg: 'bg-white/80', tileBorder: 'border-amber-200', tileText: 'text-amber-700',
    tileBoldText: 'text-amber-900', chipBg: 'bg-amber-100', chipText: 'text-amber-700',
    chipBorder: 'border-amber-200', legendPaidBg: 'bg-amber-600',
  },
  annualRevenue: {
    gradient: 'from-emerald-50 to-green-50', border: 'border-emerald-300',
    headerText: 'text-emerald-800', paidBar: '#047857', pendingBar: '#34d399',
    gridStroke: '#d1fae5', axisFill: '#064e3b',
    tileBg: 'bg-white/80', tileBorder: 'border-emerald-300', tileText: 'text-emerald-700',
    tileBoldText: 'text-emerald-900', chipBg: 'bg-emerald-100', chipText: 'text-emerald-700',
    chipBorder: 'border-emerald-200', legendPaidBg: 'bg-emerald-700',
  },
};

// Which filters scope the forecast to a subset of authorities
const FINANCIAL_FILTERS: StatCardFilterKey[] = ['pipelineValue', 'contractGap', 'annualRevenue', 'activeClients'];
const SALES_STAGES: PipelineStatus[] = ['meeting', 'quote', 'follow_up', 'closing'];

// ============================================================================
// Helpers: build forecast from an authority subset
// ============================================================================

function buildForecastFromAuthorities(auths: Authority[]) {
  const monthlyMap = new Map<string, MonthForecast>();
  for (const auth of auths) {
    if (!auth.financials?.installments) continue;
    for (const inst of auth.financials.installments) {
      if (!inst.targetMonth) continue;
      const isPaid = inst.status === 'paid';
      const existing = monthlyMap.get(inst.targetMonth);
      if (existing) {
        const ec = existing.contributors.find(c => c.id === auth.id);
        if (ec) ec.amount += inst.amount; else existing.contributors.push({ id: auth.id, name: auth.name, amount: inst.amount });
        existing.totalAmount += inst.amount;
        if (isPaid) existing.paidAmount += inst.amount; else existing.pendingAmount += inst.amount;
      } else {
        monthlyMap.set(inst.targetMonth, {
          month: inst.targetMonth, totalAmount: inst.amount,
          paidAmount: isPaid ? inst.amount : 0, pendingAmount: isPaid ? 0 : inst.amount,
          contributors: [{ id: auth.id, name: auth.name, amount: inst.amount }],
        });
      }
    }
  }
  const all: MonthForecast[] = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const sorted = all.slice(0, 18);
  const totalPending = all.reduce((s, f) => s + f.pendingAmount, 0);
  const totalCollected = all.reduce((s, f) => s + f.paidAmount, 0);

  // Yearly
  const yearMap = new Map<string, YearForecast>();
  for (const f of all) {
    const yr = f.month.split('-')[0];
    const ex = yearMap.get(yr);
    if (ex) {
      ex.totalAmount += f.totalAmount; ex.paidAmount += f.paidAmount; ex.pendingAmount += f.pendingAmount;
      ex.months.push(f);
      for (const c of f.contributors) { const ec = ex.contributors.find(x => x.id === c.id); if (ec) ec.amount += c.amount; else ex.contributors.push({ ...c }); }
    } else {
      yearMap.set(yr, { year: yr, totalAmount: f.totalAmount, paidAmount: f.paidAmount, pendingAmount: f.pendingAmount, months: [f], contributors: f.contributors.map(c => ({ ...c })) });
    }
  }
  const yearly = [...yearMap.values()].sort((a, b) => a.year.localeCompare(b.year));

  const chartMonthly = sorted.map(f => ({ name: formatMonthHebrew(f.month).split(' ')[0], fullName: formatMonthHebrew(f.month), paid: f.paidAmount, pending: f.pendingAmount, amount: f.totalAmount, contributors: f.contributors }));
  const chartYearly = yearly.map(f => ({ name: f.year, fullName: f.year, paid: f.paidAmount, pending: f.pendingAmount, amount: f.totalAmount, contributors: f.contributors }));

  return { monthly: sorted, yearly, chartMonthly, chartYearly, totalPending, totalCollected };
}

// ============================================================================
// Component
// ============================================================================

export default function AuthoritiesStatsDashboard({
  authorities, onFilterByAuthorityIds, onStatCardFilter, activeStatFilter,
}: AuthoritiesStatsDashboardProps) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [forecastView, setForecastView] = useState<'monthly' | 'yearly'>('monthly');

  // ── KPI stats (always computed from ALL authorities) ────────────
  const stats = useMemo(() => {
    const topLevel = authorities.filter(a => !a.parentAuthorityId);
    const activePipeline = topLevel.filter(a => (a.pipelineStatus || 'lead') !== 'draft');

    const byStatus = activePipeline.reduce((acc, a) => {
      const s = a.pipelineStatus || 'lead'; acc[s] = (acc[s] || 0) + 1; return acc;
    }, {} as Record<PipelineStatus, number>);

    const overdueCount = topLevel.filter(hasOverdueTasks).length;
    const overdueInstallmentsCount = topLevel.filter(hasOverdueInstallments).length;
    const closingSoon = (byStatus['follow_up'] || 0) + (byStatus['closing'] || 0);
    const totalLeads = (byStatus['lead'] || 0) + (byStatus['meeting'] || 0) + (byStatus['quote'] || 0);
    const activeClients = activePipeline.filter(a => a.isActiveClient).length;
    const openTasks = topLevel.reduce((acc, a) => acc + (a.tasks?.filter(t => t.status !== 'done' && t.status !== 'cancelled').length || 0), 0);

    const pipelineValue = topLevel
      .filter(a => !a.isActiveClient && SALES_STAGES.includes(a.pipelineStatus || 'lead') && (a.financials?.totalQuoteAmount || 0) > 0)
      .reduce((s, a) => s + (a.financials?.totalQuoteAmount || 0), 0);

    const contractBalanceGap = topLevel.filter(a => a.isActiveClient && a.financials).reduce((s, a) => {
      const q = a.financials?.totalQuoteAmount || 0;
      const sched = a.financials?.installments ? getInstallmentsSum(a.financials.installments) : 0;
      return s + Math.max(0, q - sched);
    }, 0);

    // Lead Health
    const now = new Date();
    let totalDays = 0, leadsWithDates = 0;
    for (const a of activePipeline) {
      let d: Date | null = null;
      if (a.activityLog?.length) { const sorted = [...a.activityLog].sort((x, y) => { const da = x.createdAt instanceof Date ? x.createdAt : new Date(x.createdAt as any); const db2 = y.createdAt instanceof Date ? y.createdAt : new Date(y.createdAt as any); return db2.getTime() - da.getTime(); }); const raw = sorted[0].createdAt; d = raw instanceof Date ? raw : new Date(raw as any); }
      else if (a.updatedAt) d = a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt as any);
      else if (a.createdAt) d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as any);
      if (d && !isNaN(d.getTime())) { totalDays += Math.floor((now.getTime() - d.getTime()) / 864e5); leadsWithDates++; }
    }
    const avgDaysInStatus = leadsWithDates > 0 ? Math.round(totalDays / leadsWithDates) : 0;
    const totalWithQuotes = activePipeline.filter(a => a.isActiveClient || a.pipelineStatus === 'quote' || a.pipelineStatus === 'follow_up' || a.pipelineStatus === 'closing' || a.pipelineStatus === 'upsell').length;
    const conversionRate = totalWithQuotes > 0 ? Math.round((activeClients / totalWithQuotes) * 100) : 0;

    // Annual Revenue
    const currentYear = String(now.getFullYear());
    let annualRevenue = 0, annualPaid = 0, annualPending = 0;
    for (const a of topLevel) {
      if (a.financials?.installments) {
        for (const i of a.financials.installments) {
          if (i.targetMonth?.startsWith(currentYear)) { annualRevenue += i.amount; if (i.status === 'paid') annualPaid += i.amount; else annualPending += i.amount; }
        }
      }
    }

    return { closingSoon, overdueCount, overdueInstallmentsCount, totalLeads, activeClients, openTasks, pipelineValue, contractBalanceGap, avgDaysInStatus, conversionRate, annualRevenue, annualPaid, annualPending, currentYear };
  }, [authorities]);

  // ── Filtered forecast: scoped to matching authorities ───────────
  const forecastData = useMemo(() => {
    const topLevel = authorities.filter(a => !a.parentAuthorityId);

    // Determine which authorities contribute to the forecast
    let forecastAuthorities: Authority[];

    if (!activeStatFilter || !FINANCIAL_FILTERS.includes(activeStatFilter)) {
      // Default: all authorities
      forecastAuthorities = topLevel;
    } else {
      switch (activeStatFilter) {
        case 'pipelineValue':
          forecastAuthorities = topLevel.filter(a => !a.isActiveClient && SALES_STAGES.includes(a.pipelineStatus || 'lead') && (a.financials?.totalQuoteAmount || 0) > 0);
          break;
        case 'contractGap':
          forecastAuthorities = topLevel.filter(a => {
            if (!a.isActiveClient || !a.financials) return false;
            const q = a.financials.totalQuoteAmount || 0;
            const sched = a.financials.installments ? getInstallmentsSum(a.financials.installments) : 0;
            return (q - sched) > 0;
          });
          break;
        case 'annualRevenue': {
          const yr = String(new Date().getFullYear());
          forecastAuthorities = topLevel.filter(a => a.financials?.installments?.some(i => i.targetMonth?.startsWith(yr)));
          break;
        }
        case 'activeClients':
          forecastAuthorities = topLevel.filter(a => a.isActiveClient);
          break;
        default:
          forecastAuthorities = topLevel;
      }
    }

    return buildForecastFromAuthorities(forecastAuthorities);
  }, [authorities, activeStatFilter]);

  // ── Active theme ────────────────────────────────────────────────
  const themeKey = (activeStatFilter && THEMES[activeStatFilter]) ? activeStatFilter : 'default';
  const theme = THEMES[themeKey];

  // ── Handlers ────────────────────────────────────────────────────
  const handleMonthClick = (forecast: MonthForecast) => {
    onFilterByAuthorityIds?.(forecast.contributors.map(c => c.id));
  };
  const toggleExpandedMonth = (key: string) => setExpandedMonth(prev => prev === key ? null : key);
  const handleCardClick = (key: StatCardFilterKey) => {
    if (!onStatCardFilter) return;
    onStatCardFilter(activeStatFilter === key ? null : key);
  };

  // ── Card definitions ────────────────────────────────────────────
  const moneyCards: StatCard[] = [
    { key: 'pipelineValue', label: 'שווי צנרת (Pipeline)', value: stats.pipelineValue, subtitle: 'הצעות מחיר ללידים פעילים', icon: <DollarSign size={24} />, color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200', activeRingColor: 'ring-indigo-400', isCurrency: true },
    { key: 'contractGap', label: 'יתרת חוזה (The Gap)', value: stats.contractBalanceGap, subtitle: 'סכום לא מתוזמן ללקוחות פעילים', icon: <BarChart3 size={24} />, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', activeRingColor: 'ring-amber-400', isCurrency: true },
    { key: 'annualRevenue', label: `הכנסה שנתית ${stats.currentYear}`, value: stats.annualRevenue, subtitle: `גבייה: ₪${stats.annualPaid.toLocaleString()} | צפוי: ₪${stats.annualPending.toLocaleString()}`, icon: <Landmark size={24} />, color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300', activeRingColor: 'ring-emerald-400', isCurrency: true },
  ];

  const operationalCards: StatCard[] = [
    { key: 'closingSoon', label: 'קרובים לסגירה', value: stats.closingSoon, icon: <Target size={24} />, color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', activeRingColor: 'ring-orange-400' },
    { key: 'overdueTasks', label: 'משימות באיחור', value: stats.overdueCount, icon: <AlertCircle size={24} />, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200', activeRingColor: 'ring-red-400' },
    { key: 'overdueInstallments', label: 'תשלומים באיחור', value: stats.overdueInstallmentsCount, icon: <Wallet size={24} />, color: 'text-rose-600', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', activeRingColor: 'ring-rose-400' },
    { key: 'activeLeads', label: 'לידים פעילים', value: stats.totalLeads, icon: <TrendingUp size={24} />, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', activeRingColor: 'ring-blue-400' },
    { key: 'activeClients', label: 'לקוחות פעילים', value: stats.activeClients, icon: <CheckCircle size={24} />, color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200', activeRingColor: 'ring-green-400' },
    { key: 'openTasks', label: 'משימות פתוחות', value: stats.openTasks, icon: <Clock size={24} />, color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', activeRingColor: 'ring-purple-400' },
  ];

  const renderStatCard = (card: StatCard) => {
    const isActive = activeStatFilter === card.key;
    return (
      <button key={card.key} onClick={() => handleCardClick(card.key)}
        className={`${card.bgColor} ${card.borderColor} border rounded-xl p-4 transition-all hover:scale-[1.02] text-right w-full ${isActive ? `ring-2 ${card.activeRingColor} shadow-md scale-[1.02]` : ''} ${onStatCardFilter ? 'cursor-pointer' : 'cursor-default'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{card.label}</p>
            <p className={`text-3xl font-black mt-1 ${card.color}`}>{card.isCurrency ? `₪${Number(card.value).toLocaleString()}` : card.value}</p>
            {card.subtitle && <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>}
          </div>
          <div className={`${card.color} opacity-70`}>{card.icon}</div>
        </div>
        {isActive && <p className="text-xs font-bold text-gray-500 mt-2 border-t border-gray-200 pt-1">לחץ שוב לביטול הסינון</p>}
      </button>
    );
  };

  // ── Chart tooltip ───────────────────────────────────────────────
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-[240px]" dir="rtl">
        <p className="font-bold text-gray-900 mb-1">{data.fullName}</p>
        <p className={`font-black text-lg ${theme.tileBoldText}`}>₪{data.amount.toLocaleString()}</p>
        <div className="flex gap-3 text-xs mt-1 mb-2">
          {data.paid > 0 && <span className="font-bold" style={{ color: theme.paidBar }}>שולם: ₪{data.paid.toLocaleString()}</span>}
          {data.pending > 0 && <span className="font-bold" style={{ color: theme.pendingBar }}>צפוי: ₪{data.pending.toLocaleString()}</span>}
        </div>
        {data.contributors?.slice(0, 5).map((c: MonthContributor) => (
          <p key={c.id} className="text-xs text-gray-500">{c.name}: ₪{c.amount.toLocaleString()}</p>
        ))}
        {data.contributors?.length > 5 && <p className="text-xs text-gray-400">+{data.contributors.length - 5} עוד</p>}
      </div>
    );
  };

  const hasForecasts = forecastData.monthly.length > 0;
  const showChart = (forecastView === 'monthly' ? forecastData.chartMonthly.length : forecastData.chartYearly.length) > 1;
  const chartData = forecastView === 'monthly' ? forecastData.chartMonthly : forecastData.chartYearly;

  // Dynamic forecast header title — changes based on active KPI card
  const forecastTitle = useMemo(() => {
    const base = forecastView === 'monthly' ? 'חודשית' : 'שנתית';
    if (!activeStatFilter) return `תחזית הכנסות ${base}`;
    switch (activeStatFilter) {
      case 'pipelineValue': return `הכנסות צנרת צפויות (${base})`;
      case 'contractGap': return `יתרות חוזה — ${base}`;
      case 'annualRevenue': return `הכנסות בפועל ${stats.currentYear} (${base})`;
      case 'activeClients': return `הכנסות לקוחות פעילים (${base})`;
      default: return `תחזית הכנסות ${base}`;
    }
  }, [activeStatFilter, forecastView, stats.currentYear]);

  // Filter chip label (shown next to the title when filter is active)
  const forecastFilterLabel = activeStatFilter && FINANCIAL_FILTERS.includes(activeStatFilter)
    ? { pipelineValue: 'צנרת בלבד', contractGap: 'לקוחות פעילים בלבד', annualRevenue: `שנת ${stats.currentYear} בלבד`, activeClients: 'לקוחות פעילים בלבד' }[activeStatFilter]
    : null;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mb-6">
      {/* Money cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {moneyCards.map(card => renderStatCard(card))}
      </div>

      {/* Revenue Forecast — themed by active filter */}
      {hasForecasts && (
        <div className={`bg-gradient-to-br ${theme.gradient} ${theme.border} border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CalendarDays size={20} className={theme.headerText} />
            <h3 className={`font-bold ${theme.headerText}`}>
              {forecastTitle}
            </h3>
            {forecastFilterLabel && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${theme.chipBg} ${theme.chipText} ${theme.chipBorder} border`}>
                {forecastFilterLabel}
              </span>
            )}
            <div className="mr-auto flex items-center gap-3 text-sm">
              {forecastData.totalCollected > 0 && (
                <span className="flex items-center gap-1 font-bold" style={{ color: theme.paidBar }}>
                  <span className={`w-3 h-3 rounded-sm inline-block ${theme.legendPaidBg}`} /> גבייה: ₪{forecastData.totalCollected.toLocaleString()}
                </span>
              )}
              <span className="flex items-center gap-1 font-bold" style={{ color: theme.pendingBar }}>
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: theme.pendingBar }} /> צפוי: ₪{forecastData.totalPending.toLocaleString()}
              </span>
            </div>
            <button onClick={() => setForecastView(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${theme.border} bg-white text-sm font-bold ${theme.headerText} hover:opacity-80 transition-colors`}>
              {forecastView === 'monthly' ? <><ToggleLeft size={16} /> חודשי</> : <><ToggleRight size={16} /> שנתי</>}
            </button>
          </div>

          {/* Bar chart */}
          {showChart && (
            <div className="bg-white/80 rounded-xl p-3 mb-3 border" style={{ borderColor: theme.gridStroke }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: theme.axisFill }} />
                  <YAxis tick={{ fontSize: 11, fill: theme.axisFill }} tickFormatter={(v: number) => v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v}`} width={60} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="paid" stackId="rev" fill={theme.paidBar} name="שולם" radius={[0, 0, 0, 0]} maxBarSize={60} />
                  <Bar dataKey="pending" stackId="rev" fill={theme.pendingBar} name="צפוי" radius={[6, 6, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly tiles */}
          {forecastView === 'monthly' && (
            <div className="flex flex-wrap gap-3">
              {forecastData.monthly.map((f) => {
                const isExp = expandedMonth === f.month;
                const vis = isExp ? f.contributors : f.contributors.slice(0, 3);
                const more = f.contributors.length - 3;
                return (
                  <div key={f.month} className={`${theme.tileBg} border ${theme.tileBorder} rounded-lg px-3 py-2 transition-all ${onFilterByAuthorityIds ? 'cursor-pointer hover:shadow-sm' : ''}`}
                    onClick={() => handleMonthClick(f)}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${theme.tileText}`}>{formatMonthHebrew(f.month)}:</span>
                      <span className={`text-lg font-bold ${theme.tileBoldText}`}>₪{f.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2 text-xs mt-0.5">
                      {f.paidAmount > 0 && <span className="font-bold" style={{ color: theme.paidBar }}>שולם ₪{f.paidAmount.toLocaleString()}</span>}
                      {f.pendingAmount > 0 && <span className="font-bold" style={{ color: theme.pendingBar }}>צפוי ₪{f.pendingAmount.toLocaleString()}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {vis.map(c => (
                        <span key={c.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${theme.chipBg} ${theme.chipText} border ${theme.chipBorder}`} title={`₪${c.amount.toLocaleString()}`}>{c.name}</span>
                      ))}
                      {more > 0 && !isExp && <button onClick={e => { e.stopPropagation(); toggleExpandedMonth(f.month); }} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">+{more} עוד <ChevronDown size={12} /></button>}
                      {more > 0 && isExp && <button onClick={e => { e.stopPropagation(); toggleExpandedMonth(f.month); }} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">הסתר <ChevronUp size={12} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Yearly tiles */}
          {forecastView === 'yearly' && (
            <div className="flex flex-wrap gap-4">
              {forecastData.yearly.map(yf => {
                const isExp = expandedMonth === yf.year;
                return (
                  <div key={yf.year} className={`${theme.tileBg} border ${theme.tileBorder} rounded-xl p-4 min-w-[250px]`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-lg font-black ${theme.tileBoldText}`}>{yf.year}</span>
                      <span className={`text-xl font-black ${theme.tileText}`}>₪{yf.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex gap-3 text-xs mb-2">
                      {yf.paidAmount > 0 && <span className="font-bold" style={{ color: theme.paidBar }}>שולם: ₪{yf.paidAmount.toLocaleString()}</span>}
                      {yf.pendingAmount > 0 && <span className="font-bold" style={{ color: theme.pendingBar }}>צפוי: ₪{yf.pendingAmount.toLocaleString()}</span>}
                    </div>
                    <div className="space-y-1">
                      {yf.months.slice(0, isExp ? undefined : 4).map(m => (
                        <div key={m.month} className="flex items-center justify-between text-sm">
                          <span className={theme.tileText}>{formatMonthHebrew(m.month)}</span>
                          <span className={`font-bold ${theme.tileBoldText}`}>₪{m.totalAmount.toLocaleString()}</span>
                        </div>
                      ))}
                      {yf.months.length > 4 && <button onClick={() => toggleExpandedMonth(yf.year)} className={`text-xs ${theme.tileText} font-medium`}>{isExp ? 'הסתר' : `+${yf.months.length - 4} חודשים נוספים`}</button>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t" style={{ borderColor: theme.gridStroke }}>
                      {yf.contributors.sort((a, b) => b.amount - a.amount).slice(0, 5).map(c => (
                        <span key={c.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${theme.chipBg} ${theme.chipText} border ${theme.chipBorder}`} title={`₪${c.amount.toLocaleString()}`}>{c.name}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lead Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-xl p-4 border hover:scale-[1.02] transition-transform ${stats.avgDaysInStatus > 14 ? 'bg-red-50 border-red-200' : stats.avgDaysInStatus > 7 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">ממוצע ימים בסטטוס</p>
              <p className={`text-3xl font-black mt-1 ${stats.avgDaysInStatus > 14 ? 'text-red-600' : stats.avgDaysInStatus > 7 ? 'text-amber-600' : 'text-green-600'}`}>{stats.avgDaysInStatus} ימים</p>
              <p className="text-xs text-gray-500 mt-1">זמן ממוצע מאז פעילות אחרונה (ללא טיוטות)</p>
            </div>
            <Hourglass size={24} className="opacity-70" />
          </div>
        </div>
        <div className={`rounded-xl p-4 border hover:scale-[1.02] transition-transform ${stats.conversionRate >= 40 ? 'bg-green-50 border-green-200' : stats.conversionRate >= 20 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">שיעור המרה (Conversion)</p>
              <p className={`text-3xl font-black mt-1 ${stats.conversionRate >= 40 ? 'text-green-600' : stats.conversionRate >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{stats.conversionRate}%</p>
              <p className="text-xs text-gray-500 mt-1">מהצעת מחיר ללקוח פעיל (ללא טיוטות)</p>
            </div>
            <Percent size={24} className="opacity-70" />
          </div>
        </div>
      </div>

      {/* Operational Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {operationalCards.map(card => renderStatCard(card))}
      </div>

    </div>
  );
}
