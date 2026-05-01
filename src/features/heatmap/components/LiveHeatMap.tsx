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
import Map, { Source, Layer, Popup, type MapRef, type MapLayerMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Activity, Users, Filter, Clock, Radio, Loader2, CalendarDays, Route as RouteIcon, Trees } from 'lucide-react';
import {
  subscribeToLiveHeatmap,
  fetchHistoricalHeatmap,
  DEFAULT_HEATMAP_FILTERS,
  type HeatmapSnapshot,
  type HeatmapFilters,
} from '@/features/heatmap/services/heatmap.service';
import {
  fetchRoutesForOverlay,
  fetchParksForOverlay,
  type RouteOverlayItem,
  type ParkOverlayItem,
} from '@/features/heatmap/services/route-overlay.service';
import { DualRangeSlider } from '@/features/partners/components/DualRangeSlider';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const ROUTE_OVERLAY_LAYER_ID = 'route-overlay-line';
const PARKS_OVERLAY_LAYER_ID = 'parks-overlay-circle';

/** Step expression: blue (0–5), orange (6–20), red (21+) keyed on usageCount. */
const ROUTE_OVERLAY_LAYER_STYLE: mapboxgl.LineLayer = {
  id: ROUTE_OVERLAY_LAYER_ID,
  type: 'line',
  source: 'route-overlay',
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': [
      'step',
      ['get', 'usageCount'],
      '#3B82F6',     // 0–5
      6, '#F97316',  // 6–20
      21, '#EF4444', // 21+
    ],
    'line-width': 3,
    'line-opacity': 0.8,
  },
};

/**
 * Parks overlay — circles sized + colored by `visitCount` (sessions this month).
 *   0       gray   (no data)
 *   1–10    blue   (low traffic)
 *   11–30   orange (medium traffic)
 *   31+     red    (hotspot)
 *
 * Circles deliberately use `step` (not `interpolate`) so each tier is a clear
 * visual band — easier for managers to scan than a continuous gradient.
 */
const PARKS_OVERLAY_LAYER_STYLE: mapboxgl.CircleLayer = {
  id: PARKS_OVERLAY_LAYER_ID,
  type: 'circle',
  source: 'parks-overlay',
  paint: {
    'circle-color': [
      'step',
      ['get', 'visitCount'],
      '#94A3B8',      // 0
      1, '#3B82F6',   // 1–10
      11, '#F97316',  // 11–30
      31, '#EF4444',  // 31+
    ],
    'circle-radius': [
      'step',
      ['get', 'visitCount'],
      6,           // 0
      1, 8,        // 1–10
      11, 11,      // 11–30
      31, 14,      // 31+
    ],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
    'circle-opacity': 0.9,
  },
};

const PARK_STATUS_LABEL: Record<ParkOverlayItem['status'], string> = {
  open: 'פתוח',
  closed: 'סגור',
  under_repair: 'בתיקון',
};

const PARK_STATUS_CLASSES: Record<ParkOverlayItem['status'], string> = {
  open: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-rose-100 text-rose-700 border-rose-200',
  under_repair: 'bg-amber-100 text-amber-700 border-amber-200',
};

const PARK_ACTIVITY_LABEL: Record<NonNullable<ParkOverlayItem['topActivity']>, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  strength: 'כוח',
};

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

