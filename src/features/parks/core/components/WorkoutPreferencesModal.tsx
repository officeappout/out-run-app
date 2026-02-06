"use client";
import { useState, useMemo } from 'react';
import { X, Zap, Bike, Footprints, Activity, Coins, Dumbbell } from 'lucide-react';
import { ActivityType } from '../types/route.types';
import { calculateCalories } from '@/lib/calories.utils';
import { useUserStore } from '@/features/user';

type Intensity = 'easy' | 'medium' | 'hard';

interface WorkoutPreferencesProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (preferences: any) => void;
}

export default function WorkoutPreferencesModal({ isOpen, onClose, onUpdate }: WorkoutPreferencesProps) {
  // 1. כל ה-Hooks חייבים להיות למעלה (ללא תנאים!)
  const [duration, setDuration] = useState(30);
  const [activity, setActivity] = useState<ActivityType>('running');
  const [intensity, setIntensity] = useState<Intensity>('medium');
  const [includeStrength, setIncludeStrength] = useState(true);

  // Get user profile for weight calculation
  const profile = useUserStore((state) => state.profile);
  const userWeight = profile?.core?.weight;

  // --- המוח המתמטי: חישוב תגמול וקלוריות באמצעות MET formula ---

  const calculatedImpact = useMemo(() => {
    // Use the SAME formula as useRouteFilter for consistency
    const baseCalories = calculateCalories(activity, duration, userWeight);

    // Coin Calculation: Distance * Multiplier
    // Note: We estimate distance based on duration since we don't have a route yet.
    // Speed Assumptions (same as useRouteFilter): Walking 5, Running 10, Cycling 20 km/h
    let speed = 5;
    let multiplier = 10;

    if (activity === 'running') { speed = 10; multiplier = 20; }
    if (activity === 'cycling') { speed = 20; multiplier = 15; }

    const estimatedDistance = (duration / 60) * speed;
    const estimatedCoins = Math.round(estimatedDistance * multiplier);

    return { calories: baseCalories, coins: estimatedCoins };
  }, [duration, activity, userWeight]);

  // 2. רק עכשיו מותר לעשות Return מוקדם
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-premium-hover max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 duration-300">

        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 px-6 pt-6 pb-2 flex justify-between items-center">
          <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
            <X size={20} />
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">בניית אימון</h2>
          <div className="w-10" />
        </div>

        <div className="p-6 space-y-8">

          {/* 1. סליידר זמן */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-sm text-gray-500 font-medium">כמה זמן יש לך?</span>
              <span className="text-3xl font-black text-blue-600 tracking-tight">{duration} <span className="text-base font-bold text-gray-400">דק׳</span></span>
            </div>
            <input
              type="range"
              min="15"
              max="120"
              step="5"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full h-3 bg-gray-100 rounded-full appearance-none cursor-pointer accent-blue-600 hover:accent-blue-500 transition-all"
            />
          </div>

          {/* 2. סוג פעילות */}
          <div className="space-y-3">
            <label className="text-sm text-gray-500 font-medium block text-right">מה בא לך לעשות?</label>
            <div className="flex gap-3">
              {[
                { id: 'walking', label: 'הליכה', icon: Footprints },
                { id: 'running', label: 'ריצה', icon: Activity },
                { id: 'cycling', label: 'רכיבה', icon: Bike },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActivity(item.id as ActivityType)}
                  className={`flex-1 py-4 rounded-2xl flex flex-col items-center gap-2 transition-all border-2 ${activity === item.id
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-transparent shadow-sm text-gray-400 hover:bg-gray-50'
                    }`}
                >
                  <item.icon size={24} strokeWidth={activity === item.id ? 2.5 : 2} />
                  <span className="text-xs font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. קצב / עצימות */}
          <div className="space-y-3">
            <label className="text-sm text-gray-500 font-medium block text-right">רמת מאמץ</label>
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              {[
                { id: 'easy', label: 'איזי', emoji: '😌' },
                { id: 'medium', label: 'רגיל', emoji: '👌' },
                { id: 'hard', label: 'טורבו', emoji: '🔥' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setIntensity(item.id as Intensity)}
                  className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all ${intensity === item.id
                    ? 'bg-white text-black shadow-sm scale-[1.02]'
                    : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                  <span className="text-lg">{item.emoji}</span> {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. שילוב מתקנים */}
          <div
            onClick={() => setIncludeStrength(!includeStrength)}
            className={`relative overflow-hidden p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${includeStrength ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-white'
              }`}
          >
            <div className="flex items-center gap-4 z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${includeStrength ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                <Dumbbell size={20} />
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${includeStrength ? 'text-green-800' : 'text-gray-800'}`}>שילוב מתקני כושר</p>
                <p className="text-xs text-gray-500">נחפש מסלול עם תחנות כוח</p>
              </div>
            </div>

            {/* Badge */}
            <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${includeStrength ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-400'
              }`}>
              +150 <Coins size={12} className={includeStrength ? 'text-green-700' : 'text-gray-400'} fill="currentColor" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-b-[32px] sm:rounded-b-[32px] border-t border-gray-100">
          <div className="flex justify-between items-center mb-6 px-2">
            <div className="text-center">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">צפי מטבעות</p>
              <div className="flex items-center gap-1 text-2xl font-black text-yellow-500">
                <Coins size={24} fill="currentColor" />
                {calculatedImpact.coins}
              </div>
            </div>
            <div className="h-8 w-[1px] bg-gray-200"></div>
            <div className="text-center">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">שריפת קלוריות</p>
              <div className="flex items-center gap-1 text-2xl font-black text-orange-500">
                <Zap size={24} fill="currentColor" />
                {calculatedImpact.calories}
              </div>
            </div>
          </div>

          <button
            onClick={() => onUpdate({ duration, activity, intensity, includeStrength })}
            className="w-full py-4 bg-black text-white font-bold rounded-2xl shadow-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 text-lg"
          >
            מצא מסלול מתאים 🚀
          </button>
          <div className="w-1/3 h-1.5 bg-gray-200 rounded-full mx-auto mt-6" />
        </div>

      </div>
    </div>
  );
}