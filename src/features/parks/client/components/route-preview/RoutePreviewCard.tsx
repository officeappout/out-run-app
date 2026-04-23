'use client';

import React, { useMemo, useState } from 'react';
import { X, MapPin, Clock, Gauge, Navigation, Play, PersonStanding, Footprints, Activity, Bike, Users, UserPlus } from 'lucide-react';
import { Route, ActivityType } from '../../../core/types/route.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import type { DevSimulationState } from '../../../core/hooks/useDevSimulation';

interface RoutePreviewCardProps {
  route: Route;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onStartWorkout?: (route: Route) => void;
  onNavigate?: (route: Route) => void;
  onActivityChange?: (act: ActivityType) => void;
  currentActivity?: ActivityType;
  devSim?: DevSimulationState;
  /** Fires when user taps "Join" on a route with a linked community event */
  onJoinSession?: (eventId: string) => Promise<void>;
}

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  easy: { label: 'קל', color: 'bg-green-100 text-green-700' },
  medium: { label: 'בינוני', color: 'bg-amber-100 text-amber-700' },
  hard: { label: 'קשה', color: 'bg-red-100 text-red-700' },
};

const ACTIVITY_LABELS: Record<string, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
  workout: 'אימון',
};

function formatDistance(km: number): string {
  if (km >= 1) return `${km.toFixed(1)} ק"מ`;
  return `${Math.round(km * 1000)} מ'`;
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h} שעה ${m} דק'` : `${h} שעה`;
  }
  return `${Math.round(minutes)} דק'`;
}

