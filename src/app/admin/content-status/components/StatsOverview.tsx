'use client';

import { ContentStats } from './types';

interface StatsOverviewProps {
  stats: ContentStats;
}

export default function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="text-center">
          <div className="text-3xl font-black">{stats.coverage}%</div>
          <div className="text-sm opacity-90">כיסוי כולל</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-black">{stats.complete}</div>
          <div className="text-sm opacity-90">✅ מושלם</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-black">{stats.partial}</div>
          <div className="text-sm opacity-90">⚠️ חלקי</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-black">{stats.missing}</div>
          <div className="text-sm opacity-90">❌ חסר</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-black">{stats.toShoot}</div>
          <div className="text-sm opacity-90">🎥 לצילום</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-black">{stats.total}</div>
          <div className="text-sm opacity-90">סה"כ תאים</div>
        </div>
      </div>
    </div>
  );
}