/** Hebrew relative time used in the popup + popular-routes card. */
function formatRelativeHebrew(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'היום';
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'לפני שבוע' : `לפני ${weeks} שבועות`;
  }
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
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

  // Route overlay: fetched once per authority change.
  const [routes, setRoutes] = useState<RouteOverlayItem[]>([]);
  const [showRoutes, setShowRoutes] = useState(true);
  const [hoveredRoute, setHoveredRoute] = useState<{
    route: RouteOverlayItem;
    lat: number;
    lng: number;
  } | null>(null);

  // Parks overlay: fetched once per authority change. Same lifetime as routes.
  const [parks, setParks] = useState<ParkOverlayItem[]>([]);
  const [showParks, setShowParks] = useState(true);
  const [hoveredPark, setHoveredPark] = useState<{
    park: ParkOverlayItem;
    lat: number;
    lng: number;
  } | null>(null);

  // Age slider — kept locally and debounced into `filters` so dragging
  // doesn't re-trigger the live subscription / historical fetch on every tick.
  const [ageRange, setAgeRange] = useState<[number, number]>([
    DEFAULT_HEATMAP_FILTERS.ageMin,
    DEFAULT_HEATMAP_FILTERS.ageMax,
  ]);

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

  // ── ROUTE OVERLAY FETCH ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchRoutesForOverlay(authorityId)
      .then((items) => { if (!cancelled) setRoutes(items); })
      .catch((err) => console.error('[Heatmap] route overlay fetch error:', err));
    return () => { cancelled = true; };
  }, [authorityId]);

  // ── PARKS OVERLAY FETCH ────────────────────────────────────────────────
  // Mirrors the routes fetch lifecycle: one-shot per authority. Reads parks
  // by authorityId + sessions/workouts this month for visit/activity stats.
  useEffect(() => {
    let cancelled = false;
    fetchParksForOverlay(authorityId)
      .then((items) => { if (!cancelled) setParks(items); })
      .catch((err) => console.error('[Heatmap] parks overlay fetch error:', err));
    return () => { cancelled = true; };
  }, [authorityId]);

  // ── AGE SLIDER DEBOUNCE (300 ms) ───────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) =>
        prev.ageMin === ageRange[0] && prev.ageMax === ageRange[1]
          ? prev
          : { ...prev, ageMin: ageRange[0], ageMax: ageRange[1] },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [ageRange]);

  const stats = snapshot?.stats;
  const geojson = snapshot?.geojson ?? { type: 'FeatureCollection' as const, features: [] };

  // GeoJSON for the route overlay layer (one LineString per route).
  const routeGeojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature' as const,
      properties: {
        id: r.id,
        name: r.name,
        usageCount: r.usageCount,
        lastUsedIso: r.lastUsed ? r.lastUsed.toISOString() : null,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: r.path.map((p) => [p.lng, p.lat]),
      },
    })),
  }), [routes]);

  // GeoJSON for the parks overlay layer (one Point per park). Only `id` and
  // `visitCount` are needed in properties — the rest is read off the in-memory
  // `parks` array via id lookup when the user hovers (smaller tile payload).
  const parksGeojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: parks.map((p) => ({
      type: 'Feature' as const,
      properties: {
        id: p.id,
        visitCount: p.visitCount,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.lng, p.lat],
      },
    })),
  }), [parks]);

  // Layers the map is allowed to detect hover events on. Recomputed when
  // toggles flip so we never receive events for a hidden layer.
  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (showRoutes) ids.push(ROUTE_OVERLAY_LAYER_ID);
    if (showParks) ids.push(PARKS_OVERLAY_LAYER_ID);
    return ids;
  }, [showRoutes, showParks]);

  const handleFilterChange = useCallback(
    (key: keyof HeatmapFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── UNIFIED HOVER (routes + parks) ─────────────────────────────────────
  // Mapbox returns the topmost feature under the cursor across the
  // interactiveLayerIds list. We branch on `feat.layer.id` so each layer
  // updates only its own popup state and clears the other.
  const handleMapMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const feat = e.features?.[0];
    if (!feat) {
      if (hoveredRoute) setHoveredRoute(null);
      if (hoveredPark) setHoveredPark(null);
      return;
    }
    const layerId = feat.layer?.id;
    const props = feat.properties as { id?: string } | null | undefined;
    if (!props?.id) return;

    if (layerId === PARKS_OVERLAY_LAYER_ID) {
      const matched = parks.find((p) => p.id === props.id);
      if (matched) {
        setHoveredPark({ park: matched, lat: e.lngLat.lat, lng: e.lngLat.lng });
        if (hoveredRoute) setHoveredRoute(null);
      }
      return;
    }

    if (layerId === ROUTE_OVERLAY_LAYER_ID) {
      const matched = routes.find((r) => r.id === props.id);
      if (matched) {
        setHoveredRoute({ route: matched, lat: e.lngLat.lat, lng: e.lngLat.lng });
        if (hoveredPark) setHoveredPark(null);
      }
    }
  }, [routes, parks, hoveredRoute, hoveredPark]);

  const handleMapMouseLeave = useCallback(() => {
    setHoveredRoute(null);
    setHoveredPark(null);
  }, []);

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
        interactiveLayerIds={interactiveLayerIds}
        onMouseMove={handleMapMouseMove}
        onMouseLeave={handleMapMouseLeave}
        cursor={hoveredRoute || hoveredPark ? 'pointer' : 'auto'}
      >
        <Source id="active-workouts" type="geojson" data={geojson}>
          <Layer {...HEATMAP_LAYER_STYLE} />
        </Source>

        {/* Curated routes overlay — color by analytics.usageCount */}
        {showRoutes && routes.length > 0 && (
          <Source id="route-overlay" type="geojson" data={routeGeojson}>
            <Layer {...ROUTE_OVERLAY_LAYER_STYLE} />
          </Source>
        )}

        {/* Parks overlay — circle size + color by sessions.visitCount */}
        {showParks && parks.length > 0 && (
          <Source id="parks-overlay" type="geojson" data={parksGeojson}>
            <Layer {...PARKS_OVERLAY_LAYER_STYLE} />
          </Source>
        )}

        {/* Hover popup — name, usage count, last-used relative date */}
        {hoveredRoute && (
          <Popup
            longitude={hoveredRoute.lng}
            latitude={hoveredRoute.lat}
            anchor="bottom"
            closeButton={false}
            closeOnClick={false}
            offset={12}
            className="!font-sans"
          >
            <div dir="rtl" className="text-xs leading-relaxed text-gray-800 min-w-[160px]">
              <div className="font-bold text-gray-900 mb-0.5">{hoveredRoute.route.name}</div>
              <div className="text-gray-600">
                {hoveredRoute.route.usageCount.toLocaleString('he-IL')} שימושים
              </div>
              <div className="text-gray-400 text-[10px] mt-0.5">
                שימוש אחרון: {formatRelativeHebrew(hoveredRoute.route.lastUsed)}
              </div>
            </div>
          </Popup>
        )}

        {/* Park hover popup — name, monthly visit count, status badge,
            peak hour (if any), and gender split / top activity (if any) */}
        {hoveredPark && (
          <Popup
            longitude={hoveredPark.lng}
            latitude={hoveredPark.lat}
            anchor="bottom"
            closeButton={false}
            closeOnClick={false}
            offset={14}
            className="!font-sans"
          >
            <ParkPopupBody park={hoveredPark.park} />
          </Popup>
        )}
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
          className="absolute top-16 left-3 bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-xl z-10 min-w-[240px] border border-gray-200"
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
            className="w-full bg-gray-50 text-gray-900 text-xs rounded-lg px-2 py-1.5 mb-3 border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
          >
            <option value="all">הכל</option>
            <option value="running">ריצה</option>
            <option value="walking">הליכה</option>
            <option value="cycling">רכיבה</option>
            <option value="strength">כוח</option>
          </select>

          <label className="block text-xs text-gray-600 mb-2 font-medium">טווח גילאים</label>
          <div className="px-1 mb-3">
            <DualRangeSlider
              min={18}
              max={99}
              step={1}
              values={ageRange}
              onChange={setAgeRange}
              ariaLabelMin="גיל מינימום"
              ariaLabelMax="גיל מקסימום"
            />
          </div>

          <OverlayToggle
            icon={<RouteIcon size={13} />}
            label="הצג מסלולים"
            active={showRoutes}
            onToggle={() => setShowRoutes((v) => !v)}
          />
          <div className="h-2" />
          <OverlayToggle
            icon={<Trees size={13} />}
            label="הצג פארקים"
            active={showParks}
            onToggle={() => setShowParks((v) => !v)}
          />
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

