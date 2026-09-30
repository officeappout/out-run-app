'use client';

/**
 * ProgramInfoPanel — Progression v2 Phase 4b round 2.
 *
 * Replaces the Skill Tree page's old two-piece header (a static title strip
 * in <header> + a separate always-expanded "current level" card in <main>,
 * both from round 1) with ONE collapsible panel, per David's mockup
 * ("פאנל תוכנית — overlay"):
 *
 *   - Collapsed (default): a compact strip — icon, name, "רמה X מתוך N", a
 *     horizontal progress bar (not a ring — saves vertical height) and a
 *     chevron. The tree renders fully visible below it.
 *   - Expanded (chevron tap): the SAME panel grows downward as an overlay
 *     that floats OVER the tree — a scrim dims the tree behind it — without
 *     pushing the tree's own layout down. This works for free because the
 *     panel is `position: absolute` inside its parent's `relative` "stage":
 *     an absolutely-positioned element's height never affects sibling
 *     layout, so no reflow-prevention trick is needed beyond that.
 *
 * z-index: deliberately explicit small values (panel z-[5], scrim z-[4]),
 * both safely below this screen's own sticky header (z-10, SkillTreeScreen.tsx)
 * so the header can never end up visually buried under the panel during
 * scroll. Not registered in .cursorrules' Z-Index Budget table — that table
 * is scoped to Map UI; this panel lives entirely inside SkillTreeScreen's
 * own `isolate` stacking context and never competes with any map surface,
 * the same reasoning already documented there for the pre-portal
 * ProgramLevelSwapSheet.
 *
 * The target-exercise row is gated on `matchingGoal` alone (not shown
 * whenever the tree has SOME representative, as round 1 did) — this round's
 * brief changed that decision explicitly: "target exercise only if
 * admin-curated (omit the line otherwise)".
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { getProgramIcon } from '@/features/content/programs';
import type { LevelGoalLike } from '../services/level-summary.service';

/** The collapsed strip's rendered height — the tree area reserves exactly
 *  this much top padding so it's never hidden behind the collapsed panel. */
export const PROGRAM_INFO_PANEL_COLLAPSED_HEIGHT = 96;

export interface ProgramInfoPanelProps {
  programName: string;
  /** Pass programMeta?.iconKey ?? programId — mirrors ProgramDrawer's own
   *  `getProgramIcon(program.iconKey ?? program.templateId, ...)` fallback. */
  iconKey?: string;
  currentLevel: number;
  maxLevel: number;
  programDescription?: string | null;
  /** Real admin-authored level description only — null hides the line (see level-summary.service.ts). */
  levelDescription: string | null;
  /** A targetGoals entry naming the tree's own current-level exercise — null hides the whole row. */
  matchingGoal: LevelGoalLike | null;
  currentLevelExerciseName: string;
  onReassess: () => void;
}

export function ProgramInfoPanel({
  programName,
  iconKey,
  currentLevel,
  maxLevel,
  programDescription,
  levelDescription,
  matchingGoal,
  currentLevelExerciseName,
  onReassess,
}: ProgramInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const safeMaxLevel = Math.max(maxLevel, currentLevel, 1);
  const percent = Math.min(100, Math.round((currentLevel / safeMaxLevel) * 100));
  const nextLevel = Math.min(safeMaxLevel, currentLevel + 1);

  return (
    <>
      {expanded && (
        <div
          className="absolute inset-0 z-[4] bg-slate-900/30"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}

      <div
        className="absolute inset-x-0 top-0 z-[5] bg-white rounded-b-[18px] overflow-hidden"
        style={{ boxShadow: '0 6px 18px rgba(31,56,82,.14)' }}
        dir="rtl"
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2.5 px-4 pt-3.5 pb-2 text-right"
        >
          <span
            className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-gray-900"
            style={{ background: '#e6f9fc' }}
          >
            {getProgramIcon(iconKey, 'w-[18px] h-[18px]')}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-black text-gray-900 truncate">{programName}</span>
            <span className="block text-[10.5px] font-bold text-gray-400">
              רמה {currentLevel} מתוך {safeMaxLevel}
            </span>
          </span>
          <span className="w-[26px] h-[26px] rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0 text-gray-400">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        <div className="px-4 pb-3">
          <div className="w-full h-[7px] bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent}%`,
                background: 'linear-gradient(90deg, #2CE0C0 0%, #20C6D6 55%, #2AA3E8 100%)',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-[9.5px] font-bold text-gray-400">
            <span>{percent}% לרמה {nextLevel}</span>
            <span>אתה כאן · רמה {currentLevel}</span>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 space-y-2.5 max-h-[60vh] overflow-y-auto">
                {programDescription && (
                  <p className="text-xs text-gray-600 bg-slate-50 rounded-xl px-3 py-2 leading-relaxed">
                    <b className="text-gray-800">על התוכנית: </b>
                    {programDescription}
                  </p>
                )}

                <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                  <div
                    className="w-[34px] h-[34px] rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
                    style={{ background: 'linear-gradient(135deg, #2CE0C0 0%, #20C6D6 50%, #2AA3E8 100%)' }}
                  >
                    {currentLevel}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-900">הרמה הנוכחית שלך · {currentLevel}</p>
                    {levelDescription && (
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{levelDescription}</p>
                    )}
                  </div>
                  <span
                    className="flex-shrink-0 flex items-center gap-1 text-[9.5px] font-black text-white rounded-full px-2 py-1"
                    style={{ backgroundColor: '#2AA3E8' }}
                  >
                    <MapPin size={9} />
                    אתה כאן
                  </span>
                </div>

                {matchingGoal && (
                  <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-bold text-gray-800 truncate">{currentLevelExerciseName}</p>
                    <p className="text-[11px] text-gray-400 flex-shrink-0">
                      יעד: {matchingGoal.targetValue} {matchingGoal.unit === 'seconds' ? 'שניות' : 'חזרות'}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onReassess}
                  className="w-full text-center text-[11.5px] font-bold text-[#0a8ea0] pt-1"
                >
                  🔄 עדכן את הרמה שלי
                </button>

                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="w-full text-center text-[11px] font-bold text-gray-400 pt-0.5"
                >
                  ︿ סגור
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
