'use client';

import { motion } from 'framer-motion';
import { Clock, MapPin, Flame } from 'lucide-react';

interface MainStatsGridProps {
  time: number; // seconds
  distance: number; // km
  calories: number;
}

export default function MainStatsGrid({ time, distance, calories }: MainStatsGridProps) {
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const stats = [
    {
      label: 'זמן',
      value: formatTime(time),
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'מרחק',
      value: `${distance.toFixed(2)} ק"מ`,
      icon: MapPin,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'קלוריות',
      value: `${Math.floor(calories)}`,
      icon: Flame,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-white rounded-xl shadow-sm p-6 mb-6"
      style={{ fontFamily: 'Assistant, sans-serif' }}
    >
      <div className="grid grid-cols-3 gap-4">
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
