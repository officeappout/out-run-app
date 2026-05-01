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

import React from 'react';
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
  memberCount?: number;
  groupName?: string;
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
 * Priority order matches the spec — most-specific-wins.
 */
function resolveActivityLine(
  activity: PartnerCardActivity | undefined,
  programName: string | undefined,
  programLevel: number | undefined,
  mockPace: string | undefined,
  lemurStage: number | undefined,
): ActivityLine {
  if (activity === 'strength') {
    if (programName) {
      const levelSuffix = programLevel != null ? ` · רמה ${programLevel}` : '';
      return { emoji: '💪', text: `${programName}${levelSuffix}` };
    }
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
  memberCount,
  groupName,
  onConnect,
  onJoin,
  onAvatarTap,
}: PartnerCardProps) {
  const stageLabel = getStageTitle(lemurStage);
  const avatarSrc = photoURL || resolvePersonaImage(personaId);
  const activity = resolveActivityLine(activityStatus, programName, programLevel, mockPace, lemurStage);

  const handleConnect = () => {
    if (onConnect) {
      onConnect();
      return;
    }
    const profile = useUserStore.getState().profile;
    if (!profile?.id) return;
    void useChatStore.getState().openDM(
      profile.id,
      profile.core?.name ?? 'אווטיר',
      uid,
      name,
    );
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
      return (
        <div className="px-2.5 py-1 rounded-full bg-white/95 shadow-sm backdrop-blur-sm">
          <span className="text-[11px] font-black text-gray-800" dir="ltr">
            {formatTime(startTime)}
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

      {/* 2. Top-start: stage label — floats above gradient */}
      <div className="absolute top-2 start-2 z-20 px-2.5 py-1 rounded-full bg-white/95 shadow-sm backdrop-blur-sm">
        <span className="text-[11px] font-black text-gray-800">{stageLabel}</span>
      </div>

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
        <div className="flex items-center gap-2 w-full mb-2">
          <h4
            className="font-semibold text-gray-800 dark:text-white leading-snug truncate"
            style={{ fontSize: 16 }}
          >
            {titleText}
          </h4>
        </div>

        {/* 5c. Activity line — small accent under title */}
        <div className="w-full mb-2 flex items-center gap-1.5 text-[13px] text-gray-700 dark:text-gray-300">
          <span aria-hidden className="text-base leading-none">{activity.emoji}</span>
          <span className="font-bold truncate">{activityLabel}</span>
        </div>

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
          <button
            type="button"
            onClick={handleConnect}
            className="text-black font-semibold rounded-full shadow-md shadow-cyan-400/25 flex items-center justify-center active:scale-[0.97] transition-transform"
            style={{
              width: '100%',
              maxWidth: 268,
              height: 32,
              fontSize: 14,
              background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)',
            }}
          >
            בואו נתאמן
          </button>
        )}
      </div>
    </div>
  );
}

export default PartnerCard;
