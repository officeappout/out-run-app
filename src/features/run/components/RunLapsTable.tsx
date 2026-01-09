"use client";
import React from 'react';
import { useRunStore } from '../store/useRunStore';

export default function RunLapsTable() {
  const { laps } = useRunStore();

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (p: number) => {
    if (!p || p === Infinity || p <= 0) return "0:00";
    const mins = Math.floor(p);
    const secs = Math.round((p % 1) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // אנחנו הופכים את הסדר כדי שההקפה האחרונה תהיה למעלה
  const reversedLaps = [...laps].reverse();

  return (
    <div className="w-full px-4 pb-24 pt-4">
      {reversedLaps.map((lap) => (
        <div
          key={lap.number} // שינינו מ-id ל-number
          className={`flex items-center px-6 py-5 rounded-[24px] mb-3 border-2 transition-all ${
            lap.isActive 
              ? 'border-[#00B2FF] bg-[#00B2FF]/5 shadow-sm' 
              : 'border-gray-100 bg-white'
          }`}
        >
          {/* מספר הקפה (ימין) */}
          <div className="flex-1 text-right">
            <span className={`text-xl font-[950] ${lap.isActive ? 'text-[#00B2FF]' : 'text-[#1A1F36]'}`}>
              {lap.number}
            </span>
            <span className="text-[10px] text-gray-400 font-bold mr-2 uppercase">הקפה</span>
          </div>

          {/* זמן (מרכז-ימין) */}
          <div className="flex-1 text-center">
            <div className="text-xl font-[950] text-[#1A1F36]">{formatTime(lap.duration)}</div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">זמן</div>
          </div>

          {/* קצב (מרכז-שמאל) */}
          <div className="flex-1 text-center">
            <div className="text-xl font-[950] text-[#1A1F36]">{formatPace(lap.splitPace)}</div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">קצב</div>
          </div>

          {/* מרחק (שמאל) */}
          <div className="flex-1 text-left">
            <div className="text-xl font-[950] text-[#1A1F36]">
              {(lap.distanceMeters / 1000).toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">ק״מ</div>
          </div>
        </div>
      ))}
    </div>
  );
}