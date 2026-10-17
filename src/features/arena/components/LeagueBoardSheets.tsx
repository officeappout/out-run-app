'use client';

/**
 * Small v2 bottom sheets for the league board: the row "peek" (a participant's
 * existing info) and "how points work". Portalled to document.body — the
 * leagues tab content sits inside a framer-motion transform, which would
 * otherwise turn `fixed` into "fixed to that transformed parent".
 * z-index: backdrop z-[100] / sheet z-[101] (registered in .cursorrules —
 * full-screen sheets, and one step up to clear OfflineBanner).
 */

import React, { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Crown, Dumbbell, Flame, Footprints, MapPin, Scale, Swords, UserPlus, X, type LucideIcon } from 'lucide-react';
import { EASE_V2 } from '@/components/ui/v2/tokens';
import IconTile from '@/components/ui/v2/IconTile';
import StatNumber from '@/components/ui/v2/StatNumber';
import Button from '@/components/ui/v2/Button';
import type { LeaderboardEntry } from '@/features/arena/services/ranking.service';
import type { LeaderboardMode } from './format-leaderboard-score';
import { splitScore } from './league-board-logic';

// ── Shell ────────────────────────────────────────────────────────────────────

interface BoardSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function BoardSheet({ isOpen, onClose, title, children }: BoardSheetProps) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-v2-ink/40"
            onClick={onClose}
            aria-hidden
          />
          <motion.section
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            dir="rtl"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: 0.42, ease: EASE_V2 }}
            className="fixed inset-x-0 bottom-0 z-[101] mx-auto max-w-md rounded-t-[28px] bg-white shadow-v2-sheet"
            style={{ maxHeight: '85vh' }}
          >
            <div className="pt-2.5 pb-1">
              <span className="block mx-auto w-10 h-[5px] rounded-full bg-[#d5dde2]" />
            </div>
            <div className="flex items-center justify-between px-5 pt-1 pb-2">
              <span className="text-[17px] font-black text-v2-ink tracking-v2-tight">{title}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="w-9 h-9 rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline flex items-center justify-center text-v2-ink-2 active:scale-[0.97] transition-transform ease-v2"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div
              className="overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
              style={{ maxHeight: 'calc(85vh - 72px)' }}
            >
              {children}
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Row peek ─────────────────────────────────────────────────────────────────

interface PeekProps {
  entry: LeaderboardEntry;
  myEntry: LeaderboardEntry | null;
  totalParticipants: number;
  mode: LeaderboardMode;
  isSegmentMode: boolean;
  /** Current user's own currentStreak (profile) — only shown on your own peek. */
  myStreak?: number;
  /** Opens the existing invite sheet. */
  onInvite: () => void;
}

