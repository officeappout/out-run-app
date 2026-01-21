"use client";

import React, { useState, useEffect } from 'react';
import { Footprints, Activity, Bike, X, Navigation, Timer, Coins, Flame } from 'lucide-react';
import { MapboxService } from '../services/mapbox.service';
import { ActivityType } from '../types/map-objects.type';

interface RoutePlannerCardProps {
    address: { text: string; coords: [number, number] };
    userPos: { lat: number; lng: number };
    userWeight: number;
    onClose: () => void;
    onSelect: (activity: ActivityType, pathData: { path: [number, number][]; distance: number; duration: number }) => void;
}

export default function RoutePlannerCard({ address, userPos, userWeight, onClose, onSelect }: RoutePlannerCardProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [options, setOptions] = useState<Record<ActivityType, any>>({
        walking: null,
        cycling: null,
        running: null,
        workout: null
    });

    useEffect(() => {
        const fetchAllRoutes = async () => {
            setLoading(true);
            setError(null);

            const activities: ActivityType[] = ['walking', 'running', 'cycling'];
            const results: any = {};

            try {
                const promises = activities.map(async (act) => {
                    const profile = act === 'cycling' ? 'cycling' : 'walking'; // Mapbox profiles
                    const res = await MapboxService.getSmartPath(userPos, { lng: address.coords[0], lat: address.coords[1] }, profile);
                    if (res) {
                        // Calculate Calories: Weight * Distance * ActivityFactor
                        // Simple coefficients: Walk=0.7, Run=1.0, Cycle=0.4
                        const factor = act === 'walking' ? 0.7 : act === 'running' ? 1.0 : 0.4;
                        const distanceKm = res.distance / 1000;
                        const calories = Math.round(userWeight * distanceKm * factor);
                        const coins = Math.round(calories / 10);

                        results[act] = { ...res, calories, coins };
                    }
                });

                await Promise.all(promises);

                if (Object.keys(results).length === 0) {
                    setError("לא נמצא מסלול ליעד המבוקש");
                } else {
                    setOptions(results);
                }
            } catch (err) {
                setError("שגיאה בחישוב המסלול");
            } finally {
                setLoading(false);
            }
        };

        fetchAllRoutes();
    }, [address, userPos, userWeight]);

    const activityConfigs = [
        { id: 'walking', label: 'הליכה', icon: Footprints, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 'running', label: 'ריצה', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-50' },
        { id: 'cycling', label: 'רכיבה', icon: Bike, color: 'text-green-500', bg: 'bg-green-50' },
    ] as const;

    return (
        <div className="absolute bottom-[90px] left-4 right-4 z-[60] animate-in slide-in-from-bottom-5 duration-300">
            <div className="max-w-md mx-auto bg-white/90 backdrop-blur-xl rounded-[32px] p-5 shadow-2xl border border-white/50 relative">

                {/* Header */}
                <div className="flex justify-between items-start mb-4" dir="rtl">
                    <div className="flex-1">
                        <h3 className="text-lg font-black text-gray-900 leading-tight truncate pl-8">
                            {address.text.split(',')[0]}
                        </h3>
                        <p className="text-[11px] text-gray-500 font-medium truncate opacity-70">
                            {address.text}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="space-y-3 py-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-gray-50 animate-pulse rounded-2xl border border-gray-100"></div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-8 text-center" dir="rtl">
                        <div className="text-red-500 mb-2 font-bold">⚠️ {error}</div>
                        <p className="text-sm text-gray-500">נסה יעד אחר או בדוק חיבור לרשת</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2.5">
                        {activityConfigs.map((act) => {
                            const data = options[act.id];
                            if (!data) return null;

                            return (
                                <button
                                    key={act.id}
                                    onClick={() => onSelect(act.id as ActivityType, data)}
                                    className="w-full bg-gray-50/50 hover:bg-white border hover:border-cyan-200 transition-all rounded-2xl p-3 flex items-center gap-4 group active:scale-98"
                                    dir="rtl"
                                >
                                    <div className={`${act.bg} ${act.color} p-3 rounded-2xl group-hover:scale-110 transition-transform`}>
                                        <act.icon size={24} />
                                    </div>

                                    <div className="flex-1 text-right">
                                        <div className="text-sm font-black text-gray-900">{act.label}</div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-gray-500">
                                                <Navigation size={12} className="text-gray-400" />
                                                {(data.distance / 1000).toFixed(1)} ק״מ
                                            </div>
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-gray-500">
                                                <Timer size={12} className="text-gray-400" />
                                                {Math.round(data.duration / 60)} דק׳
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col items-center min-w-[40px]">
                                            <Flame size={14} className="text-orange-500 mb-0.5" />
                                            <span className="text-[10px] font-black text-gray-900">{data.calories}</span>
                                        </div>
                                        <div className="bg-yellow-100 text-yellow-700 h-10 w-10 rounded-xl flex flex-col items-center justify-center">
                                            <Coins size={12} fill="currentColor" />
                                            <span className="text-xs font-black">+{data.coins}</span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
