'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import type { UserTabData } from '../tabs/types';
import { programCardInfo } from './program-card-info';
import type { UserAdminActions } from '../useUserAdminActions';

type Props = Pick<UserTabData, 'fullProfile' | 'programs'> & { actions: UserAdminActions };

/** "תוכניות פעילות": list with add (program picker) and remove. */
export default function ActivePrograms({ fullProfile, programs, actions }: Props) {
  const { savingLevels, showProgramPicker, setShowProgramPicker, assignProgramToUser, removeActiveProgram } = actions;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-gray-900">תוכניות פעילות</h3>
          <button
            onClick={() => setShowProgramPicker(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Plus size={14} />
            הוסף
          </button>
        </div>
        {(fullProfile.progression?.activePrograms ?? []).length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 text-center">
            אין תוכניות פעילות
          </div>
        ) : (
          <div className="space-y-2">
            {(fullProfile.progression?.activePrograms ?? []).map((ap, idx) => {
              const tid = ap.templateId || ap.id;
              const info = programCardInfo(tid, undefined, programs);
              return (
                <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[#5BC2F2]">{getProgramIcon(info.iconKey, 'w-5 h-5')}</span>
                    <div className="font-bold text-sm text-gray-900">{info.name}</div>
                  </div>
                  <button
                    disabled={savingLevels}
                    onClick={() => removeActiveProgram(tid)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                    title="הסר תוכנית"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Program Picker Modal */}
      {showProgramPicker && (
        <div className="bg-white border-2 border-cyan-300 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-black text-gray-900">בחר תוכנית חדשה</h4>
            <button onClick={() => setShowProgramPicker(false)} className="p-1 hover:bg-gray-100 rounded-full">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
            {programs.filter(p => (p as any).isMaster).length > 0
              ? programs.filter(p => (p as any).isMaster).map(prog => {
                  const pName = typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? '';
                  return (
                    <button
                      key={prog.id}
                      onClick={() => assignProgramToUser(prog)}
                      disabled={savingLevels}
                      className="flex items-center justify-between p-3 bg-gray-50 hover:bg-cyan-50 border border-gray-200 hover:border-cyan-300 rounded-lg transition-colors text-right disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-600">{getProgramIcon(resolveIconKey(prog.iconKey, prog.slug), 'w-5 h-5')}</span>
                        <div>
                          <div className="font-bold text-gray-900">{pName}</div>
                        </div>
                      </div>
                      <Plus size={16} className="text-cyan-600" />
                    </button>
                  );
                })
              : programs.map(prog => {
                  const pName = typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? '';
                  return (
                    <button
                      key={prog.id}
                      onClick={() => assignProgramToUser(prog)}
                      disabled={savingLevels}
                      className="flex items-center justify-between p-3 bg-gray-50 hover:bg-cyan-50 border border-gray-200 hover:border-cyan-300 rounded-lg transition-colors text-right disabled:opacity-50"
                    >
                      <div>
                        <div className="font-bold text-gray-900">{pName}</div>
                      </div>
                      <Plus size={16} className="text-cyan-600" />
                    </button>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}