/**
 * Reusable on/off pill used by the routes + parks layer toggles inside the
 * filter dropdown. Styled identically to keep the filter panel scannable.
 */
function OverlayToggle({
  icon,
  label,
  active,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-bold border transition-colors ${
        active
          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
      }`}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={`relative inline-block w-8 h-4 rounded-full transition-colors ${
          active ? 'bg-indigo-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
            active ? 'right-0.5' : 'right-[18px]'
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Park hover-popup body. RTL Hebrew card with:
 *   • Park name (bold)
 *   • "X ביקורים החודש" (visit count this month)
 *   • Status badge: פתוח / סגור / בתיקון
 *   • Optional: peak hour ("שעת שיא: HH:00") when sessions exist
 *   • Optional: gender split (M/F counts) when at least one is non-zero
 *   • Optional: top activity ("פעילות מובילה: ריצה") when available
 */
function ParkPopupBody({ park }: { park: ParkOverlayItem }) {
  const hasGenderData = park.genderSplit.male > 0 || park.genderSplit.female > 0;
  const peakHourLabel =
    park.peakHour != null ? `${String(park.peakHour).padStart(2, '0')}:00` : null;

  return (
    <div dir="rtl" className="text-xs leading-relaxed text-gray-800 min-w-[180px]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-bold text-gray-900 truncate">{park.name}</div>
        <span
          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${PARK_STATUS_CLASSES[park.status]}`}
        >
          {PARK_STATUS_LABEL[park.status]}
        </span>
      </div>
      <div className="text-gray-700">
        {park.visitCount.toLocaleString('he-IL')} ביקורים החודש
      </div>
      {peakHourLabel && (
        <div className="text-gray-500 text-[11px] mt-0.5">
          שעת שיא: {peakHourLabel}
        </div>
      )}
      {hasGenderData && (
        <div className="text-gray-500 text-[11px] mt-0.5">
          <span className="text-blue-500 font-bold">♂ {park.genderSplit.male}</span>
          <span className="mx-1 text-gray-300">·</span>
          <span className="text-pink-500 font-bold">♀ {park.genderSplit.female}</span>
        </div>
      )}
      {park.topActivity && (
        <div className="text-gray-500 text-[11px] mt-0.5">
          פעילות מובילה: {PARK_ACTIVITY_LABEL[park.topActivity]}
        </div>
      )}
    </div>
  );
}
