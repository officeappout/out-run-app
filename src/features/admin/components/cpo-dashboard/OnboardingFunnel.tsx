'use client';

import { Users, CheckCircle, XCircle, TrendingDown } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';

interface OnboardingFunnelData {
  started: number;
  completed: number;
  completionRate: number;
  dropOffRate: number;
}

export default function OnboardingFunnel() {
  const [data, setData] = useState<OnboardingFunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFunnelData() {
      try {
        // Get all users
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery);
        
        let started = 0;
        let completed = 0;

        usersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();
          
          // Count users who started onboarding (have onboardingStep or onboardingStatus)
          if (userData.onboardingStep || userData.onboardingStatus) {
            started++;
          }
          
          // Count users who completed onboarding
          if (userData.onboardingStatus === 'COMPLETED' || 
              (userData.onboardingStep === 'COMPLETED' && !userData.onboardingStatus)) {
            completed++;
          }
        });

        // Also check analytics_events for onboarding_start events
        try {
          const analyticsQuery = query(
            collection(db, 'analytics_events'),
            where('eventName', '==', 'onboarding_start')
          );
          const analyticsSnapshot = await getDocs(analyticsQuery);
          const uniqueStarts = new Set(analyticsSnapshot.docs.map(doc => doc.data().userId).filter(Boolean));
          
          // Use the higher number (either from users or analytics)
          started = Math.max(started, uniqueStarts.size);
        } catch (error) {
          console.warn('Could not fetch onboarding_start events:', error);
        }

        const completionRate = started > 0 ? (completed / started) * 100 : 0;
        const dropOffRate = 100 - completionRate;

        setData({
          started,
          completed,
          completionRate,
          dropOffRate,
        });
      } catch (error) {
        console.error('Error loading onboarding funnel data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadFunnelData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-24"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-gray-500">שגיאה בטעינת נתונים</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <div className="mb-4">
        <h3 className="text-lg md:text-xl font-black text-gray-900 mb-1">מעבר Onboarding</h3>
        <p className="text-xs md:text-sm text-gray-500">שיעור השלמה מול נטישה</p>
      </div>

      <div className="space-y-4">
        {/* Started */}
        <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">התחילו</p>
              <p className="text-2xl font-black text-gray-900">{data.started.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">השלימו</p>
              <p className="text-2xl font-black text-gray-900">{data.completed.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-purple-600" />
              <p className="text-xs text-gray-600">שיעור השלמה</p>
            </div>
            <p className="text-2xl font-black text-purple-700">{data.completionRate.toFixed(1)}%</p>
          </div>

          <div className="p-4 bg-red-50 rounded-xl border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={16} className="text-red-600" />
              <p className="text-xs text-gray-600">שיעור נטישה</p>
            </div>
            <p className="text-2xl font-black text-red-700">{data.dropOffRate.toFixed(1)}%</p>
          </div>
        </div>

        {/* Visual Funnel */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>התחילו</span>
            <span>{data.started}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-500"
              style={{ width: '100%' }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-600 mt-3 mb-1">
            <span>השלימו</span>
            <span>{data.completed}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-green-500 h-full transition-all duration-500"
              style={{ width: `${data.completionRate}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