export function ParticipantPeek({ entry, myEntry, totalParticipants, mode, isSegmentMode, myStreak, onInvite }: PeekProps) {
  const score = splitScore(entry.totalCredit, mode, isSegmentMode);
  const isFirst = entry.rank === 1;
  const showWorkouts = mode !== 'general' && mode !== 'steps' && !isSegmentMode;
  const gap =
    !entry.isCurrentUser && myEntry && !isSegmentMode
      ? entry.totalCredit - myEntry.totalCredit
      : null;

  return (
    <div className="pt-1">
      <div className="flex items-center gap-3">
        <span
          className="w-14 h-14 rounded-full flex items-center justify-center text-[22px] font-black text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #00baf7, #0cf2e3)' }}
          aria-hidden
        >
          {entry.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-black text-v2-ink truncate tracking-v2-tight">
            {entry.name}
            {entry.isCurrentUser && <span className="text-[13px] font-bold text-v2-deep mr-1.5">(את/ה)</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[13px] font-bold text-v2-muted">
            {isFirst && <Crown size={14} strokeWidth={2.4} className="text-[#b37400]" fill="#ffc83d" aria-hidden />}
            <span className="tabular-nums">מקום {entry.rank}</span>
            {totalParticipants > 0 && <span className="tabular-nums">מתוך {totalParticipants}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <div className="rounded-v2-tile bg-v2-surface ring-1 ring-inset ring-v2-hairline p-3.5">
          <StatNumber value={Number(entry.totalCredit) || 0} size="sm" format={() => score.value} unit={score.unit} label="ניקוד בטבלה" />
        </div>
        {showWorkouts ? (
          <div className="rounded-v2-tile bg-v2-surface ring-1 ring-inset ring-v2-hairline p-3.5">
            <StatNumber value={entry.workoutCount} size="sm" unit="אימונים" label="בתקופה" />
          </div>
        ) : entry.isCurrentUser && !!myStreak ? (
          <div className="rounded-v2-tile bg-v2-surface ring-1 ring-inset ring-v2-hairline p-3.5">
            <StatNumber value={myStreak} size="sm" unit="ימים" label="הרצף שלך" />
          </div>
        ) : gap !== null ? (
          <div className="rounded-v2-tile bg-v2-surface ring-1 ring-inset ring-v2-hairline p-3.5">
            <StatNumber
              value={Math.abs(gap)}
              size="sm"
              format={() => splitScore(Math.abs(gap), mode).value}
              unit={splitScore(Math.abs(gap), mode).unit}
              label={gap > 0 ? 'לפניך' : gap < 0 ? 'אחריך' : 'שוויון'}
            />
          </div>
        ) : null}
      </div>

      {!entry.isCurrentUser && (
        <Button variant="ghost" size="md" block className="mt-4" onClick={onInvite}>
          הזמן חברים לליגה
        </Button>
      )}
    </div>
  );
}

// ── How points work ──────────────────────────────────────────────────────────

interface HowRow {
  icon: LucideIcon;
  tone: 'accent' | 'steps' | 'run' | 'gold';
  title: string;
  body: string;
}

/**
 * Copy verified against the code, 15.10.2026:
 *  - כללי = getStreakLeaderboard → streaks.currentStreak; a day counts once
 *    the day's total activity crosses STREAK_MINIMUM_MINUTES (10) —
 *    useActivityStore logWorkout; a gap of more than one day resets to 1.
 *    Tenant (org) leagues rank active days instead (getTenantLeaderboard).
 *  - צעדים = getStepsLeaderboard: last 7 days of dailyActivity steps ÷ 7.
 *  - מרחק = getDistanceLeaderboard: summed distanceKm of cardio posts since
 *    getWindowStart(timeWindow).
 *  - Group / neighborhood / city battles = summed activityCredit:
 *    durationMinutes × CREDIT_MULTIPLIER (strength 2, cardio 1,
 *    maintenance 1) — feed.service.ts. Groups rank by avgScore per active
 *    member (getGroupCompetitionLeaderboard); scopes by summed totalScore.
 * XP is NOT part of any league score.
 */
export function HowPointsContent({ isTenant }: { isTenant: boolean }) {
  const rows: HowRow[] = [
    {
      icon: Flame,
      tone: 'gold',
      title: isTenant ? 'כללי — ימים פעילים' : 'כללי — רצף ימי אימון',
      body: isTenant
        ? 'בליגת הארגון סופרים את מספר הימים שבהם התאמנת.'
        : 'כל יום שבו צברת לפחות 10 דקות פעילות מוסיף יום לרצף. יום בלי פעילות מאפס את הרצף.',
    },
    {
      icon: Footprints,
      tone: 'steps',
      title: 'צעדים',
      body: 'ממוצע הצעדים היומי שלך ב-7 הימים האחרונים.',
    },
    {
      icon: MapPin,
      tone: 'run',
      title: 'מרחק',
      body: 'סך הקילומטרים מאימוני ריצה והליכה שתיעדת בתקופה שנבחרה (יומי, שבועי או חודשי).',
    },
    {
      icon: Swords,
      tone: 'accent',
      title: 'קבוצות, שכונות וערים',
      body: 'נקודות פעילות: כל דקת אימון כוח שווה 2 נקודות, וכל דקת אימון אירובי או תחזוקה שווה נקודה אחת. קבוצות מדורגות לפי ממוצע לחבר פעיל; שכונות וערים — לפי סכום הנקודות של כל החברים.',
    },
  ];
  return (
    <div className="space-y-2.5 pt-1">
      {rows.map((r) => (
        <div key={r.title} className="flex items-start gap-3 rounded-v2-tile bg-v2-surface ring-1 ring-inset ring-v2-hairline p-3.5">
          <IconTile icon={r.icon} tone={r.tone} size="sm" />
          <div className="min-w-0">
            <div className="text-[15px] font-black text-v2-ink">{r.title}</div>
            <p className="text-[13px] leading-relaxed text-v2-ink-2 mt-0.5">{r.body}</p>
          </div>
        </div>
      ))}
      <p className="text-[12px] text-v2-muted px-1 pt-1">נקודות XP ורמות לא נספרות בדירוג הליגה.</p>
    </div>
  );
}


// ── How scope points work (neighborhoods / cities / settlements, home v2) ────

/**
 * Copy verified against the code, 17.10.2026 (the server aggregates —
 * functions/src/lib/league-scope-stats.ts, apply-league-stats.ts,
 * apply-referral-bonus.ts — and league-board-logic.ts rankByMeasure):
 *  - workouts: creditOf = whole minutes (duration seconds ÷ 60, rounded) ×
 *    CREDIT_MULTIPLIER (strength / hybrid 2, cardio — running, walking,
 *    cycling — 1, recovery / maintenance 1).
 *  - steps: stepsCreditOf = floor(daily steps ÷ 1,000) × 3, its own 'steps'
 *    bucket, rolled up hourly (leagueStepsRollup) for today and yesterday.
 *  - invite: +50 (REFERRAL_BONUS) to the REFERRER's city and neighborhood
 *    for the week and the month, once per invitee, at most 5
 *    (MAX_BONUSES_PER_WEEK) per referrer per week; not an active member.
 *  - order: per active member (totalScore ÷ activeMemberCount) is the
 *    official order; week = from Sunday, month = calendar, Asia/Jerusalem.
 */
export function ScopePointsContent() {
  const rows: HowRow[] = [
    {
      icon: Dumbbell,
      tone: 'accent',
      title: 'אימונים',
      body: 'כל דקת אימון כוח שווה 2 נקודות. כל דקת ריצה, הליכה, רכיבה או אימון תחזוקה שווה נקודה אחת.',
    },
    {
      icon: Footprints,
      tone: 'steps',
      title: 'צעדים',
      body: 'כל 1,000 צעדים מלאים ביום שווים 3 נקודות (למשל 7,800 צעדים = 21 נקודות). הצעדים מתעדכנים פעם בשעה.',
    },
    {
      icon: UserPlus,
      tone: 'gold',
      title: 'חבר שמצטרף — 50+',
      body: 'חבר שמצטרף דרך הקישור שלך מוסיף 50 נקודות לשכונה ולעיר שלך, עד 5 חברים בשבוע. הוא לא נספר כמשתתף פעיל עד שיתאמן.',
    },
    {
      icon: Scale,
      tone: 'run',
      title: 'איך מדרגים',
      body: 'הדירוג הרשמי הוא לפי ממוצע הנקודות למשתתף פעיל — כך גם שכונה או יישוב קטנים יכולים לנצח. השבוע מתחיל ביום ראשון, והחודש הוא החודש הקלנדרי.',
    },
  ];
  return (
    <div className="space-y-2.5 pt-1">
      {rows.map((r) => (
        <div key={r.title} className="flex items-start gap-3 rounded-v2-tile bg-v2-surface ring-1 ring-inset ring-v2-hairline p-3.5">
          <IconTile icon={r.icon} tone={r.tone} size="sm" />
          <div className="min-w-0">
            <div className="text-[15px] font-black text-v2-ink">{r.title}</div>
            <p className="text-[13px] leading-relaxed text-v2-ink-2 mt-0.5">{r.body}</p>
          </div>
        </div>
      ))}
      <p className="text-[12px] text-v2-muted px-1 pt-1">נקודות XP ורמות לא נספרות בדירוג הליגה.</p>
    </div>
  );
}
