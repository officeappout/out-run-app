'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Clock, CheckCircle2, Loader2, X,
  CalendarDays, Trophy, Zap, Bug,
} from 'lucide-react';
import { bookSession } from '@/features/arena/services/booking.service';
import { setMyAttendeeStatus } from '@/features/arena/services/session-phase.service';
import { useSmartMessage } from '@/features/messages';
import { useUserStore } from '@/features/user';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { LiveSessionPhase } from '@/types/community.types';

// ── constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const ALL_PHASES: LiveSessionPhase[] = ['far', 'approaching', 'lobby', 'active', 'ended'];
const PHASE_LABELS: Record<LiveSessionPhase, string> = {
  far: 'רחוק', approaching: 'מתקרב', lobby: 'לובי', active: 'פעיל', ended: 'הסתיים',
};
const IS_DEV = process.env.NODE_ENV === 'development';

// ── types ─────────────────────────────────────────────────────────────────────

interface CommunitySessionBannerProps {
  session: UpcomingSession;
  onDismiss: () => void;
  onOpenGroup?: (groupId: string) => void;
}

// ── sub-components ────────────────────────────────────────────────────────────

/** Stacked avatar row — pattern from GroupDetailsDrawer */
function AvatarRow({
  profiles,
  totalCount,
}: {
  profiles: { name: string; photoURL?: string }[];
  totalCount: number;
}) {
  const visible = profiles.slice(0, 5);
  const overflow = totalCount - visible.length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2 rtl:space-x-reverse">
        {visible.map((a, i) => (
          <div
            key={i}
            className="w-6 h-6 rounded-full border-2 border-white bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0 overflow-hidden"
          >
            {a.photoURL ? (
              <img src={a.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[9px] text-white font-black">{a.name?.[0] ?? '?'}</span>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-300 flex items-center justify-center">
            <span className="text-[9px] text-gray-600 font-black">+{overflow}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Dismiss button — exact position from original banner */
function DismissBtn({
  onDismiss,
  dark = false,
}: {
  onDismiss: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors z-10 ${
        dark ? 'bg-white/20 hover:bg-white/30' : 'bg-gray-200 hover:bg-gray-300'
      }`}
    >
      <X className={`w-3 h-3 ${dark ? 'text-white' : 'text-gray-500'}`} />
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function CommunitySessionBanner({
  session,
  onDismiss,
  onOpenGroup,
}: CommunitySessionBannerProps) {
  const profile = useUserStore((s) => s.profile);
  const uid        = profile?.id ?? '';
  const userName   = profile?.core?.name ?? '';
  const photoURL   = profile?.core?.photoURL ?? null;

  // Booking state (far phase)
  const [booking, setBooking] = useState(false);
  const [booked,  setBooked]  = useState(false);

  // Status update state (approaching → otw, lobby → here)
  const [settingStatus, setSettingStatus] = useState(false);
  const [statusDone, setStatusDone] = useState<'otw' | 'here' | null>(null);

  // Dev-only phase override
  const [devPhase,     setDevPhase]     = useState<LiveSessionPhase | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(false);

  const effectivePhase: LiveSessionPhase = devPhase ?? session.phase;

  // ── dual-source copy ───────────────────────────────────────────────────────
  // far / approaching / ended → smart_messages; lobby / active → live attendance
  const communityMsg = useSmartMessage('community_session');

  // ── attendance data (lobby / active) ──────────────────────────────────────
  const attendance      = session.attendance;
  const attendeeProfs   = Object.values(attendance?.attendeeProfiles ?? {});
  const attendeeCount   = attendance?.currentCount ?? 0;
  const maxCount        = attendance?.maxParticipants ?? session.slot.maxParticipants;
  const activeCount     = attendance?.collectiveProgress?.activeCount ?? attendeeCount;
  const totalXP         = attendance?.collectiveProgress?.totalXP;

  // ── time helpers ───────────────────────────────────────────────────────────
  const mins       = Math.round(session.minutesUntil);
  const dayLabel   = DAY_LABELS[new Date(`${session.date}T12:00:00`).getDay()];
  const dateLabel  = session.isToday ? 'היום' : session.isTomorrow ? 'מחר' : `יום ${dayLabel}`;
  const timeLabel  = `${dateLabel} · ${session.time}`;
  const countdown  =
    mins >= 60  ? `עוד ~${Math.round(mins / 60)} שע'` :
    mins > 0    ? `עוד ${mins} דק'` :
    mins > -60  ? `החל לפני ${Math.abs(mins)} דק'` : null;
  const price = session.slot.price;

  // ── action handlers ────────────────────────────────────────────────────────

  const handleBook = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!uid || booking) return;
    setBooking(true);
    try {
      await bookSession(
        session.groupId, session.date, session.time,
        uid, userName, photoURL, session.slot.maxParticipants,
      );
      setBooked(true);
      setTimeout(() => setBooked(false), 2_000);
    } catch (err) {
      console.error('[CommunitySessionBanner] bookSession:', err);
    } finally {
      setBooking(false);
    }
  };

  const handleStatus = async (status: 'otw' | 'here') => {
    if (!uid || settingStatus) return;
    setSettingStatus(true);
    try {
      await setMyAttendeeStatus(uid, session.groupId, session.date, session.time, status);
      setStatusDone(status);
      if (status === 'otw') setTimeout(() => setStatusDone(null), 2_000);
    } catch (err) {
      console.error('[CommunitySessionBanner] setStatus:', err);
      setStatusDone(null);
    } finally {
      setSettingStatus(false);
    }
  };

  const openGroup = () => onOpenGroup?.(session.groupId);

  // ── phase renders ──────────────────────────────────────────────────────────

  /** FAR — compact horizontal, white/quiet. Same footprint as original banner. */
  function renderFar() {
    return (
      <div
        className="relative flex items-center gap-3 px-4 py-3 rounded-2xl border bg-white border-gray-100"
        onClick={openGroup}
        style={{ cursor: onOpenGroup ? 'pointer' : 'default' }}
      >
        <DismissBtn onDismiss={onDismiss} />

        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <CalendarDays className="w-5 h-5 text-gray-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-gray-900 truncate">{session.groupName}</p>
          <p className="text-[11px] text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
            {timeLabel}
            {price ? <span className="text-amber-600 font-bold">· ₪{price}</span> : null}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {countdown && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">
              {countdown}
            </span>
          )}
          <AnimatePresence mode="wait">
            {booked ? (
              <motion.div
                key="booked"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[11px] font-black"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> אושר!
              </motion.div>
            ) : (
              <motion.button
                key="book"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={handleBook}
                disabled={booking}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-black transition-all active:scale-95 disabled:opacity-60 shadow-sm"
              >
                {booking
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : session.isToday ? 'אשר הגעה' : 'הירשם'}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  /** APPROACHING — cyan card, countdown badge, "✋ אני בדרך" CTA */
  function renderApproaching() {
    return (
      <div
        className="relative flex flex-col gap-2.5 px-4 py-3 rounded-2xl border"
        style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDFA 100%)', borderColor: '#99F6E4' }}
      >
        <DismissBtn onDismiss={onDismiss} />

        <div
          className="flex items-center gap-3"
          onClick={openGroup}
          style={{ cursor: onOpenGroup ? 'pointer' : 'default' }}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-gray-900 truncate">{session.groupName}</p>
            <p className="text-[11px] text-gray-600 truncate">
              {communityMsg.subText || communityMsg.text || 'מפגש קהילתי בקרוב'}
            </p>
          </div>
          {countdown && (
            <span className="px-2.5 py-1 rounded-full bg-teal-100 text-teal-700 text-[11px] font-black flex-shrink-0">
              {countdown}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {statusDone === 'otw' ? (
            <motion.div
              key="otw-done"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-black"
            >
              <CheckCircle2 className="w-4 h-4" /> בדרך!
            </motion.div>
          ) : (
            <motion.button
              key="otw-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => handleStatus('otw')}
              disabled={settingStatus}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 text-white text-[13px] font-black transition-all active:scale-[0.97] disabled:opacity-60 shadow-sm shadow-teal-500/30"
            >
              {settingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : '✋ אני בדרך'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /** LOBBY — green card, live avatar row, "הצטרפי ללובי" CTA */
  function renderLobby() {
    const countLabel = maxCount
      ? `${attendeeCount}/${maxCount} הגיעו`
      : attendeeCount > 0 ? `${attendeeCount} הגיעו` : null;

    return (
      <div
        className="relative flex flex-col gap-2.5 px-4 py-3 rounded-2xl border"
        style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', borderColor: '#86EFAC' }}
      >
        <DismissBtn onDismiss={onDismiss} />

        {/* Header */}
        <div
          className="flex items-center gap-3"
          onClick={openGroup}
          style={{ cursor: onOpenGroup ? 'pointer' : 'default' }}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-gray-900 truncate">{session.groupName}</p>
            <p className="text-[11px] text-emerald-700 font-bold">
              {countdown ?? 'המפגש החל'}
            </p>
          </div>
          {price ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black flex-shrink-0">
              ₪{price}
            </span>
          ) : null}
        </div>

        {/* Avatar row */}
        {attendeeProfs.length > 0 && countLabel && (
          <div className="flex items-center gap-2">
            <AvatarRow profiles={attendeeProfs} totalCount={attendeeCount} />
            <span className="text-[11px] text-emerald-700 font-bold">{countLabel}</span>
          </div>
        )}

        {/* CTA */}
        <AnimatePresence mode="wait">
          {statusDone === 'here' ? (
            <motion.div
              key="here-done"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-black"
            >
              <CheckCircle2 className="w-4 h-4" /> אני כאן!
            </motion.div>
          ) : (
            <motion.button
              key="here-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => handleStatus('here')}
              disabled={settingStatus}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-black transition-all active:scale-[0.97] disabled:opacity-60 shadow-sm shadow-emerald-500/30"
            >
              {settingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הצטרפי ללובי'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /** ACTIVE — dark green card, live dot, progress bar, "הצטרפי לאימון" */
  function renderActive() {
    const fillPct = maxCount && activeCount
      ? Math.min(100, (activeCount / maxCount) * 100)
      : 0;

    return (
      <div
        className="relative flex flex-col gap-2.5 px-4 py-3 rounded-2xl border"
        style={{ background: 'linear-gradient(135deg, #14532D 0%, #166534 100%)', borderColor: '#15803D' }}
      >
        <DismissBtn onDismiss={onDismiss} dark />

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-white truncate">{session.groupName}</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <p className="text-[11px] text-green-300 font-bold">
                פעיל{activeCount > 0 ? ` · ${activeCount} כאן` : ''}
              </p>
            </div>
          </div>
          {totalXP ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 flex-shrink-0">
              <Zap className="w-3 h-3 text-yellow-300" />
              <span className="text-[10px] text-white font-black">+{totalXP}</span>
            </div>
          ) : null}
        </div>

        {/* Collective progress bar */}
        {maxCount && maxCount > 0 ? (
          <div className="space-y-1">
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/70 rounded-full transition-all duration-500"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <p className="text-[10px] text-white/50 text-start">
              {activeCount} / {maxCount} משתתפות
            </p>
          </div>
        ) : null}

        {/* CTA */}
        <button
          onClick={openGroup}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-green-800 text-[13px] font-black transition-all active:scale-[0.97]"
        >
          <Zap className="w-4 h-4 text-green-600" />
          הצטרפי לאימון
        </button>
      </div>
    );
  }

  /** ENDED — amber/yellow, celebration, smart_message copy, "לסיכום" */
  function renderEnded() {
    const celebrationText = communityMsg.text || 'סיימתן!';
    const celebrationSub  = communityMsg.subText;

    return (
      <div
        className="relative flex flex-col gap-2.5 px-4 py-3 rounded-2xl border"
        style={{ background: 'linear-gradient(135deg, #FEFCE8 0%, #FEF9C3 100%)', borderColor: '#FDE047' }}
      >
        <DismissBtn onDismiss={onDismiss} />

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-yellow-400 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-gray-900 truncate">{session.groupName}</p>
            <p className="text-[11px] text-amber-700 font-bold truncate">
              {celebrationText}{totalXP ? ` · +${totalXP} XP` : ''}
            </p>
          </div>
        </div>

        {celebrationSub && (
          <p className="text-[11px] text-gray-500 pr-12 leading-relaxed">{celebrationSub}</p>
        )}

        <button
          onClick={openGroup}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-400 text-white text-[13px] font-black transition-all active:scale-[0.97] shadow-sm shadow-amber-400/30"
        >
          <Trophy className="w-4 h-4" />
          לסיכום
        </button>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl">
      <AnimatePresence mode="wait">
        <motion.div
          key={effectivePhase}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
          transition={{ duration: 0.25 }}
        >
          {effectivePhase === 'far'        && renderFar()}
          {effectivePhase === 'approaching' && renderApproaching()}
          {effectivePhase === 'lobby'       && renderLobby()}
          {effectivePhase === 'active'      && renderActive()}
          {effectivePhase === 'ended'       && renderEnded()}
        </motion.div>
      </AnimatePresence>

      {/* ── Dev phase picker (development only) ─────────────────────────────── */}
      {IS_DEV && (
        <div className="mt-1">
          <button
            onClick={() => setShowDevPanel(v => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-400 text-[10px] font-bold transition-colors"
          >
            <Bug className="w-3 h-3" />
            dev · phase: <span className="text-amber-500">{effectivePhase}</span>
            {devPhase && <span className="text-red-400">(override)</span>}
          </button>

          {showDevPanel && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 p-2 rounded-xl bg-gray-900 border border-gray-700 flex flex-wrap gap-1.5"
            >
              {ALL_PHASES.map(p => (
                <button
                  key={p}
                  onClick={() => setDevPhase(effectivePhase === p && devPhase ? null : p)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-all active:scale-95 ${
                    effectivePhase === p
                      ? 'bg-amber-400 text-gray-900'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {PHASE_LABELS[p]}
                </button>
              ))}
              {devPhase && (
                <button
                  onClick={() => setDevPhase(null)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-900 text-red-300 hover:bg-red-800 transition-colors"
                >
                  ← real
                </button>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
