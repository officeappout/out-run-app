"use client";
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRunStore } from '@/features/run/store/useRunStore';
import { Pause, Play, StopCircle } from 'lucide-react';

// ייבוא קומפוננטות
import AppMap from '@/features/map/components/AppMap';
import { ActiveDashboard } from '@/features/run/components/ActiveDashboard';

export default function RunPage() {
  const router = useRouter();
  
  // שליפת נתונים מה-Store
  const { 
    status, 
    startTime, 
    totalDistance, 
    activityType, 
    pauseRun, 
    resumeRun, 
    stopRun
  } = useRunStore();

  // הגנה: אם אין ריצה פעילה, תחזור למפה
  useEffect(() => {
    // בדיקה כפולה: אם הסטטוס הוא 'idle' (לא התחיל) או שהמשתמש הגיע לכאן ישירות ללא startTime
    if (status === 'idle') {
       router.replace('/map');
    }
  }, [status, router]);

  const handleTogglePause = () => {
    if (status === 'running') {
      pauseRun();
    } else {
      resumeRun();
    }
  };

  const handleStop = () => {
    stopRun();
    // כאן בעתיד ננווט למסך סיכום
    // router.push('/run/summary'); 
    router.replace('/map'); // בינתיים חוזרים למפה
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col font-sans">
      
      {/* 1. שכבת המפה (רקע) */}
      <div className="absolute inset-0 z-0">
        {/* התיקון החשוב: routes={[]} 
           אנחנו מעבירים מערך ריק כדי שהקרוסלה לא תופיע בזמן ריצה.
           המפה עדיין תראה את המיקום ואת הקו הכחול (activeRoutePath) שנמשך מה-Store.
        */}
        <AppMap routes={[]} />
      </div>

      {/* 2. דשבורד עליון (זמן, מרחק, תחנה הבאה) */}
      {/* מציגים רק אם הריצה התחילה (יש startTime) */}
      {startTime && (
        <ActiveDashboard 
          mode={activityType} // 'running' או 'walking'
          startTime={startTime}
          distance={totalDistance}
          nextStation="גינת שנקין" // בהמשך נחבר לוגיקה שמחשבת את התחנה הבאה מהמסלול
        />
      )}

      {/* 3. כפתורי שליטה (למטה) */}
      <div className="absolute bottom-10 left-0 right-0 z-20 px-6 pointer-events-none">
        <div className="flex items-center justify-center gap-6 pointer-events-auto">
          
          {/* כפתור סיום (מופיע רק כשעוצרים - להגנה מטעות) */}
          {status === 'paused' && (
            <button 
              onClick={handleStop}
              className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/30 animate-in zoom-in duration-200 active:scale-95 transition-transform"
            >
              <StopCircle size={32} fill="currentColor" />
            </button>
          )}

          {/* כפתור ראשי: הפסקה / המשך */}
          <button 
            onClick={handleTogglePause}
            className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-xl transition-all active:scale-95 duration-200
              ${status === 'running' 
                ? 'bg-black shadow-black/20' 
                : 'bg-[#00E5FF] shadow-[#00E5FF]/40'}`}
          >
            {status === 'running' ? (
              <Pause size={40} fill="currentColor" />
            ) : (
              <Play size={40} fill="currentColor" className="ml-1" />
            )}
          </button>
        </div>
      </div>

    </div>
  );
}