'use client';

import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { buildProgramHierarchy, getTrackLevel, programDisplayName } from '../../shared.utils';
import type { UserTabData } from '../tabs/types';
import type { UserAdminActions } from '../useUserAdminActions';
import { DomainLevelEditButtons, DomainLevelGrid } from './DomainLevelEditor';
import LevelDiagnostics from './LevelDiagnostics';

type Props = Pick<UserTabData, 'fullProfile' | 'programs'> & { actions: UserAdminActions };

/**
 * One place for levels (I1): the read-only parent/child hierarchy is the
 * view; the old "רמות נוכחיות (Domains)" grid now only appears while
 * editing, and its desync warnings live in LevelDiagnostics.
 */
export default function ProgramLevels({ fullProfile, programs, actions }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-black text-gray-900">רמות לפי תוכנית</h3>
        <DomainLevelEditButtons fullProfile={fullProfile} programs={programs} actions={actions} />
      </div>
      {actions.editingDomains ? (
        <DomainLevelGrid fullProfile={fullProfile} programs={programs} actions={actions} />
      ) : (
        <>
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-xs text-green-700 font-bold flex items-center gap-2">
            <CheckCircle2 size={14} />
            {"מאוחד: אין יותר כפילויות עברית/אנגלית/hash — כל תוכנית מופיעה פעם אחת לפי ה-slug הקנוני"}
          </div>
          {(() => {
            const hierarchy = buildProgramHierarchy(fullProfile, programs);
            const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; percent?: number }> | undefined;
            if (hierarchy.length === 0) {
              return <p className="text-gray-500 text-sm">אין תוכניות פעילות</p>;
            }
            return (
              <div className="space-y-3">
                {hierarchy.map((master) => {
                  const masterPercent = Math.min(Math.round(tracks?.[master.idOrSlug]?.percent ?? 0), 100);
                  return (
                  <div key={master.idOrSlug} className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-black text-cyan-900 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-cyan-500 bg-white px-1.5 py-0.5 rounded">אב</span>
                        {!master.resolved && <span title={`לא זוהה: ${master.idOrSlug}`}><AlertCircle size={14} className="text-amber-500" /></span>}
                        {master.name}
                      </p>
                      <span className="px-3 py-1 bg-cyan-600 text-white rounded-full text-sm font-bold">רמה {master.level}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${masterPercent}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-cyan-700 tabular-nums">{masterPercent}%</span>
                    </div>
                    {master.children.length > 0 && (
                      <div className="mt-3 mr-6 space-y-1.5 border-r-2 border-cyan-200 pr-3">
                        {master.children.map((child) => {
                          const childPercent = Math.min(Math.round(tracks?.[child.idOrSlug]?.percent ?? 0), 100);
                          return (
                          <div key={child.idOrSlug} className="bg-white rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">בן</span>
                                {!child.resolved && <span title={`לא זוהה: ${child.idOrSlug}`}><AlertCircle size={12} className="text-amber-500" /></span>}
                                {child.name}
                              </p>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">רמה {child.level}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${childPercent}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-gray-500 tabular-nums">{childPercent}%</span>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            );
          })()}
          {(() => {
            const hierarchy = buildProgramHierarchy(fullProfile, programs);
            const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
            if (!tracks) return null;
            const coveredKeys = new Set<string>();
            hierarchy.forEach((m) => {
              coveredKeys.add(m.idOrSlug);
              m.children.forEach((c) => coveredKeys.add(c.idOrSlug));
            });
            const extraSkills = Object.entries(tracks)
              .filter(([key, v]) => (v?.currentLevel ?? 0) > 0 && !coveredKeys.has(key))
              .map(([key]) => ({ key, ...programDisplayName(key, programs), level: getTrackLevel(key, tracks, programs) }));
            if (extraSkills.length === 0) return null;
            return (
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-bold mb-2">סקילים נוספים במעקב (לא תחת תוכנית אב סטטית)</p>
                <div className="flex flex-wrap gap-2">
                  {extraSkills.map((s) => (
                    <span key={s.key} className="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      {!s.resolved && <span title={`לא זוהה: ${s.raw}`}><AlertCircle size={11} className="text-amber-500" /></span>}
                      {s.name} · רמה {s.level}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          <LevelDiagnostics fullProfile={fullProfile} programs={programs} />
        </>
      )}
    </div>
  );
}
