"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRunStore } from '../store/useRunStore';
import { Share2, Trophy, Clock, Zap, TrendingUp, ChevronUp } from 'lucide-react';

export default function RunSummary() {
  const { totalDistance, totalDuration, currentPace, routeCoords, laps } = useRunStore();
  const [drawerPosition, setDrawerPosition] = useState('half'); // 'half' | 'full'

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col overflow-hidden">
      
      {/* 1. המפה כרקע (סטייל Strava) */}
      <div className="absolute inset-0 h-[60%] w-full">
        <Map
          initialViewState={{
            longitude: routeCoords[0]?.[0] || 34.7818,
            latitude: routeCoords[0]?.[1] || 32.0853,
            zoom: 14.5
          }}
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11" // סטייל כהה מבליט את הקו הכחול
          interactive={true}
        >
         {/* וידוא שיש נתונים לפני רינדור השכבות */}
{routeCoords && routeCoords.length > 1 && routeCoords[0] && (
  <Source 
    id="final-route" 
    type="geojson" 
    data={{ 
      type: 'Feature', 
      properties: {}, 
      geometry: { 
        type: 'LineString', 
        coordinates: routeCoords 
      } 
    } as any}
  >
    <Layer 
      id="line" 
      type="line" 
      paint={{ 
        'line-color': '#00B2FF', 
        'line-width': 5 
      }} 
      layout={{
        'line-cap': 'round',
        'line-join': 'round'
      }}
    />
  </Source>
)}
        </Map>
        
        {/* כפתורי פעולה צפים על המפה */}
        <div className="absolute top-12 left-4 right-4 flex justify-between items-start pointer-events-none">
          <button className="p-3 bg-white/90 backdrop-blur rounded-full shadow-lg pointer-events-auto active:scale-90">
            <Share2 size={20} className="text-slate-800" />
          </button>
          <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-2xl shadow-lg flex items-center gap-2 pointer-events-auto">
             <div className="w-8 h-8 bg-blue-500 rounded-full border-2 border-white shadow-sm overflow-hidden">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="profile" />
             </div>
             <span className="text-xs font-black text-slate-800">הריצה שלי</span>
          </div>
        </div>
      </div>

      {/* 2. המגירה הנגררת (Bottom Sheet) */}
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: drawerPosition === 'half' ? '50%' : '10%' }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        className="absolute inset-0 bg-white rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] flex flex-col z-30"
      >
        {/* ידית גרירה */}
        <div 
          onClick={() => setDrawerPosition(prev => prev === 'half' ? 'full' : 'half')}
          className="w-full py-4 flex flex-col items-center cursor-pointer"
        >
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mb-1" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">נתוני אימון חופשי</span>
        </div>

        <div className="px-6 overflow-y-auto pb-20">
          
          {/* עיגולי הנתונים (הפאזל שלך) */}
          <div className="flex justify-between items-center mt-4">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full border-2 border-slate-100 flex items-center justify-center mb-1">
                <Clock size={20} className="text-blue-500" />
              </div>
              <span className="text-lg font-black text-slate-800">{formatTime(totalDuration)}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">זמן</span>
            </div>

            <div className="flex flex-col items-center transform -translate-y-2">
              <div className="w-24 h-24 rounded-full border-[6px] border-[#00B2FF] flex items-center justify-center mb-1 bg-white shadow-xl">
                <span className="text-3xl font-[1000] text-slate-800">{totalDistance.toFixed(2)}</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">קילומטרים</span>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full border-2 border-slate-100 flex items-center justify-center mb-1">
                <Zap size={20} className="text-orange-500" />
              </div>
              <span className="text-lg font-black text-slate-800">{currentPace.toFixed(2)}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">קצב</span>
            </div>
          </div>

          {/* גרף מהירות (דמה - סטייל גרמין) */}
          <div className="mt-8 bg-slate-50 p-5 rounded-[30px] border border-slate-100">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-500" />
                ניתוח מהירות
              </h3>
              <span className="text-[10px] font-bold text-blue-500">שיא: 4:20</span>
            </div>
            <div className="h-24 w-full flex items-end gap-1 px-1">
              {[40, 70, 45, 90, 65, 80, 30, 50, 85, 40].map((h, i) => (
                <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-blue-400/20 rounded-t-sm border-t-2 border-blue-500" />
              ))}
            </div>
          </div>

          {/* כרטיס הסטרייק הכתום (החתימה שלך) */}
          <div className="mt-6 bg-gradient-to-r from-[#FFB800] to-[#FF8000] p-6 rounded-[30px] shadow-lg flex items-center justify-between text-white overflow-hidden relative">
            <div className="relative z-10">
              <span className="text-5xl font-[1000] leading-none">123</span>
              <p className="text-sm font-black opacity-90">אימונים ברצף!</p>
            </div>
            <div className="text-right relative z-10">
              <div className="p-2 bg-white/20 rounded-xl mb-1 flex items-center justify-center">
                <Trophy size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">+2,000 עמירם</span>
            </div>
            {/* אפקט דקורטיבי ברקע הכרטיס */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          </div>

          {/* כפתור המשך סופי */}
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full mt-8 bg-slate-900 text-white py-5 rounded-[25px] font-black text-xl shadow-xl active:scale-95 transition-all mb-10"
          >
            סגירה וחזרה
          </button>
        </div>
      </motion.div>
    </div>
  );
}