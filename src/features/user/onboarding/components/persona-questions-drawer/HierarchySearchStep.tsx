'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ChevronRight, MapPin } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { HierarchySearchQuestionConfig } from '@/types/persona-question.types';

interface DirectoryEntry {
  directoryId: string;
  name: string;
  level: 'brigade' | 'battalion' | 'company' | 'platoon';
  orgId: string;
  unitId: string | null;
  statusCategory: string | null;
}

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
    };
  });
}

/**
 * Searches/drills into `unitDirectory` (Phase 3a) — brigade, then battalion,
 * then company, stopping whenever the user wants (each level is a valid,
 * final answer on its own; "skip" at the drawer level and stopping mid-drill
 * here are the same underlying state: whatever was selected so far).
 *
 * `unitDirectory` is the ONLY unit-hierarchy source this reads — never
 * `tenants/{orgId}/units` directly (that requires an existing tenant
 * relationship this self-declaring user by definition doesn't have yet).
 */
export default function HierarchySearchStep({ config, softFilterValue, value, onChange }: HierarchySearchStepProps) {
  // breadcrumb[0] = top level (brigades); each entry is the directoryId
  // drilled into to reach the NEXT level's entries.
  const [breadcrumb, setBreadcrumb] = useState<DirectoryEntry[]>([]);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].directoryId : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLevel(currentParentId).then((result) => {
      if (cancelled) return;
      // Soft filter: matching statusCategory entries first — never excludes
      // a non-matching one (see persona-question.types.ts's softFilterFromKey doc).
      const sorted = softFilterValue
        ? [...result].sort((a, b) => {
            const aMatch = a.statusCategory === softFilterValue ? 0 : 1;
            const bMatch = b.statusCategory === softFilterValue ? 0 : 1;
            return aMatch - bMatch;
          })
        : result;
      setEntries(sorted);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [currentParentId, softFilterValue]);

  const selectEntry = useCallback(async (entry: DirectoryEntry) => {
    const nextBreadcrumb = [...breadcrumb, entry];
    // Record this selection immediately — stopping here (skip/close) after
    // this tap is a valid, complete answer at this depth.
    onChange({
      orgId: entry.orgId,
      unitId: entry.unitId ?? undefined,
      unitPathIds: nextBreadcrumb
        .map((b) => b.unitId)
        .filter((id): id is string => !!id),
    });

    // Look for children; if none exist, this is a terminal selection —
    // stay at the current list rather than showing an empty screen.
    const children = await fetchLevel(entry.directoryId);
    if (children.length > 0) {
      setBreadcrumb(nextBreadcrumb);
    }
  }, [breadcrumb, onChange]);

  const goBackOneLevel = useCallback(() => {
    setBreadcrumb((b) => b.slice(0, -1));
  }, []);

  return (
    <div className="px-5 py-4 flex flex-col h-full" dir="rtl">
      <h3 className="text-base font-bold text-slate-900 mb-1">{config.label}</h3>
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

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">טוען...</div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">אין תוצאות</div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {entries.map((entry) => {
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
                <ChevronRight size={16} className="text-slate-300 rotate-180" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
