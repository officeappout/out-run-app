'use client';

/**
 * LiveHeatMap — Mapbox GL Heatmap Layer for the Authority Manager dashboard.
 *
 * Supports two modes:
 *   1. Live (שידור חי)  — real-time active_workouts onSnapshot
 *   2. Historical (היסטוריה) — Time Machine with Date Picker + Hour Slider
 *
 * Time Machine logic:
 *   • "Today" selected → slider = 0-to-24 hours back from NOW
 *   • Past date selected → slider = 0:00-to-23:59 of THAT DAY,
 *     slider value = how many hours of that day to include (1–24)
 *
 * PRIVACY CONTRACT:
 *   ✅  Shows: density blobs (Mapbox heatmap), aggregated hover stats
 *   ❌  Shows NO: individual markers, names, UIDs, popups with PII
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Map, { Source, Layer, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Activity, Users, Filter, Clock, Radio, Loader2, CalendarDays } from 'lucide-react';
import {
  subscribeToLiveHeatmap,
  fetchHistoricalHeatmap,
  DEFAULT_HEATMAP_FILTERS,
  type HeatmapSnapshot,
  type HeatmapFilters,
} from '@/features/heatmap/services/heatmap.service';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const HEATMAP_LAYER_STYLE: mapboxgl.HeatmapLayer = {
  id: 'live-heatmap',
  type: 'heatmap',
  source: 'active-workouts',
  paint: {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': [
      'interpolate', ['linear'], ['zoom'],
      0, 1,
      14, 3,
    ],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0,0,0,0)',
      0.1, 'rgba(0,180,255,0.2)',
      0.3, 'rgba(0,200,255,0.45)',
      0.5, 'rgba(50,220,200,0.6)',
      0.7, 'rgba(255,180,0,0.75)',
      0.9, 'rgba(255,80,50,0.85)',
      1, 'rgba(220,30,30,1)',
    ],
    'heatmap-radius': [
      'interpolate', ['linear'], ['zoom'],
      0, 15,
      14, 40,
      18, 60,
    ],
    'heatmap-opacity': 0.8,
  },
};

type ViewMode = 'live' | 'historical';

// ── Date helpers ─────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === toDateString(new Date());
}

function formatDateHebrew(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Compute the Firestore query window based on date + slider value.
 *
 * Today:      end = now,  start = now − hoursBack hours
 * Past date:  start = selectedDate 00:00,  end = selectedDate + hoursBack hours
 */
