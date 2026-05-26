'use client';

import { useState } from 'react';
import { TargetProgramRef } from '../../../core/exercise.types';
import { Program } from '../../../../programs/core/program.types';
import { Link as LinkIcon, Plus, Trash2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { ExerciseEditorSectionProps } from './shared/types';
import { safeRenderText } from '@/utils/render-helpers';

interface ContentSectionProps extends ExerciseEditorSectionProps {
  programs?: Program[];
  highlights: string[];
  setHighlights: React.Dispatch<React.SetStateAction<string[]>>;
  targetPrograms: TargetProgramRef[];
  setTargetPrograms: React.Dispatch<React.SetStateAction<TargetProgramRef[]>>;
  toggleArrayItem: <T,>(array: T[], item: T) => T[];
  addArrayItem: (setter: React.Dispatch<React.SetStateAction<string[]>>) => void;
  removeArrayItem: (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number) => void;
  updateArrayItem: (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number, value: string) => void;
}

export default function ContentSection({
  formData,
  setFormData,
  activeLang,
  programs = [],
  highlights,
  setHighlights,
  targetPrograms,
  setTargetPrograms,
  toggleArrayItem,
  addArrayItem,
  removeArrayItem,
  updateArrayItem,
}: ContentSectionProps) {
  // Default to collapsed for cleaner UI
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Selection Engine Logic Section - Collapsible */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <button
                      type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors"
                    >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Settings2 className="text-white" size={20} />
                </div>
            <div className="text-right">
              <h2 className="text-lg font-black text-gray-900">
                לוגיקה תיעדוף והצגת תכנים
              </h2>
              <p className="text-xs text-gray-500">
                Selection Engine Logic - שיוך לתוכניות ורמות
              </p>
            </div>
            {targetPrograms.length > 0 && (
              <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full font-bold">
                {targetPrograms.length} שיוכים
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp size={24} className="text-gray-500" />
          ) : (
            <ChevronDown size={24} className="text-gray-500" />
          )}
        </button>

        {isExpanded && (
          <div className="p-6 border-t border-gray-200">
        {/* Program Assignments (Program + Level Rows) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-md font-bold text-gray-800 flex items-center gap-2">
                <LinkIcon size={16} />
                שיוך תרגיל לתוכניות (Program Assignments)
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                הוסף שורות שיוך של תוכנית + רמה שבהן התרגיל הזה מומלץ במיוחד. כל תוכנית יכולה להופיע פעם אחת בלבד.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setTargetPrograms((prev) => [...prev, { programId: '', level: 1 }])
              }
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg font-bold hover:bg-indigo-600 transition-colors"
            >
              <Plus size={18} />
              הוסף שיוך
            </button>
          </div>

          {programs.length === 0 && (
            <p className="text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-xl bg-gray-50">
              אין תוכניות זמינות להגדרה.
            </p>
          )}

          {programs.length > 0 && (
            <div className="space-y-3">
              {targetPrograms.length === 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4">
                  עדיין לא נוספו שיוכים. לחץ על &quot;הוסף שיוך&quot; כדי להתחיל.
                </div>
              )}

              {targetPrograms.map((assignment, index) => {
                const selectedProgramIds = targetPrograms
                  .map((tp, i) => (i === index ? null : tp.programId))
                  .filter((id): id is string => Boolean(id));
                
                // Find the selected program to get its maxLevels and slug
                const selectedProgram = programs.find(p => p.id === assignment.programId);
                // Default to 10 if no program selected or maxLevels not defined
                const DEFAULT_MAX_LEVELS = 25;
                const maxLevels = selectedProgram?.maxLevels || DEFAULT_MAX_LEVELS;
                
                // Generate level options based on program's maxLevels
                const levelOptions = Array.from({ length: maxLevels }, (_, i) => i + 1);

                // Handstand Triad: detect if this row is a handstand or hspu program.
                //
                // Mirror the slug-derivation logic from buildIdToSlugMapFromPrograms:
                //   effectiveSlug = p.slug || p.movementPattern || name-normalized
                // Then use includes() so partial names like 'handstand_push_ups' still match.
                // Final Hebrew keyword fallback catches programs with only a Hebrew name.
                const _pName = selectedProgram?.name?.toLowerCase() ?? '';
                const _effectiveSlug = selectedProgram
                  ? (
                      selectedProgram.slug ||
                      selectedProgram.movementPattern ||
                      _pName.replace(/[\s-]+/g, '_')
                    )
                  : assignment.programId ?? '';

                const isHandstandProgram =
                  _effectiveSlug.includes('handstand') ||
                  _effectiveSlug.includes('hspu') ||
                  _pName.includes('handstand') ||
                  _pName.includes('hspu') ||
                  (selectedProgram?.name ?? '').includes('עמידת ידיים');

                // Current triad scores — default to 8 (midpoint of 1–15) when not yet set
                const strengthScore = assignment.strengthScore ?? 8;
                const balanceScore  = assignment.balanceScore  ?? 8;
                const mobilityScore = assignment.mobilityScore ?? 8;

                /**
                 * Update one triad score and auto-recalculate level.
                 * Clamped to [1, 10] — these programs max out at 10 by design.
                 */
                const handleTriadChange = (
                  field: 'strengthScore' | 'balanceScore' | 'mobilityScore',
                  raw: number,
                ) => {
                  const value = Math.min(15, Math.max(1, raw));
                  const s = field === 'strengthScore' ? value : strengthScore;
                  const b = field === 'balanceScore'  ? value : balanceScore;
                  const m = field === 'mobilityScore'  ? value : mobilityScore;
                  const newLevel = Math.min(15, Math.max(1, Math.round((s + b + m) / 3)));
                  setTargetPrograms((prev) => {
                    const next = [...prev];
                    next[index] = {
                      ...next[index],
                      [field]: value,
                      level: newLevel,
                    };
                    return next;
                  });
                };

                return (
                  <div
                    key={index}
                    className={`flex flex-col gap-3 p-4 border rounded-xl ${
                      isHandstandProgram
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {/* ── Top row: Program selector + Level + Delete ── */}
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                      <div className="flex-1 flex flex-col md:flex-row gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-500 mb-1">
                            תוכנית
                          </label>
                          <select
                            value={assignment.programId}
                            onChange={(e) => {
                              const value = e.target.value;
                              const newProgram = programs.find(p => p.id === value);
                              const newMaxLevels = newProgram?.maxLevels || DEFAULT_MAX_LEVELS;
                              
                              setTargetPrograms((prev) => {
                                const next = [...prev];
                                const currentLevel = next[index].level;
                                const adjustedLevel = currentLevel > newMaxLevels ? newMaxLevels : currentLevel;
                                
                                next[index] = {
                                  ...next[index],
                                  programId: value,
                                  level: adjustedLevel,
                                };
                                return next;
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-white"
                          >
                            <option value="">בחר תוכנית...</option>
                            {programs.map((program) => (
                              <option
                                key={program.id}
                                value={program.id}
                                disabled={selectedProgramIds.includes(program.id)}
                              >
                                {safeRenderText(program.name)} {program.maxLevels ? `(${program.maxLevels} רמות)` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-full md:w-44">
                          <label className="block text-xs font-bold text-gray-500 mb-1">
                            רמה{isHandstandProgram ? ' (מחושב אוטומטי)' : selectedProgram ? ` (מתוך ${maxLevels})` : ''}
                          </label>
                          <select
                            value={assignment.level}
                            onChange={(e) => {
                              const level = parseInt(e.target.value) || 1;
                              setTargetPrograms((prev) => {
                                const next = [...prev];
                                next[index] = { ...next[index], level };
                                return next;
                              });
                            }}
                            disabled={!assignment.programId || isHandstandProgram}
                            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-white ${
                              !assignment.programId || isHandstandProgram ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                          >
                            {levelOptions.map((level) => (
                              <option key={level} value={level}>
                                Level {level} {level === maxLevels ? '(מקסימום)' : ''}
                              </option>
                            ))}
                          </select>
                          {!assignment.programId && (
                            <p className="text-[10px] text-amber-600 mt-1">בחר תוכנית קודם</p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setTargetPrograms((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="self-start md:self-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="הסר שיוך"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {/* ── Handstand Triad sliders (handstand / hspu only) ── */}
                    {isHandstandProgram && (
                      <div className="pt-3 border-t border-indigo-200 space-y-3">
                        <p className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                          <span>⚡</span> Handstand Triad — ניתוח תלת-ממדי
                          <span className="ml-auto font-normal text-indigo-500 text-[11px]">
                            ממוצע → Level {assignment.level}
                          </span>
                        </p>

                        {/* Strength */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-gray-600">
                              כוח (Strength)
                            </label>
                            <span className="text-xs font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                              {strengthScore}/15
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={15}
                            step={1}
                            value={strengthScore}
                            onChange={(e) => handleTriadChange('strengthScore', parseInt(e.target.value))}
                            className="w-full h-2 rounded-full accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                            <span>1</span><span>8</span><span>15</span>
                          </div>
                        </div>

                        {/* Balance */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-gray-600">
                              שיווי משקל (Balance)
                            </label>
                            <span className="text-xs font-black text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                              {balanceScore}/15
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={15}
                            step={1}
                            value={balanceScore}
                            onChange={(e) => handleTriadChange('balanceScore', parseInt(e.target.value))}
                            className="w-full h-2 rounded-full accent-purple-500 cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                            <span>1</span><span>8</span><span>15</span>
                          </div>
                        </div>

                        {/* Mobility */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-gray-600">
                              גמישות (Mobility)
                            </label>
                            <span className="text-xs font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                              {mobilityScore}/15
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={15}
                            step={1}
                            value={mobilityScore}
                            onChange={(e) => handleTriadChange('mobilityScore', parseInt(e.target.value))}
                            className="w-full h-2 rounded-full accent-emerald-500 cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                            <span>1</span><span>8</span><span>15</span>
                          </div>
                        </div>

                        {/* Auto-level formula display */}
                        <p className="text-[10px] text-indigo-500 text-center pt-1">
                          ({strengthScore} + {balanceScore} + {mobilityScore}) ÷ 3 = {((strengthScore + balanceScore + mobilityScore) / 3).toFixed(2)} → Level {assignment.level}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {targetPrograms.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  נבחרו {targetPrograms.length} שיוכי תוכנית+רמה. כל תוכנית יכולה להופיע פעם אחת בלבד.
                </p>
              )}
            </div>
          )}
        </div>
          </div>
        )}
      </div>
    </>
  );
}