export default function RoutePreviewCard({
  route,
  userLocation,
  onClose,
  onStartWorkout,
  onNavigate,
  onActivityChange,
  currentActivity,
  devSim,
  onJoinSession,
}: RoutePreviewCardProps) {
  const { setMode } = useMapMode();
  const [isJoining, setIsJoining] = useState(false);

  const distToStart = useMemo(() => {
    if (!userLocation || !route.path || route.path.length === 0) return null;
    const [lng, lat] = route.path[0];
    const km = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
    return distanceLabel(km);
  }, [userLocation, route.path]);

  const diff = DIFFICULTY_LABELS[route.difficulty] ?? DIFFICULTY_LABELS.easy;
  const activityLabel = ACTIVITY_LABELS[route.activityType || route.type] || '';

  const routeColor = useMemo(() => {
    if (route.activityType === 'cycling' || route.type === 'cycling') return '#8B5CF6';
    if (route.features?.environment === 'nature') return '#10B981';
    return '#3b82f6';
  }, [route]);

  return (
    <div className="absolute bottom-[100px] left-4 right-4 z-[60] animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-zinc-700">
        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-3 left-3 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Top: Color bar representing the route */}
        <div className="h-2 w-full" style={{ backgroundColor: routeColor }} />

        <div className="p-4" dir="rtl">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 dark:text-white text-base truncate">
                {route.name || 'מסלול ללא שם'}
              </h3>
              {route.city && (
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {route.city}
                </p>
              )}
            </div>

            {/* Difficulty badge */}
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${diff.color} whitespace-nowrap`}>
              {diff.label}
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3">
            {route.distance > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-300">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Gauge className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <span className="font-semibold">{formatDistance(route.distance)}</span>
              </div>
            )}

            {route.duration > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-300">
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <span className="font-semibold">{formatDuration(route.duration)}</span>
              </div>
            )}

            {activityLabel && (
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 rounded-md text-xs">
                {activityLabel}
              </span>
            )}

            {distToStart && (
              <span className="mr-auto text-xs text-gray-400 dark:text-zinc-500">
                {distToStart} מההתחלה
              </span>
            )}
          </div>

          {/* Activity mode toggle (navigation routes only) */}
          {route.id?.startsWith('nav-') && onActivityChange && (
            <div className="flex gap-1 mt-3 bg-gray-100 rounded-xl p-1">
              {(['walking', 'running', 'cycling'] as ActivityType[]).map(act => (
                <button
                  key={act}
                  onClick={() => onActivityChange(act)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                    currentActivity === act ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {act === 'walking' ? <Footprints size={12} /> : act === 'running' ? <Activity size={12} /> : <Bike size={12} />}
                  {act === 'walking' ? 'הליכה' : act === 'running' ? 'ריצה' : 'רכיבה'}
                </button>
              ))}
            </div>
          )}

          {/* Community session banner */}
          {route.linkedSessions?.eventId && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl" dir="rtl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-800 truncate">
                      {route.linkedSessions.isRecurring ? 'אימון קבוצתי' : route.linkedSessions.eventLabel}
                    </p>
                    <p className="text-[10px] text-emerald-600">
                      {route.linkedSessions.nextStartTime && (() => {
                        const d = new Date(route.linkedSessions!.nextStartTime!);
                        if (isNaN(d.getTime())) return 'מועד קרוב';
                        const now = new Date();
                        const isToday = d.toDateString() === now.toDateString();
                        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        return isToday ? `היום ב-${time}` : d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`;
                      })()}
                      {route.linkedSessions.spotsLeft != null && (
                        <span className="font-bold">
                          {' '}· {route.linkedSessions.spotsLeft > 0
                            ? `${route.linkedSessions.spotsLeft} מקומות נותרו`
                            : 'מלא'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {/* Participant avatars */}
                {route.linkedSessions.avatars && route.linkedSessions.avatars.length > 0 && (
                  <div className="flex -space-x-1.5 rtl:space-x-reverse flex-shrink-0">
                    {route.linkedSessions.avatars.slice(0, 3).map((a) => (
                      <div
                        key={a.uid}
                        className="w-6 h-6 rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-[9px] font-black text-emerald-700 overflow-hidden"
                        title={a.name}
                      >
                        {a.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          a.name.charAt(0)
                        )}
                      </div>
                    ))}
                    {(route.linkedSessions.currentRegistrations ?? 0) > 3 && (
                      <div className="w-6 h-6 rounded-full border-2 border-white bg-emerald-200 flex items-center justify-center text-[9px] font-black text-emerald-700">
                        +{(route.linkedSessions.currentRegistrations ?? 0) - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {onJoinSession && route.linkedSessions.spotsLeft !== 0 && (
                <button
                  onClick={async () => {
                    if (!route.linkedSessions?.eventId) return;
                    setIsJoining(true);
                    try {
                      await onJoinSession(route.linkedSessions.eventId);
                    } finally {
                      setIsJoining(false);
                    }
                  }}
                  disabled={isJoining}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  {isJoining ? 'מצטרף...' : 'אני מגיע'}
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => { onStartWorkout?.(route); setMode('planned_preview'); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Play className="h-4 w-4" />
              התחל אימון
            </button>
            <button
              onClick={() => onNavigate?.(route)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-gray-700 dark:text-zinc-200 rounded-xl text-sm font-medium transition-colors"
            >
              <Navigation className="h-4 w-4" />
              ניווט
            </button>
          </div>

          {/* Debug: Simulate Walking */}
          {devSim && (
            <div className="mt-2">
              {devSim.isSimulating ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all duration-150"
                      style={{ width: `${Math.round(devSim.simulationProgress * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-orange-500 min-w-[32px] text-center">
                    {Math.round(devSim.simulationProgress * 100)}%
                  </span>
                  <button
                    onClick={devSim.stopSimulation}
                    className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-[11px] font-bold transition-colors"
                  >
                    עצור
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => devSim.startSimulation(route, 1)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[11px] font-bold transition-colors border border-orange-200"
                  >
                    <PersonStanding className="h-3.5 w-3.5" />
                    דמה הליכה (6 קמ&quot;ש)
                  </button>
                  <button
                    onClick={() => devSim.startSimulation(route, 5)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[11px] font-bold transition-colors border border-orange-200"
                  >
                    x5
                  </button>
                  <button
                    onClick={() => devSim.startSimulation(route, 20)}
                    className="flex items-center justify-center gap-1 px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[11px] font-bold transition-colors border border-orange-200"
                  >
                    x20
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