function computeTimeWindow(
  selectedDate: string,
  hoursBack: number,
): { start: Date; end: Date } {
  if (isToday(selectedDate)) {
    const now = new Date();
    return {
      start: new Date(now.getTime() - hoursBack * 60 * 60 * 1000),
      end: now,
    };
  }

  const dayStart = new Date(selectedDate + 'T00:00:00');
  return {
    start: dayStart,
    end: new Date(dayStart.getTime() + hoursBack * 60 * 60 * 1000),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface LiveHeatMapProps {
  authorityId: string;
  center?: { lat: number; lng: number };
}

export default function LiveHeatMap({ authorityId, center }: LiveHeatMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [snapshot, setSnapshot] = useState<HeatmapSnapshot | null>(null);
  const [filters, setFilters] = useState<HeatmapFilters>(DEFAULT_HEATMAP_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // Historical: date picker + slider
  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
  const [hoursBack, setHoursBack] = useState(6);
  const [historicalLoading, setHistoricalLoading] = useState(false);

  const todayStr = useMemo(() => toDateString(new Date()), []);
  const isTodaySelected = selectedDate === todayStr;

  // Compute the actual time window for the query
  const timeWindow = useMemo(
    () => computeTimeWindow(selectedDate, hoursBack),
    [selectedDate, hoursBack],
  );

  // ── LIVE mode ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'live') return;
    const unsub = subscribeToLiveHeatmap(authorityId, filters, setSnapshot);
    return () => unsub();
  }, [authorityId, filters, viewMode]);

  // ── HISTORICAL mode ────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'historical') return;
    let cancelled = false;
    setHistoricalLoading(true);

    fetchHistoricalHeatmap(authorityId, timeWindow, filters)
      .then((snap) => {
        if (!cancelled) setSnapshot(snap);
      })
      .catch((err) => console.error('[Heatmap] historical fetch error:', err))
      .finally(() => {
        if (!cancelled) setHistoricalLoading(false);
      });

    return () => { cancelled = true; };
  }, [authorityId, timeWindow, filters, viewMode]);

  // Clear data when switching modes
  useEffect(() => {
    setSnapshot(null);
  }, [viewMode]);

  const stats = snapshot?.stats;
  const geojson = snapshot?.geojson ?? { type: 'FeatureCollection' as const, features: [] };

  const handleFilterChange = useCallback(
    (key: keyof HeatmapFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleModeSwitch = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setShowFilters(false);
  }, []);

  // ── Slider label ───────────────────────────────────────────────────────

  const sliderLabel = useMemo(() => {
    if (isTodaySelected) {
      if (hoursBack === 1) return 'שעה אחרונה';
      if (hoursBack === 24) return '24 שעות אחרונות';
      return `${hoursBack} שעות אחרונות`;
    }
    // Past date: show as a time range within that day
    const endHour = Math.min(hoursBack, 24);
    return `00:00 – ${String(endHour).padStart(2, '0')}:00`;
  }, [isTodaySelected, hoursBack]);

  // ── Slider tick labels ─────────────────────────────────────────────────

  const sliderTicks = useMemo(() => {
    if (isTodaySelected) {
      return ['שעה', '6 שעות', '12 שעות', '24 שעות'];
    }
    return ['00:00', '06:00', '12:00', '23:59'];
  }, [isTodaySelected]);

  // ── Date indicator for empty state / loading ───────────────────────────

  const dateLabel = useMemo(() => {
    if (isTodaySelected) return 'היום';
    return formatDateHebrew(selectedDate);
  }, [isTodaySelected, selectedDate]);

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
      {/* Map */}
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          latitude: center?.lat ?? 31.525,
          longitude: center?.lng ?? 34.595,
          zoom: 13,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        attributionControl={false}
      >
        <Source id="active-workouts" type="geojson" data={geojson}>
          <Layer {...HEATMAP_LAYER_STYLE} />
        </Source>
      </Map>

      {/* ═══ TOP BAR: Mode toggle + Date Picker (historical) + Filter ═══ */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2" dir="rtl">
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => handleModeSwitch('live')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-colors ${
                viewMode === 'live'
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Radio size={13} />
              <span>שידור חי</span>
              {viewMode === 'live' && (
                <span className="relative flex h-2 w-2 mr-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
              )}
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <button
              onClick={() => handleModeSwitch('historical')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-colors ${
                viewMode === 'historical'
                  ? 'bg-indigo-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Clock size={13} />
              <span>היסטוריה</span>
            </button>
          </div>

          {/* Date Picker — only in historical mode */}
          {viewMode === 'historical' && (
            <div className="relative flex items-center bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <CalendarDays size={13} className="text-indigo-500 mr-0 ml-2.5 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setHoursBack(24);
                }}
                className="bg-transparent text-xs font-bold text-gray-700 pl-3 pr-1 py-2 outline-none cursor-pointer min-w-0 w-[115px] appearance-none"
              />
            </div>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`backdrop-blur-md rounded-xl px-3 py-2.5 shadow-lg transition-colors border shrink-0 ${
            showFilters
              ? 'bg-indigo-500 text-white border-indigo-400'
              : 'bg-white/95 text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Filter size={16} />
        </button>
      </div>

      {/* ═══ FILTER DROPDOWN ═══ */}
      {showFilters && (
        <div
          className="absolute top-16 left-3 bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-xl z-10 min-w-[200px] border border-gray-200"
          dir="rtl"
        >
          <p className="text-xs text-gray-500 font-bold mb-2">סינון</p>

          <label className="block text-xs text-gray-600 mb-1 font-medium">מגדר</label>
          <select
            value={filters.gender}
            onChange={(e) => handleFilterChange('gender', e.target.value)}
            className="w-full bg-gray-50 text-gray-900 text-xs rounded-lg px-2 py-1.5 mb-2 border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
          >
            <option value="all">הכל</option>
            <option value="male">גברים</option>
            <option value="female">נשים</option>
            <option value="other">אחר</option>
          </select>

          <label className="block text-xs text-gray-600 mb-1 font-medium">סוג פעילות</label>
          <select
            value={filters.workoutType}
            onChange={(e) => handleFilterChange('workoutType', e.target.value)}
            className="w-full bg-gray-50 text-gray-900 text-xs rounded-lg px-2 py-1.5 border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
          >
            <option value="all">הכל</option>
            <option value="running">ריצה</option>
            <option value="walking">הליכה</option>
            <option value="cycling">רכיבה</option>
            <option value="strength">כוח</option>
          </select>
        </div>
      )}

      {/* ═══ HISTORICAL SLIDER PANEL ═══ */}
      {viewMode === 'historical' && (
        <div
          className="absolute top-16 right-3 left-3 mx-auto max-w-md bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-lg border border-gray-200 z-[5]"
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-indigo-500" />
              <span className="text-xs font-bold text-gray-700">{sliderLabel}</span>
              {!isTodaySelected && (
                <span className="text-[10px] text-indigo-400 font-medium">
                  • {formatDateHebrew(selectedDate)}
                </span>
              )}
            </div>
            {historicalLoading && (
              <Loader2 size={14} className="animate-spin text-indigo-400" />
            )}
            {!historicalLoading && stats && (
              <span className="text-[10px] text-gray-400">
                {geojson.features.length.toLocaleString()} נקודות
              </span>
            )}
          </div>
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={hoursBack}
            onChange={(e) => setHoursBack(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            {sliderTicks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ BOTTOM: Aggregated stats panel — NO individual data ═══ */}
      {stats && stats.totalActive > 0 && (
        <div
          className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-lg border border-gray-200"
          dir="rtl"
        >
          <div className="grid grid-cols-4 gap-3 text-center">
            <StatCell
              icon={<Users size={14} className="text-cyan-500" />}
              label={viewMode === 'live' ? 'פעילים' : 'אימונים'}
              value={String(stats.totalActive)}
            />
            {viewMode === 'live' ? (
              <>
                <StatCell
                  icon={<Activity size={14} className="text-orange-400" />}
                  label="גיל ממוצע"
                  value={stats.averageAge}
                />
                <StatCell
                  icon={<span className="text-blue-500 text-xs font-bold">♂</span>}
                  label="גברים"
                  value={`${stats.malePercent}%`}
                />
                <StatCell
                  icon={<span className="text-pink-500 text-xs font-bold">♀</span>}
                  label="נשים"
                  value={`${stats.femalePercent}%`}
                />
              </>
            ) : (
              <>
                <StatCell
                  icon={<CalendarDays size={14} className="text-indigo-400" />}
                  label="תאריך"
                  value={isTodaySelected ? 'היום' : selectedDate.slice(5).replace('-', '/')}
                />
                <StatCell
                  icon={<Activity size={14} className="text-orange-400" />}
                  label="נקודות GPS"
                  value={geojson.features.length > 999
                    ? `${(geojson.features.length / 1000).toFixed(1)}K`
                    : String(geojson.features.length)}
                />
                <StatCell
                  icon={<span className="text-emerald-500 text-xs font-bold">⟁</span>}
                  label="סוגים"
                  value={String(Object.keys(stats.byWorkoutType).length)}
                />
              </>
            )}
          </div>

          {Object.keys(stats.byWorkoutType).length > 0 && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200 flex-wrap">
              {Object.entries(stats.byWorkoutType).map(([type, count]) => (
                <span
                  key={type}
                  className="text-[10px] text-gray-600 bg-gray-100 rounded-full px-2 py-0.5 border border-gray-200"
                >
                  {WORKOUT_TYPE_LABELS[type] ?? type}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ EMPTY STATE ═══ */}
      {stats && stats.totalActive === 0 && !historicalLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl px-6 py-4 text-center shadow-lg border border-gray-200 max-w-xs">
            <Activity size={32} className="text-gray-400 mx-auto mb-2" />
            <p className="text-gray-700 font-bold text-sm">
              {viewMode === 'live'
                ? 'אין פעילים כרגע'
                : `אין נתונים ל-${dateLabel}`}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {viewMode === 'live'
                ? 'המפה תתעדכן אוטומטית כשמשתמשים יתחילו אימון'
                : isTodaySelected
                  ? 'נסה להרחיב את טווח הזמן בסליידר'
                  : 'נסה לבחור תאריך אחר או להרחיב את טווח הזמן'}
            </p>
          </div>
        </div>
      )}

      {/* ═══ LOADING overlay ═══ */}
      {historicalLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl px-6 py-4 text-center shadow-lg border border-gray-200">
            <Loader2 size={28} className="animate-spin text-indigo-500 mx-auto mb-2" />
            <p className="text-gray-600 font-bold text-sm">
              טוען נתונים עבור {dateLabel}...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {icon}
      <span className="text-gray-900 font-bold text-sm">{value}</span>
      <span className="text-gray-400 text-[10px]">{label}</span>
    </div>
  );
}

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
  strength: 'כוח',
  workout: 'כוח',
};
