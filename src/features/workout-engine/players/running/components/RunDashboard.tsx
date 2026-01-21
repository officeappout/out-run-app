"use client";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionStore } from '../../../core/store/useSessionStore';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { formatPace } from '../../../core/utils/formatPace';

export default function RunDashboard() {
  const { totalDistance, totalDuration, status } = useSessionStore();
  const { currentPace, laps } = useRunningPlayer();
  const [page, setPage] = useState(0); 
  const [showLapAlert, setShowLapAlert] = useState(false);
  const [lastLap, setLastLap] = useState<any>(null);
  const prevLapsLength = useRef(laps.length);

  // משתנה עזר למצב עצירה
  const isPaused = status === 'paused';

  const formatTime = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    
    if (hrs > 0) {
      return `${hrs}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // מעקב אחרי הקפות חדשות להצגת התראה
  useEffect(() => {
    if (laps.length > prevLapsLength.current) {
      const finished = laps[laps.length - 2];
      if (finished) {
        setLastLap(finished);
        setShowLapAlert(true);
        setTimeout(() => setShowLapAlert(false), 3000);
      }
    }
    prevLapsLength.current = laps.length;
  }, [laps]);

  const activeLap = laps.find(l => l.isActive) || laps[laps.length - 1] || { number: 1, distanceMeters: 0, duration: 0, splitPace: 0 };

  return (
    <div className="relative w-full bg-white z-50 shadow-md overflow-hidden">
      {/* כותרת עליונה - נשארת כחולה כפי שמופיע במקור */}
      <div className="w-full bg-[#00B2FF] py-3 px-6 flex items-center justify-between text-white">
        <span className="text-xl">→</span>
        <h1 className="text-xs font-black italic uppercase tracking-widest">שם אימון חופשי</h1>
        <div className="w-5" />
      </div>

      {/* אזור הנתונים עם המסגרת המותנית (הופך לכתום ב-Pause) */}
      <div className={`transition-all duration-300 ${isPaused ? 'p-2' : 'p-0'}`}>
        <motion.div 
          className={`w-full py-6 px-8 text-center cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isPaused ? 'border-[3px] border-[#FF6B00] rounded-2xl bg-white' : 'border-none'
          }`}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 50) setPage(0);
            else if (info.offset.x < -50) setPage(1);
          }}
        >
          <AnimatePresence mode="wait">
            {page === 0 ? (
              <motion.div key="p1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* כותרת קטנה שמשתנה במצב עצירה */}
                <div className="text-gray-400 text-[10px] font-black uppercase mb-1">
                  {isPaused ? 'נתונים מושהים' : 'נתונים כלליים'}
                </div>
                
                {/* מספר קילומטרים מרכזי - הופך לכתום ב-Pause */}
                <div className={`text-7xl font-[1000] tracking-tighter leading-none transition-colors duration-300 ${
                  isPaused ? 'text-[#FF6B00]' : 'text-[#1A1F36]'
                }`}>
                  {totalDistance.toFixed(2)}
                </div>
                <div className="text-gray-400 text-[10px] font-black uppercase mt-1 mb-4">קילומטר</div>

                <div className="flex justify-around border-t border-gray-50 pt-4">
                  <div>
                    <div className={`text-2xl font-[1000] transition-colors ${isPaused ? 'text-[#FF6B00]' : 'text-[#1A1F36]'}`}>
                      {formatTime(totalDuration)}
                    </div>
                    <div className="text-[9px] text-gray-400 font-black">זמן</div>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div>
                    <div className={`text-2xl font-[1000] transition-colors ${isPaused ? 'text-[#FF6B00]' : 'text-[#1A1F36]'}`}>
                      {formatPace(currentPace)}
                    </div>
                    <div className="text-[9px] text-gray-400 font-black">קצב ממוצע</div>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* דף נתוני הקפה (Page 2) */
              <motion.div key="p2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex justify-center items-center gap-2 mb-1">
                  <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black text-white ${
                    isPaused ? 'bg-[#FF6B00]' : 'bg-[#00B2FF]'
                  }`}>
                    {activeLap.number}
                  </span>
                  <span className="text-gray-400 text-[10px] font-black uppercase">נתוני הקפה</span>
                </div>
                <div className={`text-7xl font-[1000] tracking-tighter leading-none transition-colors ${
                  isPaused ? 'text-[#FF6B00]' : 'text-[#1A1F36]'
                }`}>
                  {(activeLap.distanceMeters / 1000).toFixed(2)}
                </div>
                <div className="text-gray-400 text-[10px] font-black uppercase mt-1 mb-4">{"ק״מ הקפה"}</div>
                <div className="flex justify-around border-t border-gray-50 pt-4">
                  <div>
                    <div className={`text-2xl font-[1000] ${isPaused ? 'text-[#FF6B00]' : 'text-[#1A1F36]'}`}>
                      {formatTime(activeLap.duration || activeLap.durationSeconds)}
                    </div>
                    <div className="text-[9px] text-gray-400 font-black">זמן הקפה</div>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div>
                    <div className={`text-2xl font-[1000] ${isPaused ? 'text-[#FF6B00]' : 'text-[#1A1F36]'}`}>
                      {formatPace(activeLap.splitPace)}
                    </div>
                    <div className="text-[9px] text-gray-400 font-black">קצב הקפה</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* נקודות ניווט (Pagination Dots) */}
          <div className="flex gap-1.5 justify-center mt-4">
            <div className={`h-1.5 rounded-full transition-all ${page === 0 ? (isPaused ? 'bg-[#FF6B00] w-4' : 'bg-[#00B2FF] w-4') : 'bg-gray-200 w-1.5'}`} />
            <div className={`h-1.5 rounded-full transition-all ${page === 1 ? (isPaused ? 'bg-[#FF6B00] w-4' : 'bg-[#00B2FF] w-4') : 'bg-gray-200 w-1.5'}`} />
          </div>
        </motion.div>
      </div>

      {/* התראת הקפה שקופצת (בסגנון כתום) */}
      <AnimatePresence>
        {showLapAlert && lastLap && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} 
            animate={{ y: -120, opacity: 1 }} 
            exit={{ y: 100, opacity: 0 }}
            className="fixed inset-x-4 z-[100] bg-white rounded-2xl shadow-2xl p-4 border-2 border-[#FF6B00] flex items-center justify-between"
            dir="rtl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF6B00] rounded-full text-white flex items-center justify-center font-black">{lastLap.number}</div>
              <div>
                <div className="text-[9px] text-gray-400 font-black uppercase">הקפה הושלמה</div>
                <div className="text-xl font-black text-[#1A1F36]">{formatTime(lastLap.duration)}</div>
              </div>
            </div>
            <div className="text-start font-black text-[#FF6B00]">
              {formatPace(lastLap.splitPace)} <span className="text-[10px] block">קצב</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}