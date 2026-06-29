'use client';

/**
 * RunShareBar — unified "share this run" block used in FreeRunDrawer.
 *
 * Now/Later toggle:
 *   עכשיו — immediate invite (live session, broadcast toggle visible)
 *   אחר כך — scheduled future invite: shows date+time picker;
 *             passes scheduledFor to createRunInvite so the API sets
 *             expiresAt = scheduledFor + 2h and writes calendar entries
 *             for host (run-session route) and guest (session-token route).
 *
 * Cleanup: cancelling a scheduled run → call removeCommunityEntriesForGroup
 * (client) or equivalent Admin SDK write for both host and guest.
 */

import { useState } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import ShareAsLiveToggle from './ShareAsLiveToggle';
import { createRunInvite } from '@/lib/workoutInvite';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { auth } from '@/lib/firebase';

interface RunShareBarProps {
  activityType: 'running' | 'walking';
  userLocation: { lat: number; lng: number } | null | undefined;
  /** Optional outer className applied to the root flex column. */
  className?: string;
  // ── Controlled state (lifted to FreeRunDrawer for coordination with EntryButtons) ──
  /** When provided, overrides the internal timing toggle state. */
  timing?: 'now' | 'later';
  onTimingChange?: (v: 'now' | 'later') => void;
  schedDate?: string;
  schedTime?: string;
  onDateChange?: (v: string) => void;
  onTimeChange?: (v: string) => void;
  /**
   * When provided, the "אחר כך" share button calls this instead of createRunInvite.
   * The parent (FreeRunDrawer) owns the commit logic to avoid creating duplicate groups
   * if the user clicks both "שתף" and "שמור".
   */
  onShareScheduled?: () => Promise<void>;
}

const ACCENT = '#0EA5E9';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns 'YYYY-MM-DD' for tomorrow (local time). */
function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Returns 'YYYY-MM-DD' for today (min date for picker). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── NowLaterToggle ────────────────────────────────────────────────────────────

function NowLaterToggle({
  value,
  onChange,
}: {
  value: 'now' | 'later';
  onChange: (v: 'now' | 'later') => void;
}) {
  return (
    <div
      className="flex rounded-full overflow-hidden border"
      style={{ borderColor: '#BAE6FD', height: 36 }}
    >
      {(['now', 'later'] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className="flex-1 flex items-center justify-center text-[13px] font-black transition-colors"
          style={{
            backgroundColor: value === opt ? ACCENT : '#F0F9FF',
            color:           value === opt ? '#fff' : ACCENT,
          }}
        >
          {opt === 'now' ? 'עכשיו' : 'אחר כך'}
        </button>
      ))}
    </div>
  );
}

// ── DateTimePicker ─────────────────────────────────────────────────────────────

function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2" dir="ltr">
      <input
        type="date"
        value={date}
        min={todayIso()}
        onChange={(e) => onDateChange(e.target.value)}
        className="flex-1 rounded-xl border text-[13px] font-bold px-3 text-gray-800 focus:outline-none focus:ring-2"
        style={{
          height: 42,
          borderColor: '#BAE6FD',
          backgroundColor: '#F0F9FF',
          color: '#0EA5E9',
        }}
      />
      <input
        type="time"
        value={time}
        onChange={(e) => onTimeChange(e.target.value)}
        className="rounded-xl border text-[13px] font-bold px-3 text-gray-800 focus:outline-none focus:ring-2"
        style={{
          height: 42,
          width: 100,
          borderColor: '#BAE6FD',
          backgroundColor: '#F0F9FF',
          color: '#0EA5E9',
        }}
      />
    </div>
  );
}

// ── RunShareBar ────────────────────────────────────────────────────────────────

