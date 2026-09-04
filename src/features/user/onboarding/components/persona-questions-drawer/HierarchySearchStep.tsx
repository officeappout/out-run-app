'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ChevronRight, MapPin, Search, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { HierarchySearchQuestionConfig } from '@/types/persona-question.types';
import { effectiveServiceType, effectiveUserStatus } from './service-type-rank';

interface DirectoryEntry {
  directoryId: string;
  name: string;
  level: 'brigade' | 'battalion' | 'company' | 'platoon';
  orgId: string;
  unitId: string | null;
  statusCategory: string | null;
  serviceType: string | null;
}

// serviceType/statusCategory ranking logic lives in service-type-rank.ts
// (kept out of this component file so it can be unit-tested without pulling
// in JSX) — see that file for the fixed no-op-match bug this replaces.

export interface HierarchySearchValue {
  orgId?: string;
  unitId?: string;
  unitPathIds?: string[];
}

interface HierarchySearchStepProps {
  config: HierarchySearchQuestionConfig;
  /** The prior answer named by `config.softFilterFromKey`, if any — used to
   *  sort/highlight matching entries first. Never excludes a mismatch. */
  softFilterValue?: string;
  value: HierarchySearchValue;
  onChange: (next: HierarchySearchValue) => void;
  /** Fires when the user explicitly wants to finish here — either they've
   *  made at least one selection and are done drilling, or the current
   *  level has nothing more to offer. Advances/finishes the outer drawer;
   *  never clears `value`. */
  onDone: () => void;
}

async function fetchLevel(parentId: string | null): Promise<DirectoryEntry[]> {
  const q = query(
    collection(db, 'unitDirectory'),
    where('parentId', '==', parentId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      directoryId: d.id,
      name: data.name as string,
      level: data.level as DirectoryEntry['level'],
      orgId: data.orgId as string,
      unitId: (data.unitId as string | null) ?? null,
      statusCategory: (data.statusCategory as string | null) ?? null,
      serviceType: (data.serviceType as string | null) ?? null,
    };
  });
}

/**
 * Searches/drills into `unitDirectory` (Phase 3a) — brigade, then battalion,
 * then company, stopping whenever the user wants (each level is a valid,
 * final answer on its own).
 *
 * `unitDirectory` is the ONLY unit-hierarchy source this reads — never
 * `tenants/{orgId}/units` directly (that requires an existing tenant
 * relationship this self-declaring user by definition doesn't have yet).
 *
 * Live text search at every level (David, production test 02.09.2026 —
 * this was in the approved spec: "loads reserve brigades; pick from a list
 * or search", mirroring the park-contribution drawer's facility search).
 * Client-side substring match against `name` — the dataset per level is a
 * few dozen entries at most (already fetched), no server-side search
 * infrastructure needed. A plain name.includes(query) already satisfies
 * both a number query ("11", "810" — embedded in the raw brigade name,
 * e.g. "חטיבה 11 (חי"ר - מילואים)") and a name/arm-type query ("גולני" —
 * also embedded in the same string) with one filter, no separate paths.
 *
 * Finishing: selecting an entry no longer silently strands the user.
 * Once `value.orgId` is set (something has been chosen, at any depth), a
 * prominent finish button is always shown — same production bug this
 * fixes: nothing previously told the parent drawer "done, advance/save."
 * An empty level (no sub-units — most brigades today) shows that plainly
 * and points at the same finish button, instead of a dead-end "no results."
 */
