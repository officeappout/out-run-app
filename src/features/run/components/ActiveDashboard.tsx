import React, { useEffect, useState } from 'react';
import { ActivityType } from '@/features/map/types/map-objects.type';
import { Navigation, Flame, Clock, MapPin } from 'lucide-react';

interface Props {
  mode: ActivityType; // 'run' | 'walk'
  startTime: number;  
  distance: number;   
  nextStation?: string;
}

// שים לב: אנחנו משתמשים ב-export const (לא default) ולכן הייבוא עם סוגריים מסולסלים {} הוא נכון
export const ActiveDashboard: React.FC<Props> = ({ 
  mode, 
  startTime, 
  distance, 
  nextStation
}) => {
  const [duration, setDuration] = useState('00:00');
  const isWalk = mode === 'walking';

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const diff = Math.floor((now - startTime) / 1000);
      const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
      const seconds = (diff % 60).toString().padStart(2, '0');
      setDuration(`${minutes}:${seconds}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  return (
    <div className="absolute top-0 left-0 right-0 p-4 pt-12 z-50 pointer-events-none">
      <div className="pointer-events-auto rounded-3xl shadow-lg backdrop-blur-md p-5 transition-all
        bg-slate-900/95 text-white border border-slate-700 mx-auto max-w-sm">
        
        {/* שורה עליונה: נתונים ראשיים */}
        <div className="flex justify-between items-end mb-4">
          
          {/* זמן */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1 mb-1 opacity-70">
              <Clock size={14} />
              <span className="text-xs font-medium">זמן אימון</span>
            </div>
            <span className="text-4xl font-black font-mono tracking-tight">{duration}</span>
          </div>

          {/* מרחק */}
          <div className="flex flex-col items-end">
             <div className="flex items-center gap-1 mb-1 opacity-70">
              {isWalk ? <Flame size={14} /> : <MapPin size={14} />}
              <span className="text-xs font-medium">{isWalk ? 'מרחק' : 'קצב'}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">{distance.toFixed(2)}</span>
              <span className="text-sm font-medium opacity-60">ק״מ</span>
            </div>
          </div>
        </div>

        {/* שורה תחתונה: התחנה הבאה */}
        {nextStation && (
          <div className="mt-2 p-3 rounded-2xl flex items-center gap-3 bg-slate-800 text-cyan-400">
            <div className="p-2 rounded-full bg-slate-700">
              <Navigation size={18} className="fill-current" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] opacity-70 uppercase tracking-wider font-bold">היעד הבא</span>
              <span className="font-bold text-sm line-clamp-1">{nextStation}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};