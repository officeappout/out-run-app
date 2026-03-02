'use client';

import React from 'react';
import { Lock, MapPin, GraduationCap } from 'lucide-react';

type LockType = 'city' | 'city_inactive' | 'school';

interface LockedArenaCardProps {
  type: LockType;
  authorityName?: string;
}

const CONFIG: Record<LockType, { icon: React.FC<{ className?: string }>; title: string; cta: (name?: string) => string }> = {
  city: {
    icon: MapPin,
    title: 'הליגה העירונית',
    cta: () => 'האפליקציה מזהה את עיר המגורים שלך אוטומטית.\nפתח את האפליקציה עם GPS פעיל כדי להתחבר לליגה.',
  },
  city_inactive: {
    icon: MapPin,
    title: 'הליגה העירונית',
    cta: (name) => `${name ?? 'העיר שלך'} עוד לא פתחה את הליגה.\nלחץ על כפתור הלחץ כדי לזרז אותם!`,
  },
  school: {
    icon: GraduationCap,
    title: 'בית ספר / חברה',
    cta: () => 'הזן קוד ארגוני כדי לגשת\nלליגה של בית הספר או החברה שלך.',
  },
};

export default function LockedArenaCard({ type, authorityName }: LockedArenaCardProps) {
  const cfg = CONFIG[type];
  const Icon = cfg.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center" dir="rtl">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-gray-400 dark:text-gray-500" />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4.5 h-4.5 text-gray-500 dark:text-gray-400" />
        <h3 className="text-base font-black text-gray-900 dark:text-gray-100">{cfg.title}</h3>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-400 leading-relaxed whitespace-pre-line max-w-[280px]">
        {cfg.cta(authorityName)}
      </p>
    </div>
  );
}
