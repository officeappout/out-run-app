'use client';

import React, { useState } from 'react';
import type { DevSimulationState, CityPreset } from '@/features/parks/core/hooks/useDevSimulation';

const CITY_PRESETS: CityPreset[] = [
  { id: 'tel-aviv',      name: 'תל אביב',     lat: 32.0853, lng: 34.7818 },
  { id: 'jerusalem',     name: 'ירושלים',     lat: 31.7683, lng: 35.2137 },
  { id: 'haifa',         name: 'חיפה',        lat: 32.7940, lng: 34.9896 },
  { id: 'rishon-lezion', name: 'ראשון לציון', lat: 31.9730, lng: 34.7925 },
  { id: 'ashdod',        name: 'אשדוד',       lat: 31.8044, lng: 34.6553 },
  { id: 'ashkelon',      name: 'אשקלון',      lat: 31.6690, lng: 34.5715 },
  { id: 'beer-sheva',    name: 'באר שבע',     lat: 31.2530, lng: 34.7915 },
  { id: 'netanya',       name: 'נתניה',       lat: 32.3320, lng: 34.8599 },
  { id: 'petah-tikva',   name: 'פתח תקווה',   lat: 32.0892, lng: 34.8880 },
  { id: 'rehovot',       name: 'רחובות',      lat: 31.8948, lng: 34.8118 },
  { id: 'herzliya',      name: 'הרצליה',      lat: 32.1636, lng: 34.8443 },
  { id: 'sderot',        name: 'שדרות',       lat: 31.5250, lng: 34.5955 },
  { id: 'ofakim',        name: 'אופקים',      lat: 31.3115, lng: 34.6233 },
  { id: 'netivot',       name: 'נתיבות',      lat: 31.4166, lng: 34.5897 },
  { id: 'beit-shemesh',  name: 'בית שמש',     lat: 31.7511, lng: 34.9881 },
  { id: 'kfar-saba',     name: 'כפר סבא',     lat: 32.1715, lng: 34.9068 },
  { id: 'ramat-gan',     name: 'רמת גן',      lat: 32.0820, lng: 34.8130 },
];

interface MockLocationPanelProps {
  devSim: DevSimulationState;
}

function MockLocationPanelInner({ devSim }: MockLocationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(CITY_PRESETS[0].id);

  const activeCity = devSim.isMockEnabled ? devSim.selectedCity : null;

  const handleActivate = () => {
    const city = CITY_PRESETS.find((c) => c.id === selectedId);
    if (city) devSim.setCityPreset(city);
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        dir="rtl"
        className={`fixed bottom-28 left-3 z-[60] flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold shadow-lg pointer-events-auto transition-all active:scale-95 ${
          activeCity
            ? 'bg-orange-500 text-white ring-2 ring-orange-300'
            : 'bg-gray-800/80 text-gray-300 backdrop-blur-sm'
        }`}
      >
        <span>🧪</span>
        {activeCity ? activeCity : 'מיקום'}
      </button>
    );
  }

  return (
    <div
      dir="rtl"
      className={`fixed bottom-28 left-3 z-[60] w-52 rounded-2xl shadow-xl pointer-events-auto overflow-hidden ${
        activeCity ? 'ring-2 ring-orange-400' : 'ring-1 ring-white/10'
      }`}
      style={{
        background: 'rgba(15, 18, 30, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(false)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-right"
      >
        <span className="text-[11px] font-bold text-gray-400">סגור</span>
        <span className="text-[13px] font-bold text-white">🧪 מיקום פיתוח</span>
      </button>

      <div className="px-3 pb-3 flex flex-col gap-2">
        {/* Active indicator */}
        {activeCity && (
          <div className="flex items-center gap-1.5 bg-orange-500/20 rounded-lg px-2 py-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold text-orange-300 truncate">{activeCity}</span>
          </div>
        )}

        {/* City dropdown */}
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg bg-white/10 text-white text-[12px] px-2 py-1.5 border border-white/15 focus:outline-none focus:border-orange-400"
          style={{ direction: 'rtl' }}
        >
          {CITY_PRESETS.map((c) => (
            <option key={c.id} value={c.id} className="bg-gray-900 text-white">
              {c.name}
            </option>
          ))}
        </select>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleActivate}
            className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-[12px] font-bold py-1.5 transition-colors active:scale-95"
          >
            הפעל
          </button>
          <button
            onClick={devSim.toggleMock}
            disabled={!devSim.isMockEnabled}
            className="flex-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 text-[12px] font-bold py-1.5 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            כבה
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MockLocationPanel(props: MockLocationPanelProps) {
  if (process.env.NODE_ENV === 'production') return null;
  return <MockLocationPanelInner {...props} />;
}
