'use client';

import React, { useState } from 'react';
import { Layers, X, ChevronLeft } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { useMapStore, LayerType } from '../store/useMapStore';
import { PartnerFilterSheet, usePartnerFilters } from '@/features/partners';

const LAYER_OPTIONS: { id: LayerType; label: string; icon: string }[] = [
    { id: 'water', label: 'ברזיות מים', icon: '💧' },
    { id: 'gym', label: 'מתקני כושר', icon: '💪' },
    { id: 'toilet', label: 'שירותים ציבוריים', icon: '🚽' },
];

// Hebrew labels for the partner-activity filter — used by the
// "משתמשים פעילים" summary line.
const ACTIVITY_LABELS: Record<string, string> = {
    all: 'הכל',
    strength: 'כוח',
    running: 'ריצה',
    walking: 'הליכה',
};

export function MapLayersButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-white/80 backdrop-blur-md shadow-lg border border-white/40 pointer-events-auto active:scale-95 transition-all"
        >
            <Layers size={18} className="text-gray-700" />
        </button>
    );
}

interface MapLayersControlProps {
    /**
     * Real-time count of currently-online partners. Drives the badge on
     * the "משתמשים פעילים" row. Lifted from `usePartnerData(...).live` in
     * `DiscoverLayer` so we share a single Firestore subscription with
     * the partner finder UI.
     */
    liveCount?: number;
}

export const MapLayersControl: React.FC<MapLayersControlProps> = ({ liveCount = 0 }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const { visibleLayers, toggleLayer } = useMapStore();
    const liveUsersVisible = useMapStore((s) => s.liveUsersVisible);
    const setLiveUsersVisible = useMapStore((s) => s.setLiveUsersVisible);
    const liveActivity = usePartnerFilters((s) => s.liveActivity);
    const distanceKm = usePartnerFilters((s) => s.distanceKm);
    const dragControls = useDragControls();

    // Compose the summary line shown beneath the row title:
    //   - liveUsersVisible=false  → 'אין סינון פעיל' (dimmed)
    //   - liveActivity='all'      → 'הכל'
    //   - else                    → '<activity> · עד <distance> ק״מ'
    const filterSummary = (() => {
        if (!liveUsersVisible) return 'אין סינון פעיל';
        if (liveActivity === 'all') return 'הכל';
        const label = ACTIVITY_LABELS[liveActivity] ?? 'הכל';
        const distanceLabel =
            distanceKm < 1
                ? `${Math.round(distanceKm * 1000)} מ׳`
                : `${distanceKm} ק״מ`;
        return `${label} · עד ${distanceLabel}`;
    })();

    // Badge shows 0 when visibility is off — even if there ARE live users
    // online, they're not on the map yet, so the badge mirrors the map
    // truth rather than the underlying subscription.
    const badgeCount = liveUsersVisible ? liveCount : 0;

    return (
        <>
            <MapLayersButton onClick={() => setIsOpen(true)} />

            {isOpen && (
                // z-[48] sits ABOVE the PartnerOverlay (z-[45]) so the sheet
                // is always visible when both happen to be open, and BELOW
                // the BottomNavbar (z-50) so the nav stays on top and
                // remains tappable. This matches the same overlap budget
                // the partner overlay was tuned for.
                <div className="fixed inset-0 z-[48] pointer-events-none">
                    {/* Tap-to-close backdrop */}
                    <div
                        className="absolute inset-0 pointer-events-auto"
                        onClick={() => setIsOpen(false)}
                    />

                    <motion.div
                        drag="y"
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={0.25}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 80 || info.velocity.y > 300) {
                                setIsOpen(false);
                            }
                        }}
                        initial={{ y: 400 }}
                        animate={{ y: 0 }}
                        exit={{ y: 400 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="absolute bottom-0 left-0 right-0 pointer-events-auto"
                    >
                        <div className="bg-white rounded-t-3xl shadow-2xl overflow-hidden pb-[90px]">
                            {/* Drag handle */}
                            <div
                                className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                                onPointerDown={(e) => dragControls.start(e)}
                                style={{ touchAction: 'none' }}
                            >
                                <div className="w-10 h-1 bg-gray-300 rounded-full" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pb-4" dir="rtl">
                                <h3 className="text-base font-black text-gray-900">שכבות במפה</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    aria-label="סגור"
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                                >
                                    <X size={18} className="text-gray-500" />
                                </button>
                            </div>

                            {/* Toggle list — RTL via dir: label+icon on right, switch on left */}
                            <div className="px-5" dir="rtl">
                                {LAYER_OPTIONS.map((layer) => {
                                    const isActive = visibleLayers.includes(layer.id);
                                    return (
                                        <button
                                            key={layer.id}
                                            onClick={() => toggleLayer(layer.id)}
                                            className="w-full flex items-center justify-between py-4 transition-all active:opacity-70 border-b border-gray-100"
                                        >
                                            {/* Label group — appears on right in RTL */}
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl leading-none">{layer.icon}</span>
                                                <span className={`text-[15px] font-semibold ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {layer.label}
                                                </span>
                                            </div>

                                            {/* iOS switch — appears on left in RTL */}
                                            <div
                                                className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors duration-300 ${isActive ? 'bg-[#00E5FF]' : 'bg-gray-300'}`}
                                            >
                                                <div
                                                    className={`absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md transition-all duration-300 ${isActive ? 'left-[22px]' : 'left-[2px]'}`}
                                                />
                                            </div>
                                        </button>
                                    );
                                })}

                                {/* Live users — full-row button that opens the partner filter
                                    sheet. We close the layers panel in the same tap so the
                                    sheet (z-[48]/[49]) isn't fighting this panel (also z-[48])
                                    for the same stacking slot — that conflict is what made
                                    the row appear non-tappable previously. */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsOpen(false);
                                        setFilterSheetOpen(true);
                                    }}
                                    aria-label="פתח פילטרים של משתמשים פעילים"
                                    className="w-full flex items-center justify-between py-4 transition-all active:opacity-70 cursor-pointer"
                                >
                                    {/* Label + summary on the right (RTL) */}
                                    <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                                        <span className="text-xl leading-none">👥</span>
                                        <div className="flex flex-col items-start min-w-0">
                                            <span
                                                className={`text-[15px] font-semibold ${liveUsersVisible ? 'text-gray-900' : 'text-gray-400'}`}
                                            >
                                                משתמשים פעילים
                                            </span>
                                            <span
                                                className={`text-[11px] font-medium mt-0.5 truncate ${liveUsersVisible ? 'text-gray-500' : 'text-gray-300'}`}
                                            >
                                                {filterSummary}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Count badge + chevron on the left (RTL).
                                        `pointer-events-none` so any tap inside this group
                                        falls through to the parent <button> — there is
                                        intentionally no separate chevron button. */}
                                    <div className="flex items-center gap-2 shrink-0 pointer-events-none">
                                        <span
                                            className={`min-w-[24px] h-6 px-1.5 rounded-full inline-flex items-center justify-center text-[11px] font-black ${
                                                liveUsersVisible
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-gray-100 text-gray-400'
                                            }`}
                                        >
                                            {badgeCount}
                                        </span>
                                        <ChevronLeft size={18} className="text-gray-400" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Partner filter sheet — shared with PartnerOverlay. We pass
                `onApply` so tapping "החל" enables `liveUsersVisible` in
                addition to closing the sheet. Closing without applying
                leaves the toggle untouched. */}
            <PartnerFilterSheet
                isOpen={filterSheetOpen}
                onClose={() => setFilterSheetOpen(false)}
                onApply={() => setLiveUsersVisible(true)}
            />
        </>
    );
};