export default function HierarchySearchStep({ config, softFilterValue, value, onChange, onDone }: HierarchySearchStepProps) {
  // breadcrumb[0] = top level (brigades); each entry is the directoryId
  // drilled into to reach the NEXT level's entries.
  const [breadcrumb, setBreadcrumb] = useState<DirectoryEntry[]>([]);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].directoryId : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSearchQuery(''); // fresh level, fresh search box
    fetchLevel(currentParentId).then((result) => {
      if (cancelled) return;
      // Soft filter: matching-serviceType entries first — never excludes a
      // non-matching one (see persona-question.types.ts's softFilterFromKey
      // doc). serviceType is per-unit and English; statusCategory is the
      // older brigade-only Hebrew fallback (effectiveServiceType above).
      const sorted = softFilterValue
        ? [...result].sort((a, b) => {
            const wanted = effectiveUserStatus(softFilterValue);
            const aMatch = effectiveServiceType(a) === wanted ? 0 : 1;
            const bMatch = effectiveServiceType(b) === wanted ? 0 : 1;
            return aMatch - bMatch;
          })
        : result;
      setEntries(sorted);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [currentParentId, softFilterValue]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return entries;
    return entries.filter((e) => e.name.includes(q));
  }, [entries, searchQuery]);

  const selectEntry = useCallback(async (entry: DirectoryEntry) => {
    const nextBreadcrumb = [...breadcrumb, entry];
    // Record this selection immediately — stopping here (finish/close) after
    // this tap is a valid, complete answer at this depth.
    onChange({
      orgId: entry.orgId,
      unitId: entry.unitId ?? undefined,
      unitPathIds: nextBreadcrumb
        .map((b) => b.unitId)
        .filter((id): id is string => !!id),
    });

    // Look for children; if none exist, this is a terminal selection —
    // stay at the current list (the finish button below is the way out).
    const children = await fetchLevel(entry.directoryId);
    if (children.length > 0) {
      setBreadcrumb(nextBreadcrumb);
    }
  }, [breadcrumb, onChange]);

  const goBackOneLevel = useCallback(() => {
    setBreadcrumb((b) => b.slice(0, -1));
  }, []);

  const hasSelection = !!value.orgId;

  return (
    <div className="px-5 py-4 flex flex-col h-full" dir="rtl">
      <h3 className="text-base font-bold text-slate-900 mb-1">{config.label}</h3>
      {config.helperText && <p className="text-xs text-slate-400 mb-3">{config.helperText}</p>}
      {breadcrumb.length > 0 && (
        <button
          type="button"
          onClick={goBackOneLevel}
          className="flex items-center gap-1 text-sm text-slate-500 mb-3 self-start"
        >
          <ChevronRight size={16} />
          <span>{breadcrumb.map((b) => b.name).join(' / ')}</span>
        </button>
      )}

      {!loading && entries.length > 0 && (
        <div className="relative mb-3">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי שם או מספר..."
            className="w-full pr-9 pl-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm text-slate-900 focus:border-[#00E5FF] focus:outline-none"
            dir="rtl"
          />
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">טוען...</div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
          <p className="text-slate-400 text-sm">
            {breadcrumb.length > 0
              ? `אין תת-יחידות נוספות תחת ${breadcrumb[breadcrumb.length - 1].name}`
              : 'אין תוצאות'}
          </p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">אין תוצאות עבור "{searchQuery}"</div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {filteredEntries.map((entry) => {
            const selected = value.orgId === entry.orgId && (value.unitId ?? undefined) === (entry.unitId ?? undefined);
            return (
              <button
                key={entry.directoryId}
                type="button"
                onClick={() => selectEntry(entry)}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-right transition-all ${
                  selected ? 'border-[#00E5FF] bg-cyan-50' : 'border-slate-200 active:scale-[0.98]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="font-semibold text-slate-900">{entry.name}</span>
                </div>
                {selected ? (
                  <Check size={16} className="text-[#00E5FF]" />
                ) : (
                  <ChevronRight size={16} className="text-slate-300 rotate-180" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* The fix for the production dead-end: once anything is selected,
          there is always a clear, prominent way to finish — regardless of
          whether this level has (or ever had) children. */}
      {hasSelection && (
        <div className="pt-3 flex-shrink-0">
          <button
            type="button"
            onClick={onDone}
            className="w-full py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm"
          >
            סיום
          </button>
        </div>
      )}
    </div>
  );
}
