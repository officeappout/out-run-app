'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { buildProgramHierarchy } from '../../shared.utils';
import type { UserTabData } from '../tabs/types';
import type { UserAdminActions } from '../useUserAdminActions';
import { DomainLevelEditButtons, DomainLevelGrid } from './DomainLevelEditor';
import LevelDiagnostics from './LevelDiagnostics';
import { programCardInfo, type ProgramCardInfo } from './program-card-info';

type Tracks = Record<string, { currentLevel?: number; percent?: number }> | undefined;

type Props = Pick<UserTabData, 'fullProfile' | 'programs'> & { actions: UserAdminActions };

/**
 * One place for levels (I1): the read-only parent/child hierarchy is the
 * view, drawn with the app's own ProgramProgressCard (ring, % to the next
 * level, program icon, Hebrew name; owner 01.11). The old "רמות נוכחיות
 * (Domains)" grid only appears while editing, and its desync warnings live
 * in LevelDiagnostics.
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
          {(() => {
            const tracks = (fullProfile.progression as any)?.tracks as Tracks;
            const hierarchy = buildProgramHierarchy(fullProfile, programs);
            const covered = new Set<string>();
            hierarchy.forEach((m) => {
              covered.add(m.idOrSlug);
              m.children.forEach((c) => covered.add(c.idOrSlug));
            });
            const extra = Object.entries(tracks ?? {})
              .filter(([key, v]) => (v?.currentLevel ?? 0) > 0 && !covered.has(key))
              .map(([key]) => programCardInfo(key, tracks, programs));
            if (hierarchy.length === 0 && extra.length === 0) {
              return <p className="text-gray-500 text-sm">אין תוכניות פעילות</p>;
            }
            return (
              <div className="space-y-5">
                {hierarchy.map((master) => {
                  const info = programCardInfo(master.idOrSlug, tracks, programs, master.level);
                  return (
                    <div key={master.idOrSlug} className="space-y-2">
                      <LevelCard info={info} master badge={master.children.length > 0 ? 'אב' : undefined} />
                      {master.children.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 ps-4 border-s-2 border-cyan-100">
                          {master.children.map((child) => (
                            <LevelCard key={child.idOrSlug} info={programCardInfo(child.idOrSlug, tracks, programs, child.level)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {extra.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-bold mb-2">סקילים נוספים במעקב</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {extra.map((info) => <LevelCard key={info.key} info={info} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <LevelDiagnostics fullProfile={fullProfile} programs={programs} />
        </>
      )}
    </div>
  );
}

/** The app's level card; a never-assessed program gets its dashed "not started" look. */
function LevelCard({ info, master, badge }: { info: ProgramCardInfo; master?: boolean; badge?: string }) {
  const notStarted = info.level <= 0;
  return (
    <div className="relative">
      <ProgramProgressCard
        programName={info.name}
        iconKey={info.iconKey}
        currentLevel={Math.max(info.level, 1)}
        maxLevel={info.maxLevel}
        progressPercent={info.percent}
        badge={badge}
        state={notStarted ? (master ? 'not_started_master' : 'locked_prereq') : undefined}
        lockedHint={notStarted && !master ? 'עוד לא נבדקה רמה' : undefined}
      />
      {!info.resolved && (
        <span className="absolute top-2 end-2" title="לא נמצא בקטלוג התוכניות">
          <AlertCircle size={14} className="text-amber-500" />
        </span>
      )}
    </div>
  );
}
