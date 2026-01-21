'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { BaseMovementUsage, LocationDistribution } from '@/features/admin/services/cpo-analytics.service';

interface ProductInsightsProps {
  topMovements: BaseMovementUsage[];
  locationDistribution: LocationDistribution[];
  loading?: boolean;
}

const COLORS = ['#00B4D8', '#0077B6', '#0096C7', '#48CAE4', '#90E0EF'];

export default function ProductInsights({ topMovements, locationDistribution, loading }: ProductInsightsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 h-80 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 h-80 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-black text-gray-900">תובנות מוצר</h3>
        <p className="text-sm text-gray-500 mt-1">ניתוח שימוש בתרגילים ומיקומים</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Base Movements Bar Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">5 תנועות בסיס נפוצות ביותר</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topMovements} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="baseMovementId" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="usageCount" fill="#00B4D8" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Location Distribution Donut Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="text-lg font-bold text-gray-900 mb-4">התפלגות מיקומים</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={locationDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ location, percentage }) => `${location}: ${percentage}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {locationDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
