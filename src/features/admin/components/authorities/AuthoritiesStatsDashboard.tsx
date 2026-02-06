'use client';

import { useMemo, useState } from 'react';
import { 
  TrendingUp, 
  AlertCircle, 
  Target, 
  CheckCircle, 
  Users,
  Clock,
  Wallet,
  CalendarDays,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Authority, hasOverdueTasks, hasOverdueInstallments, PipelineStatus, formatMonthHebrew } from '@/types/admin-types';

interface AuthoritiesStatsDashboardProps {
  authorities: Authority[];
  onFilterByAuthorityIds?: (authorityIds: string[]) => void;
}

// Authority contribution to a month's forecast
interface MonthContributor {
  id: string;
  name: string;
  amount: number;
}

// Enhanced month forecast with contributor details
interface MonthForecast {
  month: string;
  totalAmount: number;
  contributors: MonthContributor[];
}

interface StatCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

export default function AuthoritiesStatsDashboard({ authorities, onFilterByAuthorityIds }: AuthoritiesStatsDashboardProps) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const stats = useMemo(() => {
    // Filter only top-level authorities (cities, regional councils)
    const topLevel = authorities.filter(a => !a.parentAuthorityId);
    
    // Count by pipeline status
    const byStatus = topLevel.reduce((acc, auth) => {
      const status = auth.pipelineStatus || 'lead';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<PipelineStatus, number>);
    
    // Count overdue tasks
    const overdueCount = topLevel.filter(hasOverdueTasks).length;
    
    // Count overdue installments
    const overdueInstallmentsCount = topLevel.filter(hasOverdueInstallments).length;
    
    // Count closing soon (follow_up + closing statuses)
    const closingSoon = (byStatus['follow_up'] || 0) + (byStatus['closing'] || 0);
    
    // Count total leads (lead + meeting + quote)
    const totalLeads = (byStatus['lead'] || 0) + (byStatus['meeting'] || 0) + (byStatus['quote'] || 0);
    
    // Count active clients
    const activeClients = topLevel.filter(a => a.isActiveClient).length;
    
    // Count all open tasks
    const openTasks = topLevel.reduce((acc, auth) => {
      const openCount = auth.tasks?.filter(t => t.status !== 'done' && t.status !== 'cancelled').length || 0;
      return acc + openCount;
    }, 0);

    // Calculate monthly revenue forecast with contributor details
    const monthlyForecastMap = new Map<string, MonthForecast>();
    for (const auth of topLevel) {
      if (auth.financials?.installments) {
        for (const inst of auth.financials.installments) {
          if (inst.status === 'pending' && inst.targetMonth) {
            const existing = monthlyForecastMap.get(inst.targetMonth);
            if (existing) {
              // Check if this authority already contributed
              const existingContributor = existing.contributors.find(c => c.id === auth.id);
              if (existingContributor) {
                existingContributor.amount += inst.amount;
              } else {
                existing.contributors.push({
                  id: auth.id,
                  name: auth.name,
                  amount: inst.amount,
                });
              }
              existing.totalAmount += inst.amount;
            } else {
              monthlyForecastMap.set(inst.targetMonth, {
                month: inst.targetMonth,
                totalAmount: inst.amount,
                contributors: [{
                  id: auth.id,
                  name: auth.name,
                  amount: inst.amount,
                }],
              });
            }
          }
        }
      }
    }
    
    // Sort by month and take next 6 months
    const sortedForecast: MonthForecast[] = [...monthlyForecastMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(0, 6);

    // Total pending revenue
    const totalPendingRevenue = sortedForecast.reduce((sum, forecast) => sum + forecast.totalAmount, 0);

    return {
      closingSoon,
      overdueCount,
      overdueInstallmentsCount,
      totalLeads,
      activeClients,
      openTasks,
      byStatus,
      monthlyForecast: sortedForecast,
      totalPendingRevenue,
    };
  }, [authorities]);

  // Handle clicking on a month card to filter
  const handleMonthClick = (forecast: MonthForecast) => {
    if (onFilterByAuthorityIds) {
      const authorityIds = forecast.contributors.map(c => c.id);
      onFilterByAuthorityIds(authorityIds);
    }
  };

  // Toggle expanded view for a month
  const toggleExpandedMonth = (month: string) => {
    setExpandedMonth(prev => prev === month ? null : month);
  };

  const cards: StatCard[] = [
    {
      label: 'קרובים לסגירה',
      value: stats.closingSoon,
      icon: <Target size={24} />,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
    },
    {
      label: 'משימות באיחור',
      value: stats.overdueCount,
      icon: <AlertCircle size={24} />,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    {
      label: 'תשלומים באיחור',
      value: stats.overdueInstallmentsCount,
      icon: <Wallet size={24} />,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-200',
    },
    {
      label: 'לידים פעילים',
      value: stats.totalLeads,
      icon: <TrendingUp size={24} />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      label: 'לקוחות פעילים',
      value: stats.activeClients,
      icon: <CheckCircle size={24} />,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      label: 'משימות פתוחות',
      value: stats.openTasks,
      icon: <Clock size={24} />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Monthly Revenue Forecast */}
      {stats.monthlyForecast.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays size={20} className="text-emerald-600" />
            <h3 className="font-bold text-emerald-800">תחזית הכנסות חודשית</h3>
            <span className="mr-auto text-sm font-medium text-emerald-600">
              סה"כ צפוי: ₪{stats.totalPendingRevenue.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {stats.monthlyForecast.map((forecast) => {
              const isExpanded = expandedMonth === forecast.month;
              const visibleContributors = isExpanded ? forecast.contributors : forecast.contributors.slice(0, 3);
              const hiddenCount = forecast.contributors.length - 3;
              const hasMore = forecast.contributors.length > 3;

              return (
                <div 
                  key={forecast.month}
                  className={`bg-white/80 border border-emerald-200 rounded-lg px-3 py-2 transition-all ${
                    onFilterByAuthorityIds ? 'cursor-pointer hover:border-emerald-400 hover:shadow-sm' : ''
                  }`}
                  onClick={() => handleMonthClick(forecast)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700">{formatMonthHebrew(forecast.month)}:</span>
                    <span className="text-lg font-bold text-emerald-900">₪{forecast.totalAmount.toLocaleString()}</span>
                  </div>
                  
                  {/* Authority Tags */}
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    {visibleContributors.map((contributor) => (
                      <span
                        key={contributor.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200"
                        title={`₪${contributor.amount.toLocaleString()}`}
                      >
                        {contributor.name}
                      </span>
                    ))}
                    
                    {/* +X more button */}
                    {hasMore && !isExpanded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandedMonth(forecast.month);
                        }}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        +{hiddenCount} עוד
                        <ChevronDown size={12} />
                      </button>
                    )}
                    
                    {/* Collapse button */}
                    {hasMore && isExpanded && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandedMonth(forecast.month);
                        }}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        הסתר
                        <ChevronUp size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`${card.bgColor} ${card.borderColor} border rounded-xl p-4 transition-transform hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.label}</p>
                <p className={`text-3xl font-black mt-1 ${card.color}`}>{card.value}</p>
              </div>
              <div className={`${card.color} opacity-70`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
