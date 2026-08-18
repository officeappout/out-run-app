'use client';

/**
 * Bulk-tag modal for the admin routes inventory — Stage 2.3 of the
 * route-enrichment-pipeline plan. Reuses FeatureTagPicker (Stage 2.2, the
 * same component RouteEditor uses) so the tag vocabulary/UI never drifts
 * between the single-route and bulk flows.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { FeatureTagPicker } from './FeatureTagPicker';
import type { RouteFeatureTag } from '@/features/parks';

interface BulkTagModalProps {
    routeCount: number;
    onApply: (tags: RouteFeatureTag[], mode: 'add' | 'replace') => Promise<void>;
    onClose: () => void;
}

export function BulkTagModal({ routeCount, onApply, onClose }: BulkTagModalProps) {
    const [tags, setTags] = useState<RouteFeatureTag[]>([]);
    const [mode, setMode] = useState<'add' | 'replace'>('add');
    const [isApplying, setIsApplying] = useState(false);

    const toggleTag = (tag: RouteFeatureTag) => {
        setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    };

    const handleApply = async () => {
        if (tags.length === 0) return;
        if (
            mode === 'replace' &&
            !confirm(
                `מצב "החלפה" ימחק את כל התגיות הקיימות ב-${routeCount} מסלולים ויחליף אותן ב-${tags.length} התגיות שנבחרו. פעולה זו אינה הפיכה. להמשיך?`,
            )
        ) {
            return;
        }
        setIsApplying(true);
        try {
            await onApply(tags, mode);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="font-black text-gray-800 text-sm">
                        תייג {routeCount} מסלולים נבחרים
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex gap-2 text-[11px] font-bold">
                    <button
                        type="button"
                        onClick={() => setMode('add')}
                        className={`px-3 py-1.5 rounded-lg border transition-all ${
                            mode === 'add'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                    >
                        הוסף לתגיות קיימות
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('replace')}
                        className={`px-3 py-1.5 rounded-lg border transition-all ${
                            mode === 'replace'
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                    >
                        החלף תגיות
                    </button>
                </div>

                <FeatureTagPicker selected={tags} onToggle={toggleTag} label="תגיות לתייג" />

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-[11px] font-bold text-gray-500 px-3 py-1.5"
                    >
                        ביטול
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={tags.length === 0 || isApplying}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold px-4 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    >
                        {isApplying ? 'מחיל...' : `החל על ${routeCount} מסלולים`}
                    </button>
                </div>
            </div>
        </div>
    );
}
