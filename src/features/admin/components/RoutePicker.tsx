'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Route as RouteIcon,
  Search,
  X,
  Gauge,
  Clock,
  Activity,
  Footprints,
  Bike,
  Dumbbell,
  CheckCircle2,
  ChevronRight,
  Construction,
} from 'lucide-react';
import { InventoryService } from '@/features/parks/core/services/inventory.service';
import type { Route } from '@/features/parks/core/types/route.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';

interface RoutePickerProps {
  authorityId?: string | null;
  value: string | null;
  onChange: (routeId: string, route: Route) => void;
  onClear: () => void;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'מאתגר',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200',
};

const ACTIVITY_ICONS: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  running: { icon: Activity, color: 'text-blue-500', label: 'ריצה' },
  walking: { icon: Footprints, color: 'text-emerald-500', label: 'הליכה' },
  cycling: { icon: Bike, color: 'text-purple-500', label: 'רכיבה' },
  workout: { icon: Dumbbell, color: 'text-orange-500', label: 'אימון' },
};

function getRouteActivity(route: Route): { icon: typeof Activity; color: string; label: string } {
  const type = route.activityType ?? route.type ?? 'running';
  return ACTIVITY_ICONS[type] ?? ACTIVITY_ICONS.running;
}

function formatDistance(km: number): string {
  if (km == null || isNaN(km)) return '—';
  return km >= 1 ? `${km.toFixed(1)} ק"מ` : `${Math.round(km * 1000)} מ'`;
}

