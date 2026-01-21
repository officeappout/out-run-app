'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { HealthWakeUpMetric } from '@/features/admin/services/strategic-insights.service';

interface HealthWakeUpChartProps {
  data: HealthWakeUpMetric;
  loading?: boolean;
}

export default function HealthWakeUpChart({ data, loading }: HealthWakeUpChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 h-96 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
      </div>
    );
  }

  const chartData = [
    {
      name: 'לא פעילים (לפני)',
      value: data.totalInactiveUsers,
    },
    {
      name: 'פעילים עכשיו',
      value: data.nowActiveUsers,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-900">השפעה על בריאות הציבור</h4>
        <p className="text-sm text-gray-600 mt-1">
          שיעור הצלחה: {data.successRate}% מהאזרחים הלא פעילים בעבר מתאמנים כעת שבועית
        </p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={150} />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#10B981" radius={[0, 8, 8, 0]} name="מספר משתמשים" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 text-sm text-gray-600">
        <p>
          מתוך {data.totalInactiveUsers} משתמשים שהצהירו שהם לא מתאמנים או מתאמנים מעט לפני ההצטרפות,
          {data.nowActiveUsers} משתמשים ({data.successRate}%) השלימו יותר מאימון אחד באפליקציה.
        </p>
      </div>
    </div>
  );
}