export default function RunShareBar({
  activityType,
  userLocation,
  className = '',
  timing: propTiming,
  onTimingChange,
  schedDate: propSchedDate,
  schedTime: propSchedTime,
  onDateChange,
  onTimeChange,
  onShareScheduled,
}: RunShareBarProps) {
  const [busy,           setBusy]          = useState(false);
  const [internalTiming, setInternalTiming] = useState<'now' | 'later'>('now');
  const [internalDate,   setInternalDate]   = useState(defaultDate);
  const [internalTime,   setInternalTime]   = useState('18:00');

  // Controlled-or-internal pattern: parent props take precedence when provided.
  const timing    = propTiming    ?? internalTiming;
  const schedDate = propSchedDate ?? internalDate;
  const schedTime = propSchedTime ?? internalTime;

  const handleTimingChange = (v: 'now' | 'later') => {
    setInternalTiming(v);
    onTimingChange?.(v);
  };
  const handleDateChange = (v: string) => {
    setInternalDate(v);
    onDateChange?.(v);
  };
  const handleTimeChange = (v: string) => {
    setInternalTime(v);
    onTimeChange?.(v);
  };

  const scheduledFor = timing === 'later' ? `${schedDate}T${schedTime}` : undefined;

  const formattedDate = timing === 'later'
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' })
        .format(new Date(`${schedDate}T${schedTime}`))
    : '';

  const handleInvite = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // "אחר כך" with parent-controlled commit: delegate entirely to parent so both
      // "שתף" and "שמור" share the same group token (no duplicate groups created).
      if (timing === 'later' && onShareScheduled) {
        await onShareScheduled();
        return;
      }

      // "עכשיו" (or standalone "later" without parent control).
      const { shareUrl, groupId, attendanceId, isNewGroup } =
        await createRunInvite(activityType, scheduledFor ? { scheduledFor } : undefined);

      if (isNewGroup && timing === 'now') {
        const user     = auth.currentUser;
        const uid      = user?.uid ?? '';
        const name     = user?.displayName ?? 'אני';
        const profiles = uid ? { [uid]: { name } } : {};
        useSharedSession
          .getState()
          .startGroupSession(groupId, attendanceId, uid ? [uid] : [], profiles, '');
        // Host explicitly converted a solo run to a group run via the share bar.
        useRunningPlayer.getState().setIsGroupRun(true);
      }

      const text = timing === 'later'
        ? activityType === 'walking'
          ? `קבעתי הליכה ב-${formattedDate} בשעה ${schedTime} 🚶 בוא/י להצטרף! ${shareUrl}`
          : `קבעתי ריצה ב-${formattedDate} בשעה ${schedTime} 🏃 בוא/י להצטרף! ${shareUrl}`
        : activityType === 'walking'
        ? `בוא/י ללכת איתי עכשיו 🚶 ${shareUrl}`
        : `בוא/י לרוץ איתי עכשיו 🏃 ${shareUrl}`;

      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text }).catch(() => {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch (err) {
      console.error('[RunShareBar] invite failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const workoutTitle =
    activityType === 'walking' ? 'הליכה חופשית' : 'ריצה חופשית';

  return (
    <div className={`flex flex-col gap-3 ${className}`} dir="rtl">
      {/* Row 0 — Now / Later toggle */}
      <NowLaterToggle value={timing} onChange={handleTimingChange} />

      {/* Row 0b — Date+time picker (Later only) */}
      {timing === 'later' && (
        <DateTimePicker
          date={schedDate}
          time={schedTime}
          onDateChange={handleDateChange}
          onTimeChange={handleTimeChange}
        />
      )}

      {/* Row 1 — directed invite / share */}
      <button
        type="button"
        onClick={handleInvite}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-60"
        style={{
          height:          44,
          backgroundColor: '#F0F9FF',
          border:          '1px solid #BAE6FD',
          color:           ACCENT,
        }}
      >
        {busy
          ? <Loader2 size={16} className="animate-spin" />
          : <UserPlus size={16} strokeWidth={2.5} />
        }
        <span className="text-[13px] font-black">
          {busy
            ? 'שותף...'
            : timing === 'later'
            ? 'שתף אימון מתוזמן'
            : 'הזמן חבר לאימון'}
        </span>
      </button>

      {/* Row 2 — broadcast toggle (now only — irrelevant for future scheduled runs) */}
      {timing === 'now' && (
        <ShareAsLiveToggle
          activityType={activityType}
          workoutTitle={workoutTitle}
          userLocation={userLocation}
        />
      )}
    </div>
  );
}
