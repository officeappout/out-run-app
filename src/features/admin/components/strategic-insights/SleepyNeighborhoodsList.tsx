'use client';

import { MapPin, Users, TrendingDown } from 'lucide-react';
import { SleepyNeighborhood } from '@/features/admin/services/strategic-insights.service';

interface SleepyNeighborhoodsListProps {
  data: SleepyNeighborhood[];
  loading?: boolean;
  limit?: number;
}

export default function SleepyNeighborhoodsList({ data, loading, limit = 5 }: SleepyNeighborhoodsListProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
        <div className="space-y-3">
          {[...Array(limit)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4">שכונות עם פוטנציאל נמוך</h4>
        <p className="text-gray-500">אין נתונים זמינים</p>
      </div>
    );
  }

  const displayData = data.slice(0, limit);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-900">הזדמנות שיווקית</h4>
        <p className="text-sm text-gray-600 mt-1">שכונות עם פוטנציאל גבוה אבל מעורבות נמוכה</p>
      </div>
      <div className="space-y-3">
        {displayData.map((neighborhood) => (
          <div
            key={neighborhood.neighborhoodId}
            className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <MapPin size={20} className="text-orange-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">{neighborhood.neighborhoodName}</div>
                <div className="text-sm text-gray-600">{neighborhood.cityName}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Users size={16} />
                <span className="font-bold">{neighborhood.userCount}</span>
                <span className="text-gray-500">משתמשים</span>
              </div>
              {neighborhood.penetrationRate > 0 && (
                <div className="flex items-center gap-2 text-orange-600">
                  <TrendingDown size={16} />
                  <span className="font-bold">{neighborhood.penetrationRate.toFixed(1)}</span>
                  <span className="text-gray-500">לכל 10,000 תושבים</span>
                </div>
              )}
              {neighborhood.parksCount > 0 && (
                <div className="text-xs text-gray-500">
                  {neighborhood.parksCount} גינות כושר
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-sm text-gray-600">
        <p>
          💡 <strong>המלצה:</strong> שכונות אלו זקוקות לתשומת לב שיווקית. שקול לשלוח רכז קהילה או להפעיל קמפיין ממוקד.
        </p>
      </div>
    </div>
  );
}
