"use client";

import React, { useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import {
    MapPin,
    Footprints,
    Activity,
    Bike,
    Play,
    X,
    Clock,
    Star,
    Trees,
    Droplets,
    Home,
    Briefcase,
    Bookmark,
    Search,
    Loader2,
    ChevronRight,
    Gauge,
    ChevronUp,
    Users,
} from 'lucide-react';
import { Route, ActivityType } from '../types/route.types';
import type { NavVariants, RouteVariant, SearchSuggestion } from '../hooks/useSearchNavigation';
import { Route as RouteIcon } from 'lucide-react';

export type NavHubState = 'idle' | 'searching' | 'navigating';

const SUGGESTION_ICON: Record<string, typeof MapPin> = {
  park: Trees,
  route: RouteIcon,
  mapbox: MapPin,
};

interface NavigationHubProps {
    navState: NavHubState;
    onStateChange: (state: NavHubState) => void;
    navigationVariants: NavVariants;
    selectedVariant: RouteVariant;
    onVariantSelect: (v: RouteVariant) => void;
    navActivity: ActivityType;
    onActivityChange: (a: ActivityType) => void;
    isLoading: boolean;
    onStart: () => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    suggestions: SearchSuggestion[];
    onAddressSelect: (addr: SearchSuggestion) => void;
    isSearching?: boolean;
    inputRef?: React.RefObject<HTMLInputElement>;
    groupAheadMeters?: number | null;
    groupMemberCount?: number;
}

const VARIANT_META: Record<RouteVariant, { label: string; icon: React.ElementType; color: string; bg: string }> = {
    recommended: { label: 'מומלץ', icon: Star, color: 'text-blue-600', bg: 'bg-blue-50' },
    scenic: { label: 'ירוק', icon: Trees, color: 'text-green-600', bg: 'bg-green-50' },
    facilityRich: { label: 'מתקנים', icon: Droplets, color: 'text-cyan-600', bg: 'bg-cyan-50' },
};

const ACTIVITY_META: Array<{ id: ActivityType; label: string; icon: React.ElementType }> = [
    { id: 'walking', label: 'הליכה', icon: Footprints },
    { id: 'running', label: 'ריצה', icon: Activity },
    { id: 'cycling', label: 'רכיבה', icon: Bike },
];

const QUICK_ACTIONS = [
    { id: 'home', label: 'בית', icon: Home, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { id: 'work', label: 'עבודה', icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'saved', label: 'שמורים', icon: Bookmark, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'parks', label: 'פארקים', icon: Trees, color: 'text-green-500', bg: 'bg-green-50' },
];

export default function NavigationHub({
    navState,
    onStateChange,
    navigationVariants,
    selectedVariant,
    onVariantSelect,
    navActivity,
    onActivityChange,
    isLoading,
    onStart,
    searchQuery,
    onSearchChange,
    suggestions,
    onAddressSelect,
    isSearching = false,
    inputRef,
    groupAheadMeters = null,
    groupMemberCount = 0,
}: NavigationHubProps) {
    const localInputRef = useRef<HTMLInputElement>(null);
    const actualInputRef = inputRef || localInputRef;
    const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
    const dragControls = useDragControls();

    useEffect(() => {
        if (navState === 'navigating') setIsDrawerExpanded(true);
    }, [navState]);

    useEffect(() => {
        if (navState === 'searching' && actualInputRef.current) {
            setTimeout(() => actualInputRef.current?.focus(), 100);
        }
    }, [navState, actualInputRef]);

    const displayItems = searchQuery.length >= 3 ? suggestions : [];

    if (navState === 'searching') {
        return (
            <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                <div className="pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pb-3 border-b border-gray-100">
                    <div className="bg-gray-100 rounded-2xl h-12 flex items-center px-3 gap-2">
                        <Search size={18} className="text-gray-400 shrink-0" />
                        <input
                            ref={actualInputRef}
                            type="text"
                            placeholder="לאן רוצים להגיע?"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 text-right font-medium placeholder:text-gray-400"
                            autoFocus
                        />
                        {isSearching && <Loader2 size={16} className="text-blue-500 animate-spin shrink-0" />}
                        {searchQuery && !isSearching && (
                            <button onClick={() => onSearchChange('')} className="p-1 hover:bg-gray-200 rounded-full">
                                <X size={14} className="text-gray-400" />
                            </button>
                        )}
                        <button
                            onClick={() => { onSearchChange(''); onStateChange('idle'); }}
                            className="text-blue-600 text-xs font-bold mr-1"
                        >
                            ביטול
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {searchQuery.length < 3 ? (
                        <div className="p-6" dir="rtl">
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                {QUICK_ACTIONS.map(({ id, label, icon: Icon, color, bg }) => (
                                    <button
                                        key={id}
                                        onClick={() => onSearchChange(label)}
                                        className="flex flex-col items-center gap-3 py-6 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors"
                                    >
                                        <div className={`w-14 h-14 rounded-full ${bg} flex items-center justify-center`}>
                                            <Icon size={24} className={color} />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">{label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 mb-4 px-1">
                                <Clock size={12} className="text-gray-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">חיפושים אחרונים</span>
                            </div>
                            <div className="space-y-1">
                                {['פארק ספורט שדרות', 'גינת כושר', 'מסלול ריצה'].map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onSearchChange(item)}
                                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                            <Clock size={14} className="text-gray-400" />
                                        </div>
                                        <span className="text-sm text-gray-700 font-medium">{item}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4" dir="rtl">
                            <div className="flex items-center gap-2 mb-3 px-1">
                                <Search size={12} className="text-gray-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    תוצאות חיפוש
                                </span>
                                <span className="text-[10px] text-gray-300">({displayItems.length})</span>
                            </div>

                            {displayItems.length === 0 && !isSearching ? (
                                <div className="text-center py-12 text-gray-400">
                                    <MapPin size={32} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm font-medium text-gray-500">לא נמצאו תוצאות</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {displayItems.map((item, idx) => {
                                        const SugIcon = SUGGESTION_ICON[item._source ?? 'mapbox'] ?? MapPin;
                                        const iconBg = item._source === 'park'
                                          ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
                                          : item._source === 'route'
                                            ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
                                            : 'bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600';
                                        return (
                                        <button
                                            key={`suggestion-${idx}-${item._source ?? 'g'}-${item.coords[0]}-${item.coords[1]}`}
                                            onClick={() => onAddressSelect(item)}
                                            className="w-full px-3 py-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${iconBg}`}>
                                                    <SugIcon size={16} />
                                                </div>
                                                <div className="flex flex-col items-start">
                                                  <span className="text-sm font-medium text-gray-800 text-right truncate max-w-[220px]">
                                                      {item.text}
                                                  </span>
                                                  {item._source && item._source !== 'mapbox' && (
                                                    <span className={`text-[10px] font-bold ${item._source === 'park' ? 'text-emerald-500' : 'text-blue-500'}`}>
                                                      {item._source === 'park' ? 'פארק' : 'מסלול'}
                                                    </span>
                                                  )}
                                                </div>
                                            </div>
                                            <ChevronRight size={14} className="text-gray-300 shrink-0" />
                                        </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── NAVIGATION DRAWER (Waze-style Bottom Sheet) ──
    if (navState === 'navigating') {
        const variantKeys: RouteVariant[] = ['recommended', 'scenic', 'facilityRich'];
        const selectedRoute = navigationVariants[selectedVariant];
        const selectedMeta = VARIANT_META[selectedVariant];
        const SelectedIcon = selectedMeta.icon;

        return (
            <div className="fixed inset-0 z-[100] pointer-events-none">
                {/* Transparent tap target — collapses drawer, map stays fully visible */}
                {isDrawerExpanded && (
                    <div
                        className="absolute inset-0 pointer-events-auto"
                        onClick={() => setIsDrawerExpanded(false)}
                    />
                )}

                <motion.div
                    drag="y"
                    dragControls={dragControls}
                    dragListener={false}
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.25}
                    onDragEnd={(_, info) => {
                        if (info.offset.y > 80 || info.velocity.y > 300) {
                            setIsDrawerExpanded(false);
                        } else if (info.offset.y < -80 || info.velocity.y < -300) {
                            setIsDrawerExpanded(true);
                        }
                    }}
                    initial={{ y: 400 }}
                    animate={{ y: 0 }}
                    exit={{ y: 400 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="absolute bottom-0 left-0 right-0 pointer-events-auto"
                >
                    <div className="bg-white rounded-t-3xl shadow-2xl overflow-hidden pb-[90px]">
                        {/* Drag handle — swipe up/down to expand/collapse */}
                        <div
                            className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => dragControls.start(e)}
                            style={{ touchAction: 'none' }}
                        >
                            <div className="w-10 h-1 bg-gray-300 rounded-full" />
                        </div>

                        {/* Header: title + close */}
                        <div className="flex justify-between items-center px-5 mb-2" dir="rtl">
                            <span className="text-sm font-bold text-gray-900">בחר מסלול</span>
                            <button
                                onClick={() => onStateChange('idle')}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <X size={16} className="text-gray-500" />
                            </button>
                        </div>

                        {/* Activity Toggle */}
                        <div className="flex justify-center gap-1.5 px-6 mb-3" dir="rtl">
                            {ACTIVITY_META.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => onActivityChange(id)}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                                        navActivity === id
                                            ? 'bg-gray-900 text-white shadow-sm'
                                            : 'bg-white text-gray-500 shadow-sm border border-gray-100'
                                    }`}
                                >
                                    <Icon size={12} />
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* ── Catch-Up Banner (active group session) ── */}
                        {groupAheadMeters != null && groupAheadMeters > 0 && (
                            <div
                                className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 bg-gradient-to-l from-cyan-50 to-emerald-50 border border-cyan-200 rounded-xl"
                                dir="rtl"
                            >
                                <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                                    <Users size={16} className="text-cyan-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-gray-900">
                                        הקבוצה {groupAheadMeters < 1000
                                            ? `${Math.round(groupAheadMeters)} מטר`
                                            : `${(groupAheadMeters / 1000).toFixed(1)} ק"מ`} לפניך
                                    </p>
                                    <p className="text-[10px] text-gray-500 font-bold">
                                        {groupMemberCount} חברי קבוצה פעילים
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500 rounded-lg flex-shrink-0">
                                    <Gauge size={12} className="text-white" />
                                    <span className="text-[10px] font-black text-white">דלק!</span>
                                </div>
                            </div>
                        )}

                        {/* ── EXPANDED: All 3 variant cards stacked vertically ── */}
                        {isDrawerExpanded ? (
                            <div className="px-4 space-y-2.5 pb-4">
                                {variantKeys.map((key) => {
                                    const route = navigationVariants[key];
                                    const isActive = selectedVariant === key;
                                    const meta = VARIANT_META[key];
                                    const VIcon = meta.icon;

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => onVariantSelect(key)}
                                            className={`w-full rounded-2xl p-4 transition-all text-right border ${
                                                isActive
                                                    ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100'
                                                    : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                                            }`}
                                            dir="rtl"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center`}>
                                                        <VIcon size={20} className={meta.color} />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{meta.label}</div>
                                                        <div className="text-sm font-bold text-gray-900 truncate max-w-[140px]">{route?.name || 'טוען...'}</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {isLoading ? '...' : `${route?.distance?.toFixed(1) || '0.0'} ק"מ`}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {isLoading ? '...' : `${route?.duration || 0} דק'`}
                                                        </div>
                                                    </div>
                                                    <div
                                                        role="button"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            onVariantSelect(key);
                                                            if (typeof window !== 'undefined') {
                                                                const { audioService } = await import('@/features/workout-engine/core/services/AudioService');
                                                                audioService.unlock();
                                                            }
                                                            onStart();
                                                        }}
                                                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                                                            isActive && route
                                                                ? 'bg-blue-600 text-white shadow-md'
                                                                : 'bg-gray-200 text-gray-400'
                                                        }`}
                                                    >
                                                        <Play size={16} fill="currentColor" />
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            /* ── COLLAPSED: Selected variant only with expand hint ── */
                            <div className="px-4 pb-4">
                                <div
                                    onClick={() => setIsDrawerExpanded(true)}
                                    className="w-full rounded-2xl p-4 bg-blue-50 border border-blue-200 cursor-pointer"
                                    dir="rtl"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl ${selectedMeta.bg} flex items-center justify-center`}>
                                                <SelectedIcon size={20} className={selectedMeta.color} />
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{selectedMeta.label}</div>
                                                <div className="text-sm font-bold text-gray-900">{selectedRoute?.name || 'טוען...'}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-gray-900">
                                                    {isLoading ? '...' : `${selectedRoute?.distance?.toFixed(1) || '0.0'} ק"מ`}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {isLoading ? '...' : `${selectedRoute?.duration || 0} דק'`}
                                                </div>
                                            </div>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (typeof window !== 'undefined') {
                                                        const { audioService } = await import('@/features/workout-engine/core/services/AudioService');
                                                        audioService.unlock();
                                                    }
                                                    onStart();
                                                }}
                                                disabled={isLoading || !selectedRoute}
                                                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                <Play size={14} fill="currentColor" />
                                                התחל
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expand hint */}
                                <div className="flex justify-center mt-2">
                                    <button
                                        onClick={() => setIsDrawerExpanded(true)}
                                        className="flex items-center gap-1 text-[11px] text-gray-400 font-medium"
                                    >
                                        <ChevronUp size={12} />
                                        עוד 2 מסלולים
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        );
    }

    return null;
}
