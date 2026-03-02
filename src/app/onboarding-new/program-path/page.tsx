'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronLeft, Check, UserCircle } from 'lucide-react';
import {
  MUSCLE_GROUP_LABELS,
  type MuscleGroup,
} from '@/features/content/exercises/core/exercise.types';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';

/** Muscle group ID → SVG path (public/assets/icons/muscles/ or fallback to public/icons/muscles/) */
const MUSCLE_ICON_PATHS: Record<string, string> = {
  chest: '/assets/icons/muscles/chest.svg',
  back: '/assets/icons/muscles/back.svg',
  shoulders: '/assets/icons/muscles/shoulders.svg',
  biceps: '/assets/icons/muscles/biceps.svg',
  triceps: '/assets/icons/muscles/triceps.svg',
  legs: '/assets/icons/muscles/quads.svg',
  core: '/assets/icons/muscles/abs.svg',
};

/** Hardcoded 6 skill programs (Firestore IDs) — no fetch required */
const SKILL_PROGRAMS: { id: string; nameHe: string }[] = [
  { id: 'oap', nameHe: 'מתח יד אחת' },
  { id: 'muscle_up', nameHe: 'עליית כוח' },
  { id: 'handstand', nameHe: 'עמידת ידיים' },
  { id: 'planche', nameHe: 'פלאנץ׳' },
  { id: 'front_lever', nameHe: 'פרונט ליבר' },
  { id: 'hspu', nameHe: 'שכיבות סמיכה בעמידת ידיים' },
];

const MUSCLE_FOCUS_IDS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'core',
];

type ProgramPathType = 'health' | 'body_focus' | 'skills' | null;

function persistToStorage(path: ProgramPathType, muscleIds: string[], skillIds: string[]) {
  if (typeof window === 'undefined') return;
  if (path) {
    sessionStorage.setItem('onboarding_program_path', path);
  }
  sessionStorage.setItem('onboarding_muscle_focus', JSON.stringify(muscleIds));
  sessionStorage.setItem('onboarding_skill_focus', JSON.stringify(skillIds));
}

