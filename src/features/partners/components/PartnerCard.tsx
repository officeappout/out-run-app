'use client';

/**
 * PartnerCard — single card surface for the Partner Finder UI.
 *
 * Visual styling is copied 1:1 from `HeroWorkoutCard` (home-screen
 * workout carousel cards):
 *   - Card chrome: borderRadius 14.06, border `1.17px solid #E0E9FF`,
 *     boxShadow `0 8px 30px rgba(15,23,42,0.18)`, group hover scale.
 *   - Photo background: `absolute inset-0 w-full h-full object-cover`
 *     with the same group-hover zoom transition.
 *   - Gradient: `linear-gradient(to bottom, rgba(255,255,255,0) 30%,
 *     rgba(255,255,255,1) 70%)` (light) + dark twin.
 *   - Content layer: `absolute inset-0 z-10 flex flex-col justify-end
 *     items-center px-4 pb-4`, title `font-semibold text-gray-800`.
 *   - CTA pill: `text-black font-semibold rounded-full shadow-md
 *     shadow-cyan-400/25`, gradient `linear-gradient(135deg,
 *     #00BAF7 0%, #0CF2E3 100%)` for DM. Group join keeps the existing
 *     orange (#EF9F27) so the secondary action stays visually distinct.
 *
 * Three modes:
 *   - 'live'      → person currently working out (LivePartner data)
 *   - 'scheduled' → person with an upcoming planned session (ScheduledPartner)
 *   - 'group'     → community group / event aggregate
 *
 * Card composition:
 *   ┌─────────────────────────────────┐
 *   │  [stage]            [time/live] │  ← floats above gradient
 *   │       (photo background)         │
 *   │ ─ ─ ─ ─ ─ gradient ─ ─ ─ ─ ─ ─  │
 *   │  קל | 30 דקות         [N ק״מ]  │  ← metadata row
 *   │  Name                            │  ← title (bold, large)
 *   │  💪 program · רמה 5              │  ← activity line
 *   │  🔥 12 ימים רצף                  │  ← streak (only when > 0)
 *   │  [        בואו נתאמן        ]    │  ← CTA pill (gradient)
 *   └─────────────────────────────────┘
 *
 * Performance contract:
 *   - NO Firestore reads inside this component. All data is pre-resolved
 *     by usePartnerData / presence-write time enrichment.
 *   - Mock pace is computed at presence-write time (useWorkoutPresence),
 *     never derived here.
 *   - currentUser identity is read via `useUserStore.getState()` inside
 *     the chat handler — same pattern as UserProfileSheet.
 */

import React, { useState } from 'react';
import { resolvePersonaImage } from '@/features/parks/core/hooks/useGroupPresence';
import { getStageTitle } from '@/features/user/progression/config/stage-titles';
import { useUserStore } from '@/features/user';
import { useChatStore } from '@/features/social/store/useChatStore';

export type PartnerCardActivity = 'strength' | 'running' | 'walking' | 'cycling';

