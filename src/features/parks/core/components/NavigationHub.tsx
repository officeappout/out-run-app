"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    MapPin,
    Home,
    Briefcase,
    History,
    Footprints,
    Activity,
    Bike,
    Shuffle,
    Play,
    X,
    ChevronRight,
    Clock,
    Coins,
    Loader2
} from 'lucide-react';
import { Route, ActivityType } from '../types/route.types';

export type NavHubState = 'idle' | 'searching' | 'navigating';

interface NavigationHubProps {
    navState: NavHubState;
    onStateChange: (state: NavHubState) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void; // ✅ NEW: Controlled input
    suggestions: Array<{ text: string; coords: [number, number] }>;
    onAddressSelect: (address: { text: string; coords: [number, number] }) => void;
    navigationRoutes: Record<ActivityType, Route | null>;
    onActivitySelect: (activity: ActivityType) => void;
    selectedActivity: ActivityType;
    isLoading: boolean;
    isSearching?: boolean; // ✅ NEW: Search loading state
    onShuffle: (activity: ActivityType) => void;
    onStart: () => void;
    inputRef?: React.RefObject<HTMLInputElement>;
}

export default function NavigationHub({
    navState,
    onStateChange,
    searchQuery,
    onSearchChange,
    suggestions,
    onAddressSelect,
    navigationRoutes,
    onActivitySelect,
    selectedActivity,
    isLoading,
    isSearching = false,
    onShuffle,
    onStart,
    inputRef
}: NavigationHubProps) {
    const carouselRef = useRef<HTMLDivElement>(null);
    const localInputRef = useRef<HTMLInputElement>(null);
    const actualInputRef = inputRef || localInputRef;

    const [recentHistory] = useState<Array<{ text: string; coords: [number, number] }>>([
        { text: 'פארק הירקון, תל אביב', coords: [34.8016, 32.1006] },
        { text: 'דיזנגוף סנטר', coords: [34.7742, 32.0754] },
        { text: 'חוף גורדון', coords: [34.7674, 32.0833] }
    ]);

    // Sync scroll with selection
    useEffect(() => {
        if (navState === 'navigating' && carouselRef.current) {
            const types: ActivityType[] = ['walking', 'running', 'cycling'];
            const index = types.indexOf(selectedActivity);
            if (index !== -1) {
                const container = carouselRef.current;
                const cardWidth = container.offsetWidth * 0.85 + 16;
                const targetScroll = index * cardWidth;

                if (Math.abs(container.scrollLeft - targetScroll) > 10) {
                    container.scrollTo({ left: targetScroll, behavior: 'smooth' });
                }
            }
        }
    }, [selectedActivity, navState]);

    const handleScroll = () => {
        if (!carouselRef.current || navState !== 'navigating') return;
        const container = carouselRef.current;
        const scrollLeft = container.scrollLeft;
        const cardWidth = container.offsetWidth * 0.85 + 16;
        const index = Math.round(scrollLeft / cardWidth);

        const types: ActivityType[] = ['walking', 'running', 'cycling'];
        const newActivity = types[index];

        if (newActivity && newActivity !== selectedActivity) {
            onActivitySelect(newActivity);
        }
    };

    // Focus input when entering search mode
    useEffect(() => {
        if (navState === 'searching' && actualInputRef.current) {
            setTimeout(() => actualInputRef.current?.focus(), 100);
        }
    }, [navState, actualInputRef]);

    // Items to display in the list
    const displayItems = searchQuery.length >= 3 ? suggestions : recentHistory;

    return (
        <div className="fixed inset-0 z-[60] pointer-events-none flex flex-col items-center">
            {/* =============================================
                SEARCH MODE OVERLAY
            ============================================= */}
            <AnimatePresence mode="wait">
                {navState === 'searching' && (
                    <React.Fragment key="search-view">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
                            onClick={() => {
                                onSearchChange('');
                                onStateChange('idle');
                            }}
                        />

                        {/* Search Panel */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full max-w-md mt-4 mx-4 pointer-events-auto z-[70]"
                            dir="rtl"
                        >
                            {/* Search Input */}
                            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                                    <Search size={20} className="text-gray-400 shrink-0" />
                                    <input
                                        ref={actualInputRef}
                                        type="text"
                                        placeholder="לאן לנווט?"
                                        value={searchQuery}
                                        onChange={(e) => onSearchChange(e.target.value)}
                                        className="flex-1 text-base text-gray-900 placeholder-gray-400 outline-none bg-transparent font-medium"
                                        autoFocus
                                    />
                                    {isSearching && (
                                        <Loader2 size={18} className="text-blue-500 animate-spin shrink-0" />
                                    )}
                                    {searchQuery && !isSearching && (
                                        <button
                                            onClick={() => onSearchChange('')}
                                            className="p-1 hover:bg-gray-100 rounded-full"
                                        >
                                            <X size={16} className="text-gray-400" />
                                        </button>
                                    )}
                                </div>

                                {/* Quick Access */}
                                <div className="p-4 space-y-1 border-b border-gray-100">
                                    <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-all group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                                <Home size={18} />
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-gray-900 text-sm">הביתה</div>
                                                <div className="text-[10px] text-gray-400 font-medium">הגדר כתובת בית</div>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-300" />
                                    </button>

                                    <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-all group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                                                <Briefcase size={18} />
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-gray-900 text-sm">עבודה</div>
                                                <div className="text-[10px] text-gray-400 font-medium">הגדר כתובת עבודה</div>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-300" />
                                    </button>
                                </div>

                                {/* Results / History */}
                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-3 px-1">
                                        <History size={12} className="text-gray-400" />
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            {searchQuery.length >= 3 ? 'תוצאות חיפוש' : 'חיפושים אחרונים'}
                                        </span>
                                        {searchQuery.length >= 3 && (
                                            <span className="text-[10px] text-gray-300">({suggestions.length})</span>
                                        )}
                                    </div>

                                    {/* ✅ FIX #3: Proper z-index, bg-white, and visible text */}
                                    <div className="relative z-50 max-h-[50vh] overflow-y-auto bg-white rounded-xl shadow-lg">
                                        {displayItems.length === 0 && searchQuery.length >= 3 && !isSearching ? (
                                            <div className="text-center py-8 text-gray-600">
                                                <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                                                <p className="text-sm font-medium text-gray-700">לא נמצאו תוצאות</p>
                                            </div>
                                        ) : (
                                            displayItems.map((item, idx) => (
                                                <button
                                                    key={`suggestion-${idx}-${item.coords[0]}-${item.coords[1]}`}
                                                    onClick={() => {
                                                        console.log('[NavigationHub] Selected:', item);
                                                        onAddressSelect(item);
                                                    }}
                                                    className="w-full px-3 py-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors group bg-white"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors shrink-0">
                                                            <MapPin size={16} />
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-900 text-right truncate max-w-[200px]">
                                                            {item.text}
                                                        </span>
                                                    </div>
                                                    <ChevronRight size={16} className="text-gray-500 shrink-0" />
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </React.Fragment>
                )}
            </AnimatePresence>

            {/* =============================================
                NAVIGATION MODE (CAROUSEL)
            ============================================= */}
            <AnimatePresence mode="wait">
                {navState === 'navigating' && (
                    <motion.div
                        key="nav-view"
                        initial={{ y: 300 }}
                        animate={{ y: 0 }}
                        exit={{ y: 300 }}
                        className="absolute bottom-0 left-0 right-0 h-[320px] pointer-events-auto"
                    >
                        {/* Close button */}
                        <button
                            onClick={() => onStateChange('idle')}
                            className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center"
                        >
                            <X size={20} className="text-gray-600" />
                        </button>

                        <div
                            ref={carouselRef}
                            onScroll={handleScroll}
                            className="w-full flex overflow-x-auto snap-x snap-mandatory gap-4 px-6 pb-8 scrollbar-hide no-scrollbar"
                        >
                            {(['walking', 'running', 'cycling'] as ActivityType[]).map((type, typeIndex) => {
                                const route = navigationRoutes[type];
                                const isActive = selectedActivity === type;

                                return (
                                    <div
                                        key={`nav-card-${type}-${typeIndex}`}
                                        onClick={() => onActivitySelect(type)}
                                        className={`
                                            min-w-[85vw] md:min-w-[320px] snap-center p-6 rounded-[32px] transition-all duration-300 flex flex-col justify-between relative overflow-hidden cursor-pointer
                                            bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] border-2
                                            ${isActive ? 'border-blue-400 scale-100 opacity-100' : 'border-transparent scale-95 opacity-80'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-3 rounded-2xl ${type === 'running' ? 'bg-orange-100 text-orange-600' : type === 'cycling' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                                    {type === 'running' ? <Activity size={24} /> : type === 'cycling' ? <Bike size={24} /> : <Footprints size={24} />}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                                        {type === 'running' ? 'ריצה' : type === 'cycling' ? 'רכיבה' : 'הליכה'}
                                                    </div>
                                                    <div className="text-base font-black text-gray-900 leading-none mt-0.5">ניווט מהיר</div>
                                                </div>
                                            </div>

                                            {isActive && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onShuffle(type); }}
                                                    className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors active:scale-90 border border-gray-100"
                                                >
                                                    <Shuffle size={18} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="mt-4 grid grid-cols-3 gap-2">
                                            <div className="bg-gray-50/50 rounded-2xl p-3 text-center border border-gray-100">
                                                <div className="flex justify-center text-gray-400 mb-1"><Clock size={14} /></div>
                                                <div className="font-black text-gray-900 text-lg leading-tight">
                                                    {isLoading ? '...' : route?.duration || 0}
                                                    <span className="text-[10px] font-normal mr-0.5">{"דק׳"}</span>
                                                </div>
                                            </div>

                                            <div className="bg-gray-50/50 rounded-2xl p-3 text-center border border-gray-100">
                                                <div className="flex justify-center text-gray-400 mb-1"><MapPin size={14} /></div>
                                                <div className="font-black text-gray-900 text-lg leading-tight">
                                                    {isLoading ? '...' : route?.distance?.toFixed(1) || '0.0'}
                                                    <span className="text-[10px] font-normal mr-0.5">{"ק״מ"}</span>
                                                </div>
                                            </div>

                                            <div className="bg-yellow-50/50 rounded-2xl p-3 text-center border border-yellow-100">
                                                <div className="flex justify-center text-yellow-600 mb-1"><Coins size={14} /></div>
                                                <div className="font-black text-gray-900 text-lg leading-tight">
                                                    {isLoading ? '...' : Math.round(route?.score || 0)}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); onStart(); }}
                                            disabled={isLoading || !route}
                                            className={`
                                                mt-6 w-full h-14 rounded-2xl font-black text-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-all
                                                ${isActive && route ? 'bg-black text-white shadow-lg shadow-black/20 hover:bg-gray-900' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
                                            `}
                                        >
                                            <Play size={20} fill="currentColor" />
                                            התחל אימון
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
