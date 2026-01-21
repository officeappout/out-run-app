'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { EquipmentGap } from '@/features/admin/services/strategic-insights.service';

interface EquipmentGapAnalysisProps {
  data: EquipmentGap[];
  loading?: boolean;
  topCities?: number; // Show top N cities
}

const COLORS = ['#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export default function EquipmentGapAnalysis({ data, loading, topCities = 3 }: EquipmentGapAnalysisProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 h-96 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4">ניתוח פערי ציוד</h4>
        <p className="text-gray-500">אין נתונים זמינים</p>
      </div>
    );
  }

  // Group by city and get top cities
  const byCity = new Map<string, EquipmentGap[]>();
  data.forEach((gap) => {
    if (!byCity.has(gap.cityName)) {
      byCity.set(gap.cityName, []);
    }
    byCity.get(gap.cityName)!.push(gap);
  });

  const topCityNames = Array.from(byCity.keys()).slice(0, topCities);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-bold text-gray-900">ניתוח פערי ציוד לפי עיר</h4>
        <p className="text-sm text-gray-600 mt-1">הציוד המבוקש ביותר בשכונות מובילות</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topCityNames.map((cityName, idx) => {
          const cityGaps = byCity.get(cityName)!;
          
          // Aggregate equipment demand across all neighborhoods in this city
          const equipmentCounts = new Map<string, { name: string; count: number }>();
          cityGaps.forEach((gap) => {
            gap.equipmentDemand.forEach((equip) => {
              const current = equipmentCounts.get(equip.equipmentId);
              equipmentCounts.set(equip.equipmentId, {
                name: equip.equipmentName,
                count: (current?.count || 0) + equip.userCount,
              });
            });
          });

          const chartData = Array.from(equipmentCounts.entries())
            .map(([id, data]) => ({ name: data.name, value: data.count }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // Top 8

          if (chartData.length === 0) return null;

          return (
            <div key={cityName} className="bg-white rounded-xl border border-gray-200 p-6">
              <h5 className="text-md font-bold text-gray-900 mb-4">{cityName}</h5>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