export default function RoutePicker({ authorityId, value, onChange, onClear }: RoutePickerProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isGlobalFallback, setIsGlobalFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIsGlobalFallback(false);

    const hasAuthority = typeof authorityId === 'string' && authorityId.trim().length > 0;

    (async () => {
      try {
        let data: Route[];

        if (hasAuthority) {
          // Direct query by authorityId — bypasses the broken park-join
          data = await InventoryService.fetchRoutesByAuthorityId(authorityId!);
        } else {
          data = [];
        }

        // Global fallback: if authority query returned nothing, fetch ALL routes
        if (data.length === 0) {
          data = await InventoryService.fetchOfficialRoutes();
          if (!cancelled) setIsGlobalFallback(true);
        }

        // NO filters — admin sees everything (infrastructure, unpublished, etc.)
        if (!cancelled) {
          setRoutes(data);
          setAllRoutes(data);
        }
      } catch (err) {
        console.error('RoutePicker: failed to load routes', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authorityId]);

  const selectedRoute = useMemo(
    () => (value ? routes.find((r) => r.id === value) : null),
    [value, routes],
  );

  const filtered = useMemo(() => {
    // Search across all loaded routes (authority-scoped or global fallback)
    const pool = allRoutes.length > 0 ? allRoutes : routes;
    if (!search.trim()) return routes;
    const term = search.toLowerCase();
    return pool.filter(
      (r) =>
        r.name?.toLowerCase().includes(term) ||
        r.city?.toLowerCase().includes(term),
    );
  }, [routes, allRoutes, search]);

  const handleSelect = useCallback(
    (route: Route) => {
      onChange(route.id, route);
      setIsOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleToggleInfrastructure = useCallback(
    async (e: React.MouseEvent, route: Route) => {
      e.stopPropagation();
      const newVal = !route.isInfrastructure;
      try {
        await InventoryService.updateRoute(route.id, { isInfrastructure: newVal } as any);
        setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, isInfrastructure: newVal } : r));
        setAllRoutes(prev => prev.map(r => r.id === route.id ? { ...r, isInfrastructure: newVal } : r));
      } catch (err) {
        console.error('RoutePicker: toggle infrastructure failed', err);
      }
    },
    [],
  );

  const openDrawer = useCallback(() => {
    setIsOpen(true);
    setSearch('');
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  return (
    <>
      {/* ── Trigger: selected route card or "select" button ── */}
      {selectedRoute ? (
        <SelectedRouteCard route={selectedRoute} onClear={onClear} onChangeClick={openDrawer} />
      ) : (
        <button
          type="button"
          onClick={openDrawer}
          className="w-full flex items-center justify-between px-4 py-3 border-2 border-dashed border-cyan-300 rounded-xl text-sm bg-cyan-50/50 hover:bg-cyan-50 hover:border-cyan-400 transition-colors"
        >
          <span className="flex items-center gap-2 text-cyan-600 font-bold">
            <RouteIcon size={16} />
            בחר מסלול
          </span>
          <ChevronRight size={16} className="text-cyan-400" />
        </button>
      )}

      {/* ── Route Drawer (full-screen overlay) ── */}
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-white" dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100">
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
              <RouteIcon size={18} className="text-cyan-500" />
              בחר מסלול
            </h2>
            <button
              type="button"
              onClick={closeDrawer}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-50">
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full ps-3 pe-10 py-2.5 bg-gray-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-colors"
                placeholder="חפש לפי שם או עיר..."
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 font-bold">
              {loading ? 'טוען...' : `${filtered.length} מסלולים${isGlobalFallback ? ' (כל המסלולים)' : ''}`}
            </p>
          </div>

          {/* Route List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center py-16">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs text-gray-400 font-bold">טוען מסלולים...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <RouteIcon size={40} className="text-gray-200 mb-3" />
                <p className="text-sm font-bold text-gray-400">
                  {search ? 'לא נמצאו מסלולים תואמים' : 'אין מסלולים זמינים'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map((route) => {
                  const isSelected = value === route.id;
                  const act = getRouteActivity(route);
                  const ActIcon = act.icon;

                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => handleSelect(route)}
                      className={`w-full px-5 py-4 flex items-center gap-4 text-right transition-colors ${
                        isSelected
                          ? 'bg-cyan-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Activity icon circle */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-cyan-100' : 'bg-gray-100'
                      }`}>
                        <ActIcon size={20} className={isSelected ? 'text-cyan-600' : act.color} />
                      </div>

                      {/* Route info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-cyan-700' : 'text-gray-900'}`}>
                          {route.name}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                          <span className="flex items-center gap-0.5">
                            <Gauge size={11} />
                            {formatDistance(route.distance)}
                          </span>
                          {route.duration > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Clock size={11} />
                              {route.duration} דק׳
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                            DIFFICULTY_COLORS[route.difficulty] ?? 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}>
                            {DIFFICULTY_LABELS[route.difficulty] ?? route.difficulty}
                          </span>
                          <span className={`text-[10px] font-bold ${act.color}`}>
                            {act.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {route.city && (
                            <span className="text-[10px] text-gray-300">{route.city}</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleToggleInfrastructure(e, route)}
                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors ${
                              route.isInfrastructure
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            }`}
                            title={route.isInfrastructure ? 'סמן כמסלול רגיל' : 'סמן כתשתית'}
                          >
                            <Construction size={9} />
                            {route.isInfrastructure ? 'תשתית' : 'רגיל'}
                          </button>
                        </div>
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <CheckCircle2 size={20} className="text-cyan-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Selected Route Card ──────────────────────────────────────────────────────

function SelectedRouteCard({
  route,
  onClear,
  onChangeClick,
}: {
  route: Route;
  onClear: () => void;
  onChangeClick: () => void;
}) {
  const act = getRouteActivity(route);
  const ActIcon = act.icon;

  return (
    <div className="flex items-center gap-3 p-3 bg-cyan-50 border border-cyan-200 rounded-xl" dir="rtl">
      <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
        <ActIcon size={18} className="text-cyan-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-cyan-800 truncate">{route.name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-cyan-600">
          <span className="flex items-center gap-0.5">
            <Gauge size={10} />
            {formatDistance(route.distance)}
          </span>
          {route.duration > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock size={10} />
              {route.duration} דק׳
            </span>
          )}
          <span className="font-bold">{act.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onChangeClick}
          className="px-2 py-1 text-[10px] font-bold text-cyan-600 hover:bg-cyan-100 rounded-lg transition-colors"
        >
          שנה
        </button>
        <button
          type="button"
          onClick={onClear}
          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
