'use client';

import { motion } from 'framer-motion';
import { Clock, MapPin, Flame, Gauge, TrendingUp } from 'lucide-react';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';

export interface SummaryStatsGridProps {
  /** Elapsed time in seconds */
  time: number;
  /** Distance in km */
  distance: number;
  /** Calories burned */
  calories: number;
  /** Average pace in min/km. Pass 0 or undefined to hide. */
  pace?: number;
  /** Positive elevation gain in metres. Pass 0 or undefined to hide. */
  elevationGain?: number;
}

export default function SummaryStatsGrid({
  time,
  distance,
  calories,
  pace,
  elevationGain,
}: SummaryStatsGridProps) {
  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  type Stat = {
    label: string;
    value: string;
    icon: typeof Clock;
    color: string;
    bgColor: string;
  };

  const stats: Stat[] = [
    {
      label: 'מרחק',
      value: `${distance.toFixed(2)} ק"מ`,
      icon: MapPin,
      color: 'text-[#00ADEF]',
      bgColor: 'bg-cyan-50',
    },
    {
      label: 'זמן',
      value: formatTime(time),
      icon: Clock,
      color: 'text-[#FF8C00]',
      bgColor: 'bg-orange-50',
    },
    ...(pace && pace > 0
      ? ([{
          label: 'קצב ממוצע',
          value: formatPace(pace),
          icon: Gauge,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
        }] as Stat[])
      : []),
    {
      label: 'קלוריות',
      value: `${Math.floor(calories)}`,
      icon: Flame,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    ...(elevationGain && elevationGain > 0
      ? ([{
          label: 'עלייה',
          value: `${Math.round(elevationGain)} מ'`,
          icon: TrendingUp,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
        }] as Stat[])
      : []),
  ];

  // Choose a 2-column grid for up to 4 items, 3-column for 3 or 5
  const gridClass =
    stats.length === 3 || stats.length === 5
      ? 'grid-cols-3'
      : 'grid-cols-2';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-white rounded-xl shadow-sm p-6 mb-6"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className={`grid ${gridClass} gap-4`}>
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="flex flex-col items-center text-center p-4 rounded-xl bg-gray-50"
            >
              <div className={`p-3 rounded-lg ${stat.bgColor} mb-3`}>
                <Icon size={24} className={stat.color} />
              </div>
              <div className={`text-2xl md:text-3xl font-black ${stat.color} mb-1`}>
                {stat.value}
              </div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
