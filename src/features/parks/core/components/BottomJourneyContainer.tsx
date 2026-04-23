"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Timer, Car, MapPin, ChevronLeft, Zap, Bike, Dumbbell, Navigation, Users } from 'lucide-react';
import { Route, ActivityType } from '../types/route.types';
import Image from 'next/image';

function formatSessionTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'מועד קרוב';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (isToday) return `היום ${time}`;
  if (isTomorrow) return `מחר ${time}`;
  return `${date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} ${time}`;
}

function ParticipantAvatars({ avatars }: { avatars: { uid: string; name: string; photoURL?: string }[] }) {
  if (avatars.length === 0) return null;
  return (
    <div className="flex -space-x-2 rtl:space-x-reverse">
      {avatars.slice(0, 3).map((a) => (
        <div
          key={a.uid}
          className="w-5 h-5 rounded-full border-2 border-white bg-cyan-100 flex items-center justify-center text-[8px] font-black text-cyan-700 overflow-hidden"
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
    </div>
  );
}

// ── Activity icon for the no-image placeholder ──────────────────────
function ActivityIcon({ type, size = 32 }: { type?: ActivityType | string; size?: number }) {
  switch (type) {
    case 'running':  return <Zap size={size} className="text-[#00E5FF]" />;
    case 'cycling':  return <Bike size={size} className="text-[#00E5FF]" />;
    case 'workout':  return <Dumbbell size={size} className="text-[#00E5FF]" />;
    case 'walking':
    default:         return <Navigation size={size} className="text-[#00E5FF]" />;
  }
}

interface BottomJourneyContainerProps {
  routes: Route[];
  onRouteFocus?: (route: Route) => void;
  focusedRouteId?: string | null;
  onStartWorkout?: () => void;
  onShowDetails?: () => void;
  /** Opens the full RouteDetailSheet for a route */
  onShowRouteDetail?: (route: Route) => void;
  loadingRouteIds?: Set<string>;
}

export default function BottomJourneyContainer({
  routes,
  onRouteFocus,
  focusedRouteId,
  onStartWorkout,
  onShowDetails,
  onShowRouteDetail,
  loadingRouteIds,
}: BottomJourneyContainerProps) {
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync carousel when focusedRouteId changes externally ──
  useEffect(() => {
    if (!focusedRouteId || routes.length === 0) return;
    const index = routes.findIndex(r => r.id === focusedRouteId);
    if (index === -1) return;

    if (index !== activeRouteIndex) setActiveRouteIndex(index);

    if (carouselRef.current) {
      const cardWidth = carouselRef.current.offsetWidth * 0.85 + 12;
      const targetScroll = index * cardWidth;
      const currentScroll = carouselRef.current.scrollLeft;
      if (Math.abs(currentScroll - targetScroll) > 20) {
        isProgrammaticScroll.current = true;
        if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
        programmaticScrollTimer.current = setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
        carouselRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedRouteId, routes]);

  // ── Snap-to-focus on scroll ──
  const handleScroll = useCallback(() => {
    if (isProgrammaticScroll.current) return;
    if (!carouselRef.current) return;
    const scrollLeft = carouselRef.current.scrollLeft;
    const cardWidth = carouselRef.current.offsetWidth * 0.85 + 12;
    const newIndex = Math.round(scrollLeft / cardWidth);
    if (newIndex !== activeRouteIndex && newIndex >= 0 && newIndex < routes.length) {
      setActiveRouteIndex(newIndex);
      const route = routes[newIndex];
      if (route && onRouteFocus && route.id !== focusedRouteId) onRouteFocus(route);
    }
  }, [activeRouteIndex, routes, onRouteFocus, focusedRouteId]);

  useEffect(() => {
    return () => { if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current); };
  }, []);

  // Inject scrollbar-hide style once
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `.scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  if (routes.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="pb-[85px] pointer-events-auto">
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          className="w-full overflow-x-auto snap-x snap-mandatory flex gap-3 pb-2 scrollbar-hide"
          style={{ paddingInlineStart: '16px', paddingInlineEnd: '40px', scrollBehavior: 'smooth' }}
        >
          {routes.map((route, index) => {
            const isActive = index === activeRouteIndex;
            const distFromUser   = route.distanceFromUser ?? 0;
            const isReachable    = route.isReachableWithoutCar ?? true;
            const totalDistKm    = route.distance || 0;
            const isGenerated    = route.id?.startsWith('generated');
            const isLoading      = loadingRouteIds?.has(route.id);
            const durationMin    = Math.round(route.duration || 0);
            const coverImage     = route.images?.[0] || null;
            const activityType   = route.activityType || route.type;
            const sourceName     = route.source?.name || (isGenerated ? 'מותאם אישית' : 'מסלול רשמי');

            return (
              <div
                key={route.id}
                onClick={() => {
                  if (onRouteFocus) onRouteFocus(route);
                  if (onShowRouteDetail) onShowRouteDetail(route);
                }}
                className={`w-[85vw] max-w-[340px] snap-center flex-shrink-0 bg-white rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
                  isActive
                    ? 'shadow-[0_0_0_2px_rgba(0,229,255,0.65),0_8px_24px_rgba(0,0,0,0.14)]'
                    : 'shadow-md opacity-88 scale-[0.97]'
                }`}
                style={{ width: '85%', minWidth: '85%' }}
              >
                {/* ── Horizontal content row ── */}
                <div className="flex flex-row-reverse items-stretch min-h-[96px]" dir="rtl">

                  {/* ── Image / Placeholder (right side in RTL) ── */}
                  <div className="w-[96px] shrink-0 relative self-stretch">
                    {coverImage ? (
                      <Image
                        src={coverImage}
                        alt={route.name || 'מסלול'}
                        fill
                        className="object-cover"
                        sizes="96px"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 bg-cyan-50 flex flex-col items-center justify-center gap-1">
                        <ActivityIcon type={activityType} size={28} />
                        <span className="text-[9px] font-bold text-cyan-400 text-center leading-tight px-1">
                          {activityType === 'running' ? 'ריצה'
                            : activityType === 'cycling' ? 'רכיבה'
                            : activityType === 'workout' ? 'כושר'
                            : 'הליכה'}
                        </span>
                      </div>
                    )}

                    {/* Reachability badge pinned top-left of the image */}
                    {!isReachable && (
                      <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-gray-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                        <Car size={8} />
                        נסיעה
                      </div>
                    )}
                  </div>

                  {/* ── Text content (left side in RTL) ── */}
                  <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0" dir="rtl">
                    {/* Source pill */}
                    <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full self-start leading-tight">
                      {sourceName}
                    </span>

                    {/* Community session badge */}
                    {route.linkedSessions?.nextStartTime && (
                      <div className="flex items-center gap-1.5 self-start">
                        <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Users size={10} className="text-emerald-600" />
                          <span className="text-[10px] font-bold text-emerald-700 leading-tight">
                            {formatSessionTime(route.linkedSessions.nextStartTime)}
                          </span>
                          {route.linkedSessions.spotsLeft != null && (
                            <span className="text-[9px] font-bold text-emerald-500">
                              · {route.linkedSessions.spotsLeft > 0 ? `${route.linkedSessions.spotsLeft} מקומות` : 'מלא'}
                            </span>
                          )}
                        </div>
                        {route.linkedSessions.avatars && route.linkedSessions.avatars.length > 0 && (
                          <ParticipantAvatars avatars={route.linkedSessions.avatars} />
                        )}
                      </div>
                    )}

                    {/* Route name */}
                    <h3 className="text-sm font-black text-gray-900 leading-tight line-clamp-2">
                      {route.name}
                    </h3>

                    {/* Stats row */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <MapPin size={11} className="text-[#00E5FF] shrink-0" />
                        <span className="text-xs font-bold text-gray-700">{totalDistKm.toFixed(1)}</span>
                        <span className="text-[10px] text-gray-400">{"ק״מ"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Timer size={11} className="text-[#00E5FF] shrink-0" />
                        <span className="text-xs font-bold text-gray-700">{durationMin}</span>
                        <span className="text-[10px] text-gray-400">{"דק׳"}</span>
                      </div>
                      {distFromUser > 0.1 && isReachable && (
                        <span className="text-[10px] text-gray-400 mr-auto">
                          {distFromUser.toFixed(1)} ממך
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── CTA button ── */}
                <div className="px-3 pb-3 pt-0">
                  {isLoading ? (
                    <div className="w-full py-2.5 rounded-xl bg-gray-100 flex items-center justify-center">
                      <span className="text-xs text-gray-400 font-bold animate-pulse">טוען...</span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRouteFocus) onRouteFocus(route);
                        if (!isReachable) {
                          const [startLng, startLat] = route.path[0];
                          window.open(`https://waze.com/ul?ll=${startLat},${startLng}&navigate=yes`, '_blank');
                        } else if (isGenerated && onShowDetails) {
                          onShowDetails();
                        } else if (onStartWorkout) {
                          onStartWorkout();
                        }
                      }}
                      className="w-full py-2.5 rounded-xl font-black text-sm text-[#0f172a] active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-400/20"
                      style={{ background: 'linear-gradient(135deg, #00E5FF 0%, #0891b2 100%)' }}
                    >
                      <Play size={14} fill="currentColor" />
                      {isReachable ? 'צא לדרך' : 'נווט להתחלה'}
                      <ChevronLeft size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
