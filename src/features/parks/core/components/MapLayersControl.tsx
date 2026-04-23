'use client';

import React, { useState } from 'react';
import { Layers, X } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { useMapStore, LayerType } from '../store/useMapStore';

const LAYER_OPTIONS: { id: LayerType; label: string; icon: string }[] = [
    { id: 'water', label: 'ברזיות מים', icon: '💧' },
    { id: 'gym', label: 'מתקני כושר', icon: '💪' },
    { id: 'toilet', label: 'שירותים ציבוריים', icon: '🚽' },
];

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

export const MapLayersControl: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { visibleLayers, toggleLayer } = useMapStore();
    const dragControls = useDragControls();

    return (
        <>
            <MapLayersButton onClick={() => setIsOpen(true)} />

            {isOpen && (
                <div className="fixed inset-0 z-[100] pointer-events-none">
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
                                    onClick={() => setIsOpen(false)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                                >
                                    <X size={18} className="text-gray-500" />
                                </button>
                            </div>

                            {/* Toggle list — RTL via dir: label+icon on right, switch on left */}
                            <div className="px-5" dir="rtl">
                                {LAYER_OPTIONS.map((layer, idx) => {
                                    const isActive = visibleLayers.includes(layer.id);
                                    const isLast = idx === LAYER_OPTIONS.length - 1;
                                    return (
                                        <button
                                            key={layer.id}
                                            onClick={() => toggleLayer(layer.id)}
                                            className={`w-full flex items-center justify-between py-4 transition-all active:opacity-70 ${isLast ? '' : 'border-b border-gray-100'}`}
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
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </>
    );
};
