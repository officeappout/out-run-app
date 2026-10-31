'use client';

import React from 'react';
import ProgramLevels from '../sections/ProgramLevels';
import ActivePrograms from '../sections/ActivePrograms';
import RunningProgram from '../sections/RunningProgram';
import type { UserAdminActions } from '../useUserAdminActions';
import type { UserTabData } from './types';

type Props = Pick<UserTabData, 'fullProfile' | 'programs'> & { actions: UserAdminActions };

/** התקדמות: levels (one place), active programs, level goals, running plan. */
export default function ProgressTab({ fullProfile, programs, actions }: Props) {
  return (
    <div className="space-y-6">
      <ProgramLevels fullProfile={fullProfile} programs={programs} actions={actions} />
      <ActivePrograms fullProfile={fullProfile} programs={programs} actions={actions} />
      {/* Level Goal Progress */}
      {(fullProfile.progression as any)?.levelGoalProgress && (fullProfile.progression as any).levelGoalProgress.length > 0 && (
        <div>
          <h3 className="text-lg font-black text-gray-900 mb-4">התקדמות יעדי רמה</h3>
          <div className="space-y-2">
            {(fullProfile.progression as any).levelGoalProgress.map((goal: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <span className="font-medium text-gray-900">{goal.exerciseName || goal.exerciseId}</span>
                <span className="text-sm font-bold">
                  {goal.bestPerformance ?? 0} / {goal.targetValue ?? 0} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <RunningProgram fullProfile={fullProfile} />
    </div>
  );
}
