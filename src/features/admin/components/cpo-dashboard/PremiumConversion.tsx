'use client';

import { Lock, TrendingUp } from 'lucide-react';
import { PremiumMetrics } from '@/features/admin/services/cpo-analytics.service';

interface PremiumConversionProps {
  data: PremiumMetrics;
  loading?: boolean;
}

export default function PremiumConversion({ data, loading }: PremiumConversionProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
        <div className="h-32 bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-6 bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Lock size={24} className="text-purple-600" />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900">שיעור המרה לפרימיום</h3>
          <p className="text-xs text-gray-500">מקום שמורה לעתיד מוניטיזציה</p>
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-500 mb-1">שיעור המרה</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-purple-600">
                {data.conversionRate > 0 ? data.conversionRate.toFixed(1) : '0.0'}%
              </span>
              {data.conversionRate > 0 && (
                <TrendingUp size={20} className="text-green-500" />
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
          <div>
            <p className="text-xs text-gray-500 mb-1">סה"כ משתמשים</p>
            <p className="text-xl font-bold text-gray-900">{data.totalUsers.toLocaleString('he-IL')}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">משתמשי פרימיום</p>
            <p className="text-xl font-bold text-purple-600">{data.premiumUsers.toLocaleString('he-IL')}</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            <strong>הערה:</strong> תכונת הפרימיום עדיין לא הופעלה. נתונים אלה הם placeholder למטרות תכנון.
          </p>
        </div>
      </div>
    </div>
  );
}
