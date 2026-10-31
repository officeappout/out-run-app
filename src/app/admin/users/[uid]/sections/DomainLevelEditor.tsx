'use client';

import React from 'react';
import { Edit3, Save, Shuffle } from 'lucide-react';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import type { UserTabData } from '../tabs/types';
import type { UserAdminActions } from '../useUserAdminActions';

type Props = Pick<UserTabData, 'fullProfile' | 'programs'> & { actions: UserAdminActions };

/** Clean Legacy / Randomize / Edit / Save buttons for manual level overrides. */
export function DomainLevelEditButtons({ fullProfile, programs, actions }: Props) {
  const {
    editingDomains, setEditingDomains, editLevels, setEditLevels, editPercents, setEditPercents,
    savingLevels, cleaningLegacy, cleanLegacyActivePrograms, saveManualLevelOverrides,
  } = actions;
  return (
    <>
      {!editingDomains ? (
        <div className="flex gap-2">
          {/* Clean legacy / duplicate activePrograms entries */}
          <button
            onClick={cleanLegacyActivePrograms}
            disabled={savingLevels || cleaningLegacy}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors disabled:opacity-40"
            title="הסר רשומות activePrograms ישנות באנגלית וכפילויות"
          >
            <Shuffle size={14} />
            {cleaningLegacy ? 'מנקה...' : 'נקה Legacy'}
          </button>
          {/* Randomize: random L1-15 + 0-100% for every non-master domain */}
          <button
            onClick={() => {
              const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; percent?: number }> | undefined;
              const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number }> | undefined;
              const allKeys = new Set([
                ...Object.keys(domains ?? {}),
                ...Object.keys(tracks ?? {}),
              ]);
              const randomLevels: Record<string, number> = {};
              const randomPcts: Record<string, number> = {};
              for (const k of Array.from(allKeys)) {
                const isMasterKey = programs.find(p => p.id === k)?.isMaster === true;
                if (!isMasterKey) {
                  randomLevels[k] = Math.floor(Math.random() * 15) + 1;
                  randomPcts[k] = Math.floor(Math.random() * 101);
                }
              }
              setEditLevels(randomLevels);
              setEditPercents(randomPcts);
              setEditingDomains(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
          >
            <Shuffle size={14} />
            ערבב
          </button>
          <button
            onClick={() => {
              const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; percent?: number }> | undefined;
              const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number }> | undefined;
              const merged: Record<string, number> = {};
              const mergedPcts: Record<string, number> = {};
              if (domains) {
                for (const [k, v] of Object.entries(domains)) {
                  const trackLevel = tracks?.[k]?.currentLevel ?? 0;
                  merged[k] = Math.max(v?.currentLevel ?? 0, trackLevel);
                }
              }
              if (tracks) {
                for (const [k, v] of Object.entries(tracks)) {
                  if (!merged[k]) merged[k] = v?.currentLevel ?? 0;
                  mergedPcts[k] = (v as any)?.percent ?? 0;
                }
              }
              setEditLevels(merged);
              setEditPercents(mergedPcts);
              setEditingDomains(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Edit3 size={14} />
            ערוך
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingDomains(false); setEditPercents({}); }}
            className="px-3 py-1.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            ביטול
          </button>
          <button
            disabled={savingLevels}
            onClick={() => saveManualLevelOverrides(editLevels, 'both', editPercents)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-lg disabled:opacity-50"
          >
            <Save size={14} />
            {savingLevels ? 'שומר...' : 'שמור'}
          </button>
        </div>
      )}
    </>
  );
}

/** Per-key level + percent editor grid (shown while editing). */
export function DomainLevelGrid({ fullProfile, programs, actions }: Props) {
  const { editingDomains, editLevels, setEditLevels, editPercents, setEditPercents } = actions;
  return (
    <div className="grid grid-cols-2 gap-4">
      {(() => {
        const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;
        const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;

        // Build set of IDs that belong to the user's active programs
        const activeProgramIds = new Set<string>();
        for (const ap of fullProfile.progression?.activePrograms ?? []) {
          const tid = ap.templateId || ap.id;
          if (tid) activeProgramIds.add(tid);
          const prog = programs.find(p => p.id === tid);
          if (prog?.subPrograms) prog.subPrograms.forEach(s => activeProgramIds.add(s));
        }

        const allKeys = new Set([
          ...Object.keys(domains ?? {}),
          ...Object.keys(tracks ?? {}),
        ]);

        // Filter: only show domains where level > 1 OR belonging to active programs
        const relevantKeys = Array.from(allKeys).filter(key => {
          const domainLevel = domains?.[key]?.currentLevel ?? 0;
          const trackLevel = tracks?.[key]?.currentLevel ?? 0;
          const effectiveLevel = Math.max(domainLevel, trackLevel);
          return effectiveLevel > 1 || activeProgramIds.has(key);
        });

        if (relevantKeys.length === 0) {
          return <div className="col-span-2 text-gray-500 text-sm">אין רמות רשומות</div>;
        }
        return relevantKeys.map(domain => {
          const domainLevel = domains?.[domain]?.currentLevel ?? 0;
          const trackLevel = tracks?.[domain]?.currentLevel ?? 0;
          const effectiveLevel = Math.max(domainLevel, trackLevel);
          const maxLevel = domains?.[domain]?.maxLevel ?? tracks?.[domain]?.maxLevel ?? 25;
          const currentPct = (tracks?.[domain] as any)?.percent ?? 0;
          const isDesynced = domainLevel > 0 && trackLevel > 0 && domainLevel !== trackLevel;
          const prog = programs.find(p => p.id === domain);
          const isMaster = prog?.isMaster === true;
          const displayName = prog?.name
            ? (typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? domain)
            : domain;
          return (
            <div key={domain} className={`rounded-xl p-4 ${isDesynced ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <span className="text-[#5BC2F2]">{getProgramIcon(resolveIconKey(domain), 'w-4 h-4')}</span>
                {displayName}
                {isMaster && <span className="text-xs text-gray-400">(נגזר)</span>}
              </div>
              {editingDomains && !isMaster ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-10">רמה</span>
                    <input
                      type="number"
                      min={1}
                      max={maxLevel}
                      value={editLevels[domain] ?? effectiveLevel}
                      onChange={e => setEditLevels(prev => ({ ...prev, [domain]: parseInt(e.target.value) || 1 }))}
                      className="w-20 px-2 py-1 text-lg font-black text-[#5BC2F2] border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-10">אחוז</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editPercents[domain] ?? currentPct}
                      onChange={e => setEditPercents(prev => ({ ...prev, [domain]: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="w-20 px-2 py-1 text-lg font-black text-purple-600 border-2 border-purple-300 rounded-lg focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-black text-2xl text-[#5BC2F2]">
                    רמה {effectiveLevel}
                  </div>
                  <div className="mt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-[#5BC2F2] h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, currentPct)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 font-medium w-9 text-left">{currentPct}%</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-400 mt-1">מתוך {maxLevel}</div>
              {isDesynced && !editingDomains && (
                <div className="text-xs text-amber-600 mt-1 font-medium">
                  ⚠ domain={domainLevel} track={trackLevel}
                </div>
              )}
            </div>
          );
        });
      })()}
    </div>
  );
}
