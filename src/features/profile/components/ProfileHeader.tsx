'use client';

/**
 * ProfileHeader — shared flat IG-style header ("public profile" slice 1
 * extraction). Pulled out of DashboardTab's BLOCK 1 markup so the public
 * profile page can render the exact same avatar/stat-row/name/bio/tags
 * building blocks for ANOTHER user, instead of a second, duplicated
 * implementation. DashboardTab itself is refactored to call this with its
 * own data — see its own call site for the "self" shape (3 stats incl. a
 * streak corner badge, XP role line, edit-profile action).
 *
 * Deliberately generic on two axes the two callers differ on:
 *   - `stats` is an array (self passes 3, public passes 2 — see that
 *     page's own comment on why a streak-equivalent stat doesn't exist
 *     for another user: never mirrored to userPublic).
 *   - `roleLine`/`cornerBadge`/`actions` are optional slots — self fills
 *     all three (XP role line, streak flame, edit button), public fills
 *     none of the first two and passes follow/message buttons as actions.
 */

import React from 'react';
import { IS_XP_ENABLED } from '@/config/feature-flags';
import { TRAINING_TAG_OPTIONS } from '@/features/profile/hooks/usePersonalInfoEditor';
import { avatarBackground, firstGrapheme } from '@/features/profile/utils/avatar';

/** Same asset DashboardTab used inline — single source now. */
const LEMUR_IMG = '/assets/lemur/king-lemur.png';

export interface ProfileHeaderStat {
  key: string;
  value: React.ReactNode;
  label: string;
  onClick?: () => void;
}

export interface ProfileHeaderProps {
  photoURL: string | null;
  /** Used both as the alt text and as the initials-fallback seed. */
  name: string | null;
  /** Small badge anchored to the avatar's bottom-right corner (self's
   * streak flame). Omit entirely when there's no equivalent data. */
  cornerBadge?: React.ReactNode;
  stats: ProfileHeaderStat[];
  bio: string | null;
  bioPlaceholder: string;
  /** Role/level line shown under the name, above the bio (self's
   * IS_XP_ENABLED-gated levelName). Omit when not applicable. */
  roleLine?: React.ReactNode;
  /** Raw trainingTags ids — resolved via TRAINING_TAG_OPTIONS here so
   * both callers share one lookup instead of two. */
  tagIds: string[];
  /** Rendered directly under the tags — self's "עריכת פרופיל" button,
   * public's follow/message buttons. */
  actions?: React.ReactNode;
}

export default function ProfileHeader({
  photoURL,
  name,
  cornerBadge,
  stats,
  bio,
  bioPlaceholder,
  roleLine,
  tagIds,
  actions,
}: ProfileHeaderProps) {
  return (
    <div dir="rtl">
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: 84, height: 84 }}>
          <div className="w-full h-full rounded-full p-[3px] bg-gradient-to-br from-[#00ADEF] to-[#5BC2F2] shadow-md">
            <div className="w-full h-full rounded-full overflow-hidden bg-white">
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoURL}
                  alt={name || 'תמונת פרופיל'}
                  width={84}
                  height={84}
                  className="w-full h-full object-cover"
                />
              ) : IS_XP_ENABLED ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={LEMUR_IMG}
                  alt="Lemur"
                  width={84}
                  height={84}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-black text-2xl"
                  style={{ background: avatarBackground(name) }}
                >
                  {firstGrapheme(name)}
                </div>
              )}
            </div>
          </div>
          {cornerBadge && (
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100 flex items-center gap-0.5">
              {cornerBadge}
            </div>
          )}
        </div>

        <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map((stat) => (
            <button
              key={stat.key}
              type="button"
              onClick={stat.onClick}
              disabled={!stat.onClick}
              className="flex flex-col items-center active:scale-95 transition-transform disabled:cursor-default"
            >
              <span className="text-lg font-black text-gray-900 leading-none tabular-nums">
                {stat.value}
              </span>
              <span className="text-[10px] font-bold text-gray-500 mt-1">{stat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {name && <p className="text-base font-bold text-gray-900">{name}</p>}
        {roleLine}
        <p className="text-sm font-medium text-gray-400 mt-1 leading-relaxed">
          {bio?.trim() || bioPlaceholder}
        </p>

        {tagIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tagIds.map((tagId) => {
              const tag = TRAINING_TAG_OPTIONS.find((t) => t.id === tagId);
              return (
                <span
                  key={tagId}
                  className="text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1"
                >
                  {tag?.label ?? tagId}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {actions}
    </div>
  );
}
