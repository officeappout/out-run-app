"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Navigation, Bike, Footprints, Activity, ChevronDown, Coins, Timer, Car, Shuffle, Settings } from 'lucide-react';
import { Route, ActivityType } from '../types/route.types';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import WorkoutSettingsDrawer from '@/features/workout-engine/players/running/components/FreeRun/WorkoutSettingsDrawer';

interface BottomJourneyContainerProps {
  routes: Route[];
  currentActivity: ActivityType;
  onActivityChange: (type: ActivityType) => void;
  userLocation: { lat: number, lng: number } | null;
  onRouteUpdated?: (routeId: string, newPath: [number, number][], newDistance?: number) => void;
  onShuffle?: () => void;
  onRouteFocus?: (route: Route) => void;
  focusedRouteId?: string | null;
  isGeneratedRoute?: boolean;
  workoutMode?: 'free' | 'discover';
  onModeChange?: (mode: 'free' | 'discover') => void;
  onStartWorkout?: () => void;
  onShowDetails?: () => void;
  loadingRouteIds?: Set<string>;
}

export default function BottomJourneyContainer({
  routes,
  currentActivity,
  onActivityChange,
  userLocation,
  onShuffle,
  onRouteFocus,
  focusedRouteId,
  isGeneratedRoute = false,
  workoutMode: externalMode,
  onModeChange: onExternalModeChange,
  onStartWorkout,
  onShowDetails,
  loadingRouteIds
}: BottomJourneyContainerProps) {

  const [internalMode, setInternalMode] = useState<'free' | 'discover'>('discover');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const mode = externalMode ?? internalMode;

  const setMode = (newMode: 'free' | 'discover') => {
    if (onExternalModeChange) {
      onExternalModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }
  };

  const [isActivityMenuOpen, setIsActivityMenuOpen] = useState(false);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // סגירת תפריט בלחיצה בחוץ
  useEffect(() => {
    const closeMenu = () => setIsActivityMenuOpen(false);
    if (isActivityMenuOpen) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [isActivityMenuOpen]);

  const activities = [
    { id: 'running', label: 'ריצה', icon: Activity, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'cycling', label: 'רכיבה', icon: Bike, color: 'text-green-600', bg: 'bg-green-50' },
    { id: 'walking', label: 'הליכה', icon: Footprints, color: 'text-blue-600', bg: 'bg-blue-50' },
  ] as const;

  const activeActivityConfig = activities.find(a => a.id === currentActivity) || activities[0];

  // סנכרון אינדקס הכרטיס עם המסלול הנבחר במפה (לוגיקה חכמה למניעת קפיצות)
  useEffect(() => {
    if (focusedRouteId && routes.length > 0) {
      const index = routes.findIndex(r => r.id === focusedRouteId);
      if (index !== -1 && index !== activeRouteIndex) {
        setActiveRouteIndex(index);

        if (carouselRef.current) {
          const cardWidth = carouselRef.current.offsetWidth * 0.85 + 12; // Width + Gap
          const targetScroll = index * cardWidth;
          const currentScroll = carouselRef.current.scrollLeft;

          // 👇 התיקון: גולל רק אם המרחק גדול (כלומר לא המשתמש גלל לשם הרגע)
          if (Math.abs(currentScroll - targetScroll) > 20) {
            carouselRef.current.scrollTo({
              left: targetScroll,
              behavior: 'smooth'
            });
          }
        }
      }
    } else if (routes.length > 0 && activeRouteIndex === 0 && !focusedRouteId) {
      // בחירת ברירת מחדל
      if (onRouteFocus) {
        onRouteFocus(routes[0]);
      }
    }
  }, [focusedRouteId, routes, activeRouteIndex, onRouteFocus]);

  // זיהוי גלילה ידנית
  const handleScroll = useCallback(() => {
    if (!carouselRef.current) return;

    const scrollLeft = carouselRef.current.scrollLeft;
    const containerWidth = carouselRef.current.offsetWidth;
    const cardWidth = containerWidth * 0.85 + 12;

    // עיגול לאינדקס הקרוב
    const newIndex = Math.round(scrollLeft / cardWidth);

    if (newIndex !== activeRouteIndex && newIndex >= 0 && newIndex < routes.length) {
      setActiveRouteIndex(newIndex);
      const route = routes[newIndex];
      // עדכון המפה רק אם באמת עברנו כרטיס
      if (route && onRouteFocus && route.id !== focusedRouteId) {
        onRouteFocus(route);
      }
    }
  }, [activeRouteIndex, routes, onRouteFocus, focusedRouteId]);

  // CSS להסתרת סרגל גלילה
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">

      {/* --- Header: Activity & Mode --- */}
      <div className="absolute top-[140px] left-0 right-0 px-4 flex justify-between items-start pointer-events-auto z-50">

        <div className="relative z-50">
          <button
            onClick={(e) => { e.stopPropagation(); setIsActivityMenuOpen(!isActivityMenuOpen); }}
            className="flex items-center gap-2 bg-white/95 backdrop-blur shadow-sm border border-gray-100 pl-4 pr-3 py-2 rounded-full transition-all active:scale-95"
          >
            <activeActivityConfig.icon size={18} className={activeActivityConfig.color} />
            <span className="text-xs font-bold text-gray-700">{activeActivityConfig.label}</span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isActivityMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isActivityMenuOpen && (
            <div className="absolute top-full mt-2 left-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-36 animate-in fade-in zoom-in-95 duration-200">
              {activities.map((act) => (
                <button
                  key={act.id}
                  onClick={() => { onActivityChange(act.id as ActivityType); setIsActivityMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${currentActivity === act.id ? 'bg-gray-50' : ''}`}
                >
                  <act.icon size={16} className={act.color} />
                  <span className={`text-xs ${currentActivity === act.id ? 'font-bold text-black' : 'font-medium text-gray-500'}`}>{act.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-100 p-1 rounded-full flex">
          <button onClick={() => setMode('discover')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'discover' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}>גלה</button>
          <button onClick={() => setMode('free')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'free' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}>חופשי</button>
        </div>
      </div>

      {/* --- Cards Carousel --- */}
      <div className="absolute bottom-0 left-0 right-0 pb-[85px] pointer-events-auto">

        {mode === 'discover' && routes.length > 0 ? (
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            className="w-full overflow-x-auto snap-x snap-mandatory flex gap-3 pb-2 scrollbar-hide"
            style={{
              paddingLeft: '16px',
              paddingRight: '40px',
              scrollBehavior: 'smooth',
            }}
          >
            {routes.map((route, index) => {
              const isActive = index === activeRouteIndex;
              const distFromUser = route.distanceFromUser ?? 0;
              const isReachable = route.isReachableWithoutCar ?? true;
              const totalTripDistance = route.distance || 0;
              const displayScore = route.score ?? 0;
              const isGenerated = route.id?.startsWith('generated');
              const isLoading = loadingRouteIds?.has(route.id);
              // 👇 זמן תמיד בדקות: Mapbox מחזיר שניות, אבל אנחנו כבר ממירים לדקות בבניית ה-Route
              const durationMinutes = Math.round(route.duration || 0);

              return (
                <div
                  key={route.id}
                  onClick={() => { if (onRouteFocus) onRouteFocus(route); }}
                  className={`w-[85vw] max-w-[320px] snap-center bg-white rounded-[24px] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 relative flex-shrink-0 transition-all ${isActive ? 'scale-100 opacity-100 border-cyan-400 ring-1 ring-cyan-100' : 'scale-95 opacity-85'}`}
                  style={{ width: '85%', minWidth: '85%' }}
                >

                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="bg-purple-50 text-purple-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-purple-100 tracking-wide whitespace-nowrap">
                        {isGenerated ? 'Generated' : route.source?.name || 'מסלול'}
                      </div>
                      {!isReachable && (
                        <div className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                          <Car size={10} />
                          נסיעה
                        </div>
                      )}
                    </div>

                    {isGenerated && onShuffle && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShuffle();
                        }}
                        className="p-1.5 bg-gray-50 hover:bg-cyan-50 text-gray-500 hover:text-cyan-600 rounded-full transition-colors active:scale-95 shrink-0 border border-gray-100"
                        title="החלף מסלול"
                      >
                        <Shuffle size={16} />
                      </button>
                    )}
                  </div>

                  <div className="mb-3">
                    <h3 className="text-xl font-black text-gray-900 leading-tight mb-1 line-clamp-1">{route.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                      <span className="line-clamp-1">{route.description || 'מסלול מותאם אישית'}</span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 mb-3 relative">
                    {/* Skeleton Overlay */}
                    {isLoading && (
                      <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] rounded-xl flex items-center justify-center gap-1.5 cursor-wait">
                        <div className="flex-1 h-full bg-gray-100 animate-pulse rounded-xl"></div>
                        <div className="flex-1 h-full bg-gray-100 animate-pulse rounded-xl"></div>
                        <div className="flex-1 h-full bg-gray-100 animate-pulse rounded-xl"></div>
                      </div>
                    )}

                    <div className="flex-1 bg-yellow-50 border border-yellow-100 rounded-xl p-2 flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1 text-yellow-600 mb-0.5">
                        <Coins size={12} fill="currentColor" />
                        <span className="text-[9px] font-bold uppercase">תגמול</span>
                      </div>
                      <span className="text-base font-black text-gray-900">{Math.round(displayScore)}</span>
                    </div>

                    <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-2 flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
                        <Footprints size={12} />
                        <span className="text-[9px] font-bold uppercase">מרחק</span>
                      </div>
                      <span className="text-base font-bold text-gray-900">
                        {totalTripDistance.toFixed(1)}
                        <span className="text-[10px] font-normal text-gray-500">{"ק״מ"}</span>
                      </span>
                    </div>

                    <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-2 flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
                        <Timer size={12} />
                        <span className="text-[9px] font-bold uppercase">זמן</span>
                      </div>
                      <span className="text-base font-bold text-gray-900">{durationMinutes}<span className="text-[10px] font-normal text-gray-500">{"דק׳"}</span></span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isLoading) return;

                      if (onRouteFocus) onRouteFocus(route);

                      if (isReachable) {
                        // For generated routes, show details first
                        if (isGenerated && onShowDetails) {
                          onShowDetails();
                        } else if (onStartWorkout) {
                          // For official routes, start directly
                          onStartWorkout();
                        }
                      } else {
                        const [startLng, startLat] = route.path[0];
                        const wazeUrl = `https://waze.com/ul?ll=${startLat},${startLng}&navigate=yes`;
                        window.open(wazeUrl, '_blank');
                      }
                    }}
                    className={`w-full py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5 text-base leading-tight relative overflow-hidden ${isLoading ? 'bg-gray-100 text-gray-400 cursor-wait' : isReachable ? 'bg-black text-white hover:bg-gray-800' : 'bg-gray-800 text-white'}`}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2 animate-pulse text-sm">
                        <span>טוען מסלול מחדש...</span>
                      </div>
                    ) : (
                      isReachable ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Play size={18} fill="currentColor" />
                            {isGenerated ? 'פרטי אימון' : 'צא לדרך'}
                          </div>
                          {!isGenerated && distFromUser > 0.1 && (
                            <span className="text-[9px] font-normal opacity-70">
                              כולל הגעה ({distFromUser.toFixed(1)} {"ק״מ"})
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Navigation size={18} fill="currentColor" />
                          סע להתחלה
                        </div>
                      )
                    )}
                  </button>
                </div>
              );
            })}
          </div>

        ) : mode === 'free' ? (
          <div className="px-4">
            <div className="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-2xl text-center border border-gray-100 relative">
              {/* Settings Icon - Top Right */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px]"
                aria-label="הגדרות אימון"
              >
                <Settings size={20} className="text-gray-600" />
              </button>
              
              <h3 className="text-xl font-black mb-2 text-gray-900">
                {currentActivity === 'running' ? 'ריצה חופשית' :
                  currentActivity === 'cycling' ? 'רכיבה חופשית' :
                    'הליכה או ריצה חופשית'}
              </h3>
              <p className="text-gray-500 text-sm mb-6">ללא יעדים מוגדרים, רק אתה והדרך.</p>
              <button
                onClick={async () => {
                  // Unlock audio engine for iOS Safari (must be in user gesture handler)
                  if (typeof window !== 'undefined') {
                    const { audioService } = await import('@/features/workout-engine/core/services/AudioService');
                    audioService.unlock();
                  }
                  
                  // Force Premium Free Run UI
                  useRunningPlayer.getState().setRunMode('free');
                  if (onStartWorkout) onStartWorkout();
                }}
                className="w-full bg-cyan-500 text-white py-4 rounded-xl font-bold text-lg shadow-cyan-500/30 shadow-lg active:scale-95 transition-transform hover:bg-cyan-600"
              >
                התחל אימון 🚀
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Settings Drawer */}
      <WorkoutSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div >
  );
}