export default function ProgramPathPage() {
  const router = useRouter();
  const [path, setPath] = useState<ProgramPathType>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const FULL_BODY_ID = 'full_body';

  const toggleMuscle = useCallback(
    (id: string) => {
      setSelectedMuscles((prev) => {
        if (id === FULL_BODY_ID) {
          return prev.includes(FULL_BODY_ID) ? [] : [FULL_BODY_ID];
        }
        if (prev.includes(FULL_BODY_ID)) {
          return [id];
        }
        return prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      });
    },
    []
  );

  const toggleSkill = useCallback((id: string) => {
    setSelectedSkills((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  }, []);

  const getSkillOrder = useCallback(
    (id: string) => {
      const idx = selectedSkills.indexOf(id);
      return idx >= 0 ? idx + 1 : null;
    },
    [selectedSkills]
  );

  const isFullBodySelected = selectedMuscles.includes(FULL_BODY_ID);

  const canContinue =
    path !== null &&
    (path === 'health' ||
      (path === 'body_focus' && selectedMuscles.length > 0) ||
      (path === 'skills' && selectedSkills.length > 0));

  const handleContinue = () => {
    if (!canContinue) return;
    const toPersist =
      selectedMuscles.includes(FULL_BODY_ID)
        ? ['push', 'pull', 'legs', 'core']
        : selectedMuscles;
    persistToStorage(path!, toPersist, selectedSkills);
    router.push('/onboarding-new/assessment-visual');
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#F4FAFD' }}
      dir="rtl"
    >
      <div className="w-full max-w-md mx-auto px-4 py-6 pb-8 flex flex-col flex-1">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1
            className="text-2xl font-black mb-2"
            style={{ color: '#182236' }}
          >
            איזה מסלול מתאים לך?
          </h1>
          <p className="text-sm text-slate-500">
            בחר את הכיוון שתרצה להתמקד בו
          </p>
        </motion.div>

        {/* Option A: Health */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          onClick={() => {
            setPath('health');
            setSelectedMuscles([]);
            setSelectedSkills([]);
          }}
          className={`w-full bg-white p-5 rounded-3xl transition-all duration-300 min-h-[88px] flex items-center gap-4 shadow-md hover:shadow-lg ${
            path === 'health'
              ? 'border-2 border-[#5BC2F2] shadow-[0_10px_40px_rgba(91,194,242,0.12)]'
              : 'border-2 border-transparent hover:border-slate-200'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              path === 'health' ? 'bg-[#5BC2F2]/15' : 'bg-slate-100'
            }`}
          >
            <Heart
              size={28}
              className={path === 'health' ? 'text-[#5BC2F2]' : 'text-slate-500'}
            />
          </div>
          <div className="flex-1 text-right">
            <p
              className={`text-base font-bold ${
                path === 'health' ? 'text-[#182236]' : 'text-slate-700'
              }`}
            >
              מסלול בריאות
            </p>
            <p className="text-sm text-slate-500">
              אורח חיים בריא והרגלים טובים
            </p>
          </div>
          {path === 'health' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shrink-0"
            >
              <Check size={14} className="text-white" strokeWidth={3} />
            </motion.div>
          )}
        </motion.button>

        {/* Option B: Muscle Focus */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`mt-4 bg-white rounded-3xl transition-all duration-300 overflow-hidden shadow-md ${
            path === 'body_focus' || selectedMuscles.length > 0
              ? 'border-2 border-[#5BC2F2] shadow-[0_10px_40px_rgba(91,194,242,0.12)]'
              : 'border-2 border-transparent'
          }`}
        >
          <button
            onClick={() => {
              setPath('body_focus');
              setSelectedSkills([]);
            }}
            className="w-full p-5 min-h-[88px] flex items-center gap-4"
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                path === 'body_focus' || selectedMuscles.length > 0
                  ? 'bg-[#5BC2F2]/15'
                  : 'bg-slate-100'
              }`}
            >
              <span
                className={`text-2xl ${
                  path === 'body_focus' || selectedMuscles.length > 0
                    ? 'text-[#5BC2F2]'
                    : 'text-slate-500'
                }`}
              >
                💪
              </span>
            </div>
            <div className="flex-1 text-right">
              <p
                className={`text-base font-bold ${
                  path === 'body_focus' || selectedMuscles.length > 0
                    ? 'text-[#182236]'
                    : 'text-slate-700'
                }`}
              >
                מיקוד שרירים
              </p>
              <p className="text-sm text-slate-500">
                {isFullBodySelected
                  ? 'כל הגוף נבחר'
                  : selectedMuscles.length > 0
                    ? `${selectedMuscles.length} שרירים נבחרו`
                    : 'בחר שרירים להתמקד בהם'}
              </p>
            </div>
            {(path === 'body_focus' || selectedMuscles.length > 0) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shrink-0"
              >
                <Check size={14} className="text-white" strokeWidth={3} />
              </motion.div>
            )}
          </button>

          <AnimatePresence>
            {path === 'body_focus' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden px-5 pb-5"
              >
                <p className="text-slate-600 text-sm mb-4 text-center">
                  בחר שרירים להתמקד בהם
                </p>
                {/* Full Body card — top of grid */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleMuscle(FULL_BODY_ID)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all h-14 mb-3 ${
                    isFullBodySelected
                      ? 'bg-[#5BC2F2]/10 border-2 border-[#5BC2F2] shadow-[0_4px_15px_rgba(91,194,242,0.15)]'
                      : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      isFullBodySelected ? 'font-bold text-[#5BC2F2]' : 'text-slate-700'
                    }`}
                  >
                    כל הגוף
                  </span>
                  <UserCircle
                    size={24}
                    className={isFullBodySelected ? 'text-[#5BC2F2]' : 'text-slate-400'}
                  />
                </motion.button>
                <div className="grid grid-cols-2 gap-3">
                  {MUSCLE_FOCUS_IDS.map((id) => {
                    const label = MUSCLE_GROUP_LABELS[id]?.he ?? id;
                    const isSelected = selectedMuscles.includes(id);
                    const iconSrc = MUSCLE_ICON_PATHS[id] ?? MUSCLE_ICON_PATHS.chest;
                    return (
                      <motion.button
                        key={id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleMuscle(id)}
                        className={`flex items-center justify-between p-3 rounded-2xl transition-all h-14 ${
                          isSelected
                            ? 'bg-[#5BC2F2]/10 border-2 border-[#5BC2F2] shadow-[0_4px_15px_rgba(91,194,242,0.15)]'
                            : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className={`text-sm ${
                            isSelected
                              ? 'font-bold text-[#5BC2F2]'
                              : 'font-medium text-slate-700'
                          }`}
                        >
                          {label}
                        </span>
                        <img
                          src={iconSrc}
                          alt=""
                          className={`w-5 h-5 object-contain ${
                            isSelected ? 'opacity-100' : 'opacity-60'
                          }`}
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            const fallback = iconSrc.replace('/assets/icons/muscles/', '/icons/muscles/');
                            if (fallback !== iconSrc) {
                              el.src = fallback;
                              el.onerror = null;
                            } else {
                              el.style.display = 'none';
                            }
                          }}
                        />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Option C: Skills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`mt-4 bg-white rounded-3xl transition-all duration-300 overflow-hidden shadow-md ${
            path === 'skills' || selectedSkills.length > 0
              ? 'border-2 border-[#5BC2F2] shadow-[0_10px_40px_rgba(91,194,242,0.12)]'
              : 'border-2 border-transparent'
          }`}
        >
          <button
            onClick={() => {
              setPath('skills');
              setSelectedMuscles([]);
            }}
            className="w-full p-5 min-h-[88px] flex items-center gap-4"
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                path === 'skills' || selectedSkills.length > 0
                  ? 'bg-[#5BC2F2]/15'
                  : 'bg-slate-100'
              }`}
            >
              <span
                className={`text-2xl ${
                  path === 'skills' || selectedSkills.length > 0
                    ? 'text-[#5BC2F2]'
                    : 'text-slate-500'
                }`}
              >
                🤸
              </span>
            </div>
            <div className="flex-1 text-right">
              <p
                className={`text-base font-bold ${
                  path === 'skills' || selectedSkills.length > 0
                    ? 'text-[#182236]'
                    : 'text-slate-700'
                }`}
              >
                קליסטניקס וסקילים
              </p>
              <p className="text-sm text-slate-500">
                {selectedSkills.length > 0
                  ? `${selectedSkills.length} תוכניות נבחרו (לפי עדיפות)`
                  : 'בחר תוכניות לפי סדר עדיפות'}
              </p>
            </div>
            {(path === 'skills' || selectedSkills.length > 0) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-[#5BC2F2] flex items-center justify-center shrink-0"
              >
                <Check size={14} className="text-white" strokeWidth={3} />
              </motion.div>
            )}
          </button>

          <AnimatePresence>
            {path === 'skills' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden px-5 pb-5"
              >
                <p className="text-slate-600 text-sm mb-4 text-center">
                  בחר תוכניות לפי סדר עדיפות (לחיצה ראשונה = עדיפות 1)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {SKILL_PROGRAMS.map((skill) => {
                    const isSelected = selectedSkills.includes(skill.id);
                    const order = getSkillOrder(skill.id);
                    const iconKey = resolveIconKey(undefined, skill.id);
                    return (
                      <motion.button
                        key={skill.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleSkill(skill.id)}
                        className={`relative flex items-center justify-between p-3 rounded-2xl transition-all h-14 ${
                          isSelected
                            ? 'bg-[#5BC2F2]/10 border-2 border-[#5BC2F2] shadow-[0_4px_15px_rgba(91,194,242,0.15)]'
                            : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                        }`}
                      >
                        {order !== null && (
                          <span
                            className="absolute top-2 start-2 w-5 h-5 rounded-full bg-[#5BC2F2] text-white text-xs font-bold flex items-center justify-center"
                            style={{ fontSize: 10 }}
                          >
                            {order}
                          </span>
                        )}
                        <span
                          className={`text-sm truncate max-w-[70%] ${
                            isSelected
                              ? 'font-bold text-[#5BC2F2]'
                              : 'font-medium text-slate-700'
                          }`}
                        >
                          {skill.nameHe}
                        </span>
                        <span
                          className={
                            isSelected ? 'text-[#5BC2F2]' : 'text-slate-400'
                          }
                        >
                          {getProgramIcon(iconKey, 'w-5 h-5')}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="flex-grow" />

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 pt-4"
        >
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className={`w-full py-4 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-2 shadow-xl ${
              canContinue
                ? 'bg-[#5BC2F2] hover:bg-[#4AADE3] text-white shadow-[#5BC2F2]/30 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>המשך</span>
            <ChevronLeft size={20} />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
