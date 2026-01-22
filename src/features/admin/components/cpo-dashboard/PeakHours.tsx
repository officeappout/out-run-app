'use client';

import { Clock, TrendingUp } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';

interface PeakHoursData {
  hour: string;
  count: number;
}

export default function PeakHours() {
  const [data, setData] = useState<PeakHoursData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPeakHours() {
      try {
        // Get all users and extract trainingTime
        const usersQuery = collection(db, 'users');
        const usersSnapshot = await getDocs(usersQuery);
        
        const hourCounts: Record<string, number> = {};

        usersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();
          const trainingTime = userData.lifestyle?.trainingTime;
          
          if (trainingTime && typeof trainingTime === 'string') {
            // Parse time string (format: "HH:MM")
            const [hours] = trainingTime.split(':');
            const hour = parseInt(hours, 10);
            
            if (!isNaN(hour) && hour >= 0 && hour < 24) {
              const hourKey = `${hour}:00`;
              hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
            }
          }
        });

        // Convert to array and sort by count (descending)
        const sortedHours = Object.entries(hourCounts)
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5); // Top 5 hours

        setData(sortedHours);
      } catch (error) {
        console.error('Error loading peak hours data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadPeakHours();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <div className="mb-4">
          <h3 className="text-lg md:text-xl font-black text-gray-900 mb-1">שעות שיא</h3>
          <p className="text-xs md:text-sm text-gray-500">שעות האימון הפופולריות ביותר</p>
        </div>
        <div className="text-center py-8 text-gray-500">
          <Clock size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm">אין נתונים זמינים</p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <div className="mb-4">
        <h3 className="text-lg md:text-xl font-black text-gray-900 mb-1">שעות שיא</h3>
        <p className="text-xs md:text-sm text-gray-500">שעות האימון הפופולריות ביותר</p>
      </div>

      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={item.hour} className="flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-[60px]">
              <Clock size={16} className="text-gray-400" />
              <span className="text-sm font-bold text-gray-700">{item.hour}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600">{item.count} משתמשים</span>
                <span className="text-xs font-bold text-gray-700">
                  {((item.count / maxCount) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-500"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <TrendingUp size={16} className="text-cyan-500" />
            <span>השעה הפופולרית ביותר: <strong>{data[0].hour}</strong> ({data[0].count} משתמשים)</span>
          </div>
        </div>
      )}
    </div>
  );
}
