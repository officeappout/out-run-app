'use client';

/**
 * Shared pill-toggle picker for RouteFeatureTag — extracted from
 * RouteEditor.tsx (Stage 2.2 of the route-enrichment-pipeline plan) so the
 * same UI + logic is reused by both the single-route create/edit flow
 * (RouteEditor) and the admin inventory's bulk-tag modal, instead of two
 * copies drifting apart. Byte-identical markup/behavior to the original
 * inline block — this is an extraction, not a redesign.
 */

import { ALL_ROUTE_FEATURE_TAGS, ROUTE_FEATURE_TAG_LABELS, type RouteFeatureTag } from '@/features/parks';

interface FeatureTagPickerProps {
    selected: RouteFeatureTag[];
    onToggle: (tag: RouteFeatureTag) => void;
    /** Same multi-select pattern as ParkFeatureTag in admin/locations. */
    label?: string;
}

export function FeatureTagPicker({ selected, onToggle, label = 'תכונות נוספות' }: FeatureTagPickerProps) {
    return (
        <div className="space-y-3">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                {label}
                {selected.length > 0 && (
                    <span className="text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full">
                        {selected.length}
                    </span>
                )}
            </label>
            <div className="flex flex-wrap gap-1.5">
                {ALL_ROUTE_FEATURE_TAGS.map((tag) => {
                    const isSelected = selected.includes(tag);
                    return (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => onToggle(tag)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                                isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-emerald-300'
                            }`}
                        >
                            {ROUTE_FEATURE_TAG_LABELS[tag]}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
