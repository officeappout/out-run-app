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
 * both safely below the sticky global AppHeader SkillTreeScreen.tsx now
 * renders above them (default z-40, same as ProgressionScreen's own usage)
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
 *
 * Phase 4b round 4 fix: the collapsed strip's progress bar/percent used to
 * be FABRICATED — Math.round(currentLevel / maxLevel * 100), i.e. "how far
 * through the whole ladder," mislabeled as "progress toward the next
 * level." On a fresh assessment at level 1 of a 10-level tree that showed
 * a permanent, meaningless "10%" that never moved until the next level-up.
 * The real per-level-progress value already exists —
 * profile.progression.tracks[slug].percent, confirmed (recon, not
 * guessed) to be a real progress-toward-next-level field that's always
 * explicitly initialized to 0 on a fresh assessment and reset to 0 on
 * every level-up — SkillTreeScreen.tsx passes it straight through as
 * `progressPercent`. `null` means no real source at all (no track entry);
 * the bar and its caption are omitted entirely rather than fabricating
 * anything — real 0 (a genuine fresh assessment) still renders normally,
 * since 0% is honest data, not a fabrication.
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
  /** Real progress toward the next level (profile.progression.tracks[slug].percent) — null when there's no real track entry to read it from (omits the bar/caption entirely, never fabricated). */
  progressPercent: number | null;
  programDescription?: string | null;
  /** Real admin-authored level description only — null hides the line (see level-summary.service.ts). */
  levelDescription: string | null;
  /** A targetGoals entry naming the tree's own current-level exercise — null hides the whole row. */
  matchingGoal: LevelGoalLike | null;
  currentLevelExerciseName: string;
  /** Whether this level has any targetGoals at all — independent of matchingGoal (see resolveLevelSummary). */
  hasGoals: boolean;
  /** Only meaningful when hasGoals is true. */
  goalsCompleted: boolean;
  onReassess: () => void;
  /**
   * Home v2: rendered INSIDE the sticky AppHeader (so the strip moves with
   * the header instead of scrolling away from it — owner: "the top part is
   * detached"), as a game-like card. No absolute positioning, no scrim.
   */
  docked?: boolean;
}

export function ProgramInfoPanel({
  programName,
  iconKey,
  currentLevel,
  maxLevel,
  progressPercent,
  programDescription,
  levelDescription,
  matchingGoal,
  currentLevelExerciseName,
  hasGoals,
  goalsCompleted,
  onReassess,
  docked = false,
}: ProgramInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const safeMaxLevel = Math.max(maxLevel, currentLevel, 1);
  const nextLevel = Math.min(safeMaxLevel, currentLevel + 1);
  const hasRealProgress = progressPercent != null;
  const clampedPercent = hasRealProgress ? Math.max(0, Math.min(100, Math.round(progressPercent))) : 0;

  if (docked) {
    const pct = hasRealProgress ? clampedPercent : 0;
    const R = 21;
    const C = 2 * Math.PI * R;
    return (
      <div className="mx-3 mb-2 overflow-hidden rounded-[20px] bg-white shadow-v2-card" dir="rtl">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 px-3.5 pb-2 pt-3 text-right" aria-expanded={expanded}>
          {/* Level badge — a ring that fills toward the next level */}
          <span className="relative grid h-[52px] w-[52px] shrink-0 place-items-center">
            <svg width="52" height="52" className="absolute inset-0 -rotate-90" aria-hidden>
              <defs>
                <linearGradient id="lvl-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#00baf7" />
                  <stop offset="1" stopColor="#0cf2e3" />
                </linearGradient>
              </defs>
              <circle cx="26" cy="26" r={R} fill="none" stroke="#e6f4fa" strokeWidth="5" />
              <circle cx="26" cy="26" r={R} fill="none" stroke="url(#lvl-ring)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} />
            </svg>
            <span className="relative text-center leading-none">
              <span className="block text-[18px] font-black text-v2-ink tabular-nums">{currentLevel}</span>
              <span className="block text-[9.5px] font-extrabold text-v2-muted">רמה</span>
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-v2-tint text-v2-deep">{getProgramIcon(iconKey, 'w-[14px] h-[14px]')}</span>
              <span className="truncate text-[16px] font-black text-v2-ink">{programName}</span>
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
              {currentLevel >= safeMaxLevel ? 'הגעת לרמה הגבוהה ביותר' : `עוד ${100 - pct}% לרמה ${nextLevel} · מתוך ${safeMaxLevel}`}
            </span>
          </span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        {hasRealProgress && (
          <div className="px-3.5 pb-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-v2-tint">
              <div className="h-full rounded-full bg-v2-cta transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="max-h-[55vh] space-y-2.5 overflow-y-auto px-3.5 pb-4 pt-1">
                {programDescription && (
                  <p className="rounded-[14px] bg-v2-surface px-3 py-2 text-[13px] font-semibold leading-relaxed text-v2-ink-2">{programDescription}</p>
                )}
                {levelDescription && (
                  <p className="rounded-[14px] bg-v2-surface px-3 py-2 text-[13px] font-semibold leading-relaxed text-v2-ink-2">
                    <b className="text-v2-ink">הרמה שלך · {currentLevel}: </b>
                    {levelDescription}
                  </p>
                )}
                {matchingGoal && (
                  <div className="flex items-center justify-between rounded-[14px] bg-v2-surface px-3 py-2.5">
                    <p className="truncate text-[13px] font-extrabold text-v2-ink">{currentLevelExerciseName}</p>
                    <p className="flex-shrink-0 text-[12px] font-bold text-v2-muted">
                      יעד: {matchingGoal.targetValue} {matchingGoal.unit === 'seconds' ? 'שניות' : 'חזרות'}
                    </p>
                  </div>
                )}
                {hasGoals && (
                  <div className="flex items-center justify-between px-1 text-[13px]">
                    <span className="font-bold text-v2-muted">סטטוס</span>
                    <span className={`font-extrabold ${goalsCompleted ? 'text-v2-deep' : 'text-v2-ink'}`}>{goalsCompleted ? 'הושלם' : 'בתהליך'}</span>
                  </div>
                )}
                <button type="button" onClick={onReassess} className="h-10 w-full rounded-full bg-white text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring">
                  עדכון הרמה שלי
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

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

        {hasRealProgress && (
          <div className="px-4 pb-3">
            <div className="w-full h-[7px] bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${clampedPercent}%`,
                  background: 'linear-gradient(90deg, #2CE0C0 0%, #20C6D6 55%, #2AA3E8 100%)',
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1 text-[9.5px] font-bold text-gray-400">
              <span>{clampedPercent}% לרמה {nextLevel}</span>
              <span>אתה כאן · רמה {currentLevel}</span>
            </div>
          </div>
        )}

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

                {hasGoals && (
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-gray-500">סטטוס</span>
                    <span className={`font-bold ${goalsCompleted ? 'text-[#20C6D6]' : 'text-gray-700'}`}>
                      {goalsCompleted ? 'הושלם' : 'בתהליך'}
                    </span>
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