export interface PartnerCardProps {
  type: 'live' | 'scheduled' | 'group';
  uid: string;
  name: string;
  photoURL?: string | null;
  personaId?: string | null;
  lemurStage?: number;
  currentStreak?: number;
  activityStatus?: PartnerCardActivity;
  workoutTitle?: string;
  programName?: string;
  programLevel?: number;
  mockPace?: string;
  distanceKm: number;
  startTime?: Date;
  /**
   * End of an arrival window (`'scheduled'` cards only). When set
   * alongside `startTime`, the top-end pill renders the range
   * "17:00 - 19:00" instead of a single "17:00". Sourced from
   * `planned_sessions.endTime` via `usePartnerData`.
   */
  endTime?: Date;
  /**
   * Where this scheduled session takes place — park name when the
   * publisher tapped "אני מגיע ב…" on a park, route name when they
   * announced from RouteDetailSheet. Rendered as a 📍 line under the
   * program info on `'scheduled'` cards. `null`/empty hides the row.
   */
  locationLabel?: string;
  memberCount?: number;
  groupName?: string;
  /**
   * When true, this card represents the CURRENT user's own planned
   * arrival (sourced from `usePartnerData`'s `'ownArrival'` branch).
   * The card swaps its top-start pill from the lemur stage label to
   * an emerald "הגעה שלי" badge so the user can immediately see
   * "yes, my publish is live" without confusing it with another
   * partner. Action buttons (DM / join) are also suppressed by the
   * caller for own-arrival cards.
   */
  isSelf?: boolean;
  onConnect?: () => void;
  onJoin?: () => void;
  onAvatarTap?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(d?: Date): string {
  if (!d || isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} מ׳`;
  return `${km.toFixed(km < 10 ? 1 : 0)} ק״מ`;
}

interface ActivityLine {
  emoji: string;
  text: string;
}

/**
 * Resolve the activity line shown below the partner's name.
 *
 * Priority order matches the spec — most-specific-wins. The strength
 * branch deliberately does NOT include the program name here even when
 * one is set; that data is rendered as a dedicated "🎯 program · רמה N"
 * row below this line so it stays visible for every card type
 * (running / walking / idle), not only strength. Putting the program
 * info in BOTH places would have created an awkward duplicate when
 * a partner's active workout is strength + their selected program is
 * the same as the one written into presence.
 */
function resolveActivityLine(
  activity: PartnerCardActivity | undefined,
  mockPace: string | undefined,
  lemurStage: number | undefined,
): ActivityLine {
  if (activity === 'strength') {
    return { emoji: '💪', text: 'כוח' };
  }

  if (activity === 'running') {
    return mockPace
      ? { emoji: '🏃', text: `ריצה · ${mockPace} לק״מ` }
      : { emoji: '🏃', text: 'ריצה' };
  }

  if (activity === 'walking') {
    return mockPace
      ? { emoji: '🚶', text: `הליכה · ${mockPace} לק״מ` }
      : { emoji: '🚶', text: 'הליכה' };
  }

  if (activity === 'cycling') {
    return { emoji: '🚴', text: 'רכיבה' };
  }

  return { emoji: '⭐', text: getStageTitle(lemurStage) };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PartnerCard({
  type,
  uid,
  name,
  photoURL,
  personaId,
  lemurStage,
  currentStreak,
  activityStatus,
  workoutTitle,
  programName,
  programLevel,
  mockPace,
  distanceKm,
  startTime,
  endTime,
  locationLabel,
  memberCount,
  groupName,
  isSelf = false,
  onConnect,
  onJoin,
  onAvatarTap,
}: PartnerCardProps) {
  const avatarSrc = photoURL || resolvePersonaImage(personaId);
  const activity = resolveActivityLine(activityStatus, mockPace, lemurStage);

  // Top-start chip — shows program + level when available; hidden otherwise.
  // We intentionally omit the generic lemur-stage title ("מתחיל", "שוחר")
  // because it conveys no actionable information to the partner-finding user.
  const topStartChip: string | null = (() => {
    const n = programName?.trim();
    if (!n) return null;
    return programLevel != null ? `${n} · רמה ${programLevel}` : n;
  })();

  // Local loading gate — prevents double-taps and gives instant visual
  // feedback while the Firestore getOrCreateChat round-trip completes.
  const [isConnecting, setIsConnecting] = useState(false);

  // Internal chat handler — STRICTLY uses the app's own ChatInbox bottom
  // sheet. No external links (WhatsApp etc.) are ever opened from here.
  //
  // Data pipeline:
  //   1. `getOrCreateChat(myUid, theirUid)` checks the `chats` collection
  //      for a document whose `participants` array contains both UIDs.
  //      The deterministic DM id ([uid1,uid2].sort().join('_')) means the
  //      lookup is an O(1) Firestore `getDoc`, not a query scan.
  //   2. If the doc exists  → returns the existing ChatThread instantly.
  //   3. If it doesn't exist → `setDoc` provisions a clean chat doc with
  //      both UIDs as participants, then returns the new thread.
  //   4. `useChatStore.openDM` sets `activeThread` and flips `isOpen:true`,
  //      which causes `ChatInbox` (mounted in ClientLayout) to open the
  //      thread directly — no intermediate inbox list view.
  //
  // Works identically on iOS WKWebView, Android WebView, and desktop Chrome
  // because it's pure Firestore SDK calls — no native bridge, no push
  // notification permissions, no camera, no microphone.
  const handleConnect = async () => {
    if (isConnecting) return;
    if (onConnect) {
      onConnect();
      return;
    }
    const profile = useUserStore.getState().profile;
    if (!profile?.id) return;
    setIsConnecting(true);
    try {
      await useChatStore.getState().openDM(
        profile.id,
        profile.core?.name ?? 'אווטיר',
        uid,
        name,
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoin = () => {
    onJoin?.();
  };

  const isGroup = type === 'group';
  const titleText = isGroup && groupName ? groupName : name;
  const activityLabel = type === 'live' && workoutTitle ? workoutTitle : activity.text;

  // Top-end pill content (live indicator / scheduled time / member count).
  // Returns `null` when the variant doesn't have a value to surface.
  const topEndPill = (() => {
    if (type === 'live') {
      return (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 shadow-sm">
          <span className="block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] font-black text-white">לייב</span>
        </div>
      );
    }
    if (type === 'scheduled' && startTime) {
      // Show the full arrival window when the publisher picked a
      // range ("17:00 - 19:00"). Falls back to a single time for
      // legacy docs where `endTime` is missing or somehow ended up
      // ≤ startTime — the consumer of this component doesn't have
      // to inspect the data shape, the pill always renders something
      // sane.
      const startLabel = formatTime(startTime);
      const endLabel =
        endTime && !isNaN(endTime.getTime()) && endTime.getTime() > startTime.getTime()
          ? formatTime(endTime)
          : '';
      const label = endLabel ? `${startLabel} - ${endLabel}` : startLabel;
      return (
        <div className="px-2.5 py-1 rounded-full bg-white/95 shadow-sm backdrop-blur-sm">
          <span className="text-[11px] font-black text-gray-800" dir="ltr">
            {label}
          </span>
        </div>
      );
    }
    if (type === 'group' && memberCount != null) {
      return (
        <div className="px-2.5 py-1 rounded-full bg-white/95 shadow-sm backdrop-blur-sm">
          <span className="text-[11px] font-black text-gray-800">
            {memberCount} משתתפים
          </span>
        </div>
      );
    }
    return null;
  })();

  return (
    <div
      dir="rtl"
      className="relative overflow-hidden group cursor-pointer mx-auto transition-transform active:scale-[0.98]"
      style={{
        width: '100%',
        height: 330,
        borderRadius: 14.06,
        border: '1.17px solid #E0E9FF',
        boxShadow: '0 8px 30px rgba(15,23,42,0.18)',
      }}
    >
      {/* 1. Photo background — copied from HeroMediaBackground */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = resolvePersonaImage(null);
          }}
        />
      </div>

      {/* 1b. Avatar tap region — covers the photo (top 55%) only, so taps
          on the bottom content area don't accidentally open the profile. */}
      {onAvatarTap && (
        <button
          type="button"
          onClick={onAvatarTap}
          aria-label={`פתח פרופיל של ${name}`}
          className="absolute top-0 inset-x-0 z-[6] cursor-pointer"
          style={{ height: '55%' }}
        />
      )}

      {/* 2. Top-start: program chip — floats above gradient.
          Shows "ProgramName · רמה N" when presence doc carries both
          programName and programLevel. Hidden when no program data
          exists — empty is better than a misleading generic stage title.
          When `isSelf` is true a prominent emerald "הגעה שלי" pill is
          stacked above the program chip. */}
      {(isSelf || topStartChip) && (
        <div className="absolute top-2 start-2 z-20 flex flex-col items-start gap-1">
          {isSelf && (
            <div className="px-2.5 py-1 rounded-full bg-emerald-500 shadow-sm">
              <span className="text-[11px] font-black text-white">הגעה שלי</span>
            </div>
          )}
          {topStartChip && (
            <div className="px-2.5 py-1 rounded-full bg-white/95 shadow-sm backdrop-blur-sm">
              <span className="text-[11px] font-black text-gray-800">{topStartChip}</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Top-end: live / time / members */}
      {topEndPill && <div className="absolute top-2 end-2 z-20">{topEndPill}</div>}

      {/* 4. Figma gradient: transparent@30% → solid white@70%, top-to-bottom */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none dark:hidden"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0) 30%, rgba(255,255,255,1) 70%)',
        }}
      />
      <div
        className="absolute inset-0 z-[5] pointer-events-none hidden dark:block"
        style={{
          background: 'linear-gradient(to bottom, rgba(3,7,18,0) 30%, rgba(3,7,18,1) 70%)',
        }}
      />

      {/* 5. Content layer — bottom-anchored, identical layout to HeroWorkoutCard */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end items-center px-4 pb-4" dir="rtl">

        {/* 5a. Metadata row — distance + streak */}
        <div className="w-full mb-1 flex items-center justify-between gap-2 text-[13px] font-normal" style={{ color: '#374151' }}>
          <span className="font-bold">{formatDistance(distanceKm)}</span>
          {currentStreak != null && currentStreak > 0 && (
            <span className="flex items-center gap-1 text-orange-600 font-bold">
              <span aria-hidden className="text-sm leading-none">🔥</span>
              <span>{currentStreak} ימים רצף</span>
            </span>
          )}
        </div>

        {/* 5b. Title row */}
        <div className="flex items-center gap-2 w-full mb-1">
          <h4
            className="font-semibold text-gray-800 dark:text-white leading-snug truncate"
            style={{ fontSize: 16 }}
          >
            {titleText}
          </h4>
        </div>

        {/* 5c. Activity line — small accent under title */}
        <div className="w-full mb-1 flex items-center gap-1.5 text-[13px] text-gray-700 dark:text-gray-300">
          <span aria-hidden className="text-base leading-none">{activity.emoji}</span>
          <span className="font-bold truncate">{activityLabel}</span>
        </div>


        {/* 5c.3. Location line — rendered for scheduled cards only. Shows
            the park name when the session is a park arrival, or the
            route name when it's a route arrival. The 📍 emoji
            intentionally differs from 🎯/💪 above so the user can read
            "WHERE" the partner will train at a glance, alongside the
            "WHAT" / program info. Group cards already surface their
            session label as the title; live cards have no fixed
            location, so this row stays hidden for both. */}
        {type === 'scheduled' && locationLabel && locationLabel.trim().length > 0 && (
          <div className="w-full mb-2 flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-400">
            <span aria-hidden className="text-sm leading-none">📍</span>
            <span className="font-bold truncate">{locationLabel}</span>
          </div>
        )}

        {/* 5d. CTA pill — copied from HeroWorkoutCard's pill geometry */}
        {isGroup ? (
          <button
            type="button"
            onClick={handleJoin}
            className="text-white font-semibold rounded-full shadow-md shadow-orange-400/25 flex items-center justify-center active:scale-[0.97] transition-transform"
            style={{
              width: '100%',
              maxWidth: 268,
              height: 32,
              fontSize: 14,
              backgroundColor: '#EF9F27',
            }}
          >
            הצטרף
          </button>
        ) : (
          // "פתח צ'אט" — opens the INTERNAL ChatInbox; never routes to
          // WhatsApp or any external messaging platform.
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="text-black font-semibold rounded-full shadow-md shadow-cyan-400/25 flex items-center justify-center active:scale-[0.97] transition-all"
            style={{
              width: '100%',
              maxWidth: 268,
              height: 32,
              fontSize: 14,
              background: isConnecting
                ? 'rgba(0,186,247,0.45)'
                : 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)',
              opacity: isConnecting ? 0.8 : 1,
            }}
          >
            {isConnecting ? 'מתחבר...' : "פתח צ'אט"}
          </button>
        )}
      </div>
    </div>
  );
}

export default PartnerCard;
