'use client';

import { TrendingUp, TrendingDown, Users, Building2, Target, Activity, Shield, Briefcase } from 'lucide-react';
import { ExecutiveSummary as ExecutiveSummaryData } from '@/features/admin/services/cpo-analytics.service';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData;
  loading?: boolean;
}

export default function ExecutiveSummary({ data, loading }: ExecutiveSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-32"></div>
          </div>
        ))}
      </div>
    );
  }

  // Safe access with fallbacks to prevent undefined errors
  const totalUsers = data?.totalUsers || 0;
  const activeAuthorities = data?.activeAuthorities || 0;
  const activeClients = data?.activeClients || 0;
  const weeklyGrowthPercent = data?.weeklyGrowthPercent || 0;
  const overallCompletionRate = data?.overallCompletionRate || 0;
  const totalPlatformAdmins = data?.totalPlatformAdmins || 0;

  const metrics = [
    {
      label: 'סה"כ משתמשים',
      value: totalUsers.toLocaleString('he-IL'),
      icon: Users,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50',
    },
    {
      label: 'רשויות פעילות',
      value: activeAuthorities.toString(),
      icon: Building2,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'לקוחות פעילים',
      value: activeClients.toString(),
      icon: Briefcase,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'צמיחה שבועית',
      value: `${weeklyGrowthPercent >= 0 ? '+' : ''}${weeklyGrowthPercent.toFixed(1)}%`,
      icon: weeklyGrowthPercent >= 0 ? TrendingUp : TrendingDown,
      color: weeklyGrowthPercent >= 0 ? 'text-green-500' : 'text-red-500',
      bgColor: weeklyGrowthPercent >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
    {
      label: 'שיעור השלמה',
      value: `${overallCompletionRate.toFixed(1)}%`,
      icon: Target,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'מנהלי מערכת',
      value: totalPlatformAdmins.toString(),
      icon: Shield,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-gray-900">סיכום ביצועים</h2>
        <p className="text-gray-500 text-sm mt-1">מבט כולל על ביצועי הפלטפורמה</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                  <Icon size={24} className={metric.color} />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">{metric.label}</p>
                <p className="text-3xl font-black text-gray-900">{metric.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
