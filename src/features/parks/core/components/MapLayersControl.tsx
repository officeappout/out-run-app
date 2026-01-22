import React, { useState } from 'react';
import { Layers, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMapStore } from '../store/useMapStore';

const LAYER_OPTIONS = [
    { id: 'routes', label: 'מסלולי ריצה/רכיבה', icon: '🛣️' },
    { id: 'water', label: 'ברזיות מים', icon: '🚰' },
    { id: 'toilet', label: 'שירותים ציבוריים', icon: '🚽' },
    { id: 'gym', label: 'מתקני כושר', icon: '💪' },
    { id: 'parking', label: 'חניה', icon: '🅿️' },
];

export const MapLayersControl: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { visibleLayers, toggleLayer } = useMapStore();

    return (
        <div className="absolute top-28 right-4 z-50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${isOpen ? 'bg-cyan-500 text-white' : 'bg-white text-gray-600'
                    }`}
            >
                <Layers size={24} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop for closing */}
                        <div
                            className="fixed inset-0 z-[-1]"
                            onClick={() => setIsOpen(false)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, x: 10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9, x: 10 }}
                            className="absolute top-0 right-14 w-64 bg-white/90 backdrop-blur-xl rounded-[24px] shadow-2xl border border-white/50 p-4 space-y-2 overflow-hidden"
                        >
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-2 mb-3">שכבות במפה</h3>

                            {LAYER_OPTIONS.map((layer) => (
                                <button
                                    key={layer.id}
                                    onClick={() => toggleLayer(layer.id)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-100/50 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">{layer.icon}</span>
                                        <span className={`text-sm font-bold ${visibleLayers.includes(layer.id) ? 'text-gray-900' : 'text-gray-400'}`}>
                                            {layer.label}
                                        </span>
                                    </div>
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${visibleLayers.includes(layer.id)
                                        ? 'bg-cyan-500 border-cyan-500 text-white'
                                        : 'border-gray-200 bg-transparent'
                                        }`}>
                                        {visibleLayers.includes(layer.id) && <Check size={12} strokeWidth={4} />}
                                    </div>
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
