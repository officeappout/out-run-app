'use client';

/**
 * AppHeader — shared collapsing header used by /home and /feed.
 *
 * Layout (RTL):
 *   - RIGHT zone (visually leftmost in RTL): avatar pill (photo + verified
 *     corner badge + animated flame + streak count). Tapping the pill
 *     navigates to /profile; a small red dot on the avatar itself (shown
 *     only when there's unread activity) independently opens the global
 *     ActivityPanel via useActivityPanelStore — this replaced a standalone
 *     bell icon in the left zone (chrome-polish round).
 *   - CENTER: OUT logotype.
 *   - LEFT zone (visually rightmost in RTL): two icon buttons —
 *       1. Chat  → opens the global ChatInbox via useChatStore
 *       2. Search→ navigates to /search
 *
 * Pages can pass `children` to render page-specific extras (e.g. a segmented
 * tab bar) below the icon row INSIDE the same CollapsingHeader, so the whole
 * header slides together as a single sticky unit.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Search, BadgeCheck, Users } from 'lucide-react';
import CollapsingHeader from '@/components/ui/CollapsingHeader';
import AnimatedFlame from '@/components/ui/AnimatedFlame';
import CommunityCoLogo from '@/components/ui/CommunityCoLogo';
import { useUserStore } from '@/features/user';
import { useDailyActivity } from '@/features/activity';
import { useChatStore } from '@/features/social/store/useChatStore';
import { useActivityPanelStore } from '@/features/social/store/useActivityPanelStore';
import { useActivityFeed } from '@/features/social/hooks/useActivityFeed';
import { useChatInbox } from '@/features/social/hooks/useChatInbox';
import { isUserVerified } from '@/features/user/identity/services/access-control.service';
import type { ActivityType } from '@/features/activity/types/activity.types';
import { hapticSuccess } from '@/lib/haptics';

interface AppHeaderProps {
  /**
   * Optional page-specific content rendered below the icon row, INSIDE the
   * same sticky/collapsing wrapper. Use for things like segmented tab bars
   * that should slide in/out together with the header.
   */
  children?: React.ReactNode;
  /** z-index for the sticky wrapper. Defaults to 40. */
  zIndex?: number;
  /**
   * When true, renders as an `absolute` map overlay instead of the sticky
   * `CollapsingHeader`. Use on full-screen canvas pages (e.g. /map) where
   * there is no scrollable container and the header must float above absolute-
   * positioned children. The glassmorphism styling matches the rest of the
   * map UI.  Defaults to false (= normal sticky behaviour).
   */
  asOverlay?: boolean;
}

export default function AppHeader({ children, zIndex = 40, asOverlay = false }: AppHeaderProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? null;
  const photoURL = profile?.core?.photoURL;
  const userName = profile?.core?.name ?? 'משתמש';
  const verified = isUserVerified(profile);

  const { todayActivity, streak, isLoading: activityLoading } = useDailyActivity();
  const activityType: ActivityType = todayActivity?.activityType ?? 'none';

  // Track activity-type transitions so the flame can animate on level-up.
  const prevActivityRef = useRef<ActivityType>('none');
  const [previousType, setPreviousType] = useState<ActivityType | null>(null);
  useEffect(() => {
    if (activityType !== prevActivityRef.current) {
      setPreviousType(prevActivityRef.current);
      prevActivityRef.current = activityType;
    }
  }, [activityType]);

  // Unread badges
  const { unreadCount: activityUnread } = useActivityFeed(userId);
  const { totalUnread: chatUnread } = useChatInbox(userId);

  // Sheet openers
  const openActivity = useActivityPanelStore((s) => s.open);
  const openChat = useChatStore((s) => s.open);

  // ── Shared inner row — identical markup for both sticky and overlay modes ──
  // py-1 not py-1.5 (chrome polish — header was reported too thick;
  // tightened vertical padding only, icon sizes untouched).
  const innerRow = (
    <div
      className="max-w-md mx-auto px-4 py-1 flex items-center justify-between"
      dir="rtl"
    >
      {/* Right zone (visually leftmost in RTL) — avatar + flame + streak.
          Chrome polish: the bell (notifications) button that used to live
          in the left icon row is gone — its unread badge moved to a small
          dot on the avatar instead, so the function isn't lost, just
          relocated. div role="button" (not <button>) hosting a REAL nested
          <button> for the dot — same pattern used elsewhere in this
          codebase (ProgramProgressCard, SkillMapCard) to avoid invalid
          nested-<button> HTML. Tapping the dot opens notifications
          in-place (stopPropagation so it doesn't also navigate to
          /profile); tapping anywhere else on the avatar still navigates
          to /profile, unchanged. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => { hapticSuccess(); router.push('/profile'); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { hapticSuccess(); router.push('/profile'); }
        }}
        className="flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
        aria-label="פרופיל"
      >
        <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-md">
          {photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoURL}
              alt={userName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-xs font-bold">
              {userName.charAt(0).toUpperCase() || (
                <Users className="w-4 h-4" />
              )}
            </div>
          )}
          {verified && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow-sm">
              <BadgeCheck className="w-3 h-3 text-blue-500" fill="currentColor" />
            </span>
          )}
          {activityUnread > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openActivity(); }}
              aria-label={`התראות${activityUnread > 0 ? ` — ${activityUnread > 99 ? '99+' : activityUnread} חדשות` : ''}`}
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white"
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <AnimatedFlame
            activityType={activityType}
            previousType={previousType}
            size={32}
          />
          {streak > 0 && !activityLoading && (
            <span className="text-xs font-bold text-orange-600 tabular-nums">
              {streak}
            </span>
          )}
        </div>
      </div>

      {/* Center — community co-logo (if any) + OUT logotype ("community × OUT") */}
      <div className="flex items-center gap-2" dir="ltr">
        <CommunityCoLogo />
        <Link href="/home" className="flex items-center" aria-label="OUT">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo/Kind=logotype.svg"
            alt="OUT"
            className="h-7 object-contain select-none"
          />
        </Link>
      </div>

      {/* Left zone (visually rightmost in RTL) — Chat + Search.
          Bell removed per chrome polish: its unread badge now lives as a
          small dot on the avatar (right zone) instead, so the entry point
          isn't lost, just relocated next to the identity it's about. */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={openChat}
          className="relative p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
          aria-label="הודעות"
        >
          <MessageCircle className="w-5 h-5 text-gray-600" />
          {chatUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-cyan-500 text-white text-[9px] font-black flex items-center justify-center px-1 shadow-sm">
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          )}
        </button>

        <Link
          href="/search"
          className="p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
          aria-label="חיפוש"
        >
          <Search className="w-5 h-5 text-gray-600" />
        </Link>
      </div>
    </div>
  );

  // ── Overlay variant — absolute-positioned glass bar for the Map page ──
  // The map canvas uses `overflow-hidden` with no scroll container, so the
  // normal sticky / CollapsingHeader behaviour would be invisible. Instead
  // we render the same inner row inside an `absolute` div that floats above
  // the Mapbox canvas at z-[75], matching the layering budget already
  // established by DiscoverLayer (z-[70]) and NavigationHub (z-[100]).
  if (asOverlay) {
    return (
      <div
        className="absolute left-0 right-0 pointer-events-auto"
        style={{
          top: 0,
          zIndex: zIndex === 40 ? 75 : zIndex,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px) saturate(160%)',
          WebkitBackdropFilter: 'blur(12px) saturate(160%)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {innerRow}
        {children}
      </div>
    );
  }

  // ── Default sticky variant — CollapsingHeader for scrollable pages ──
  //
  // Chrome polish (round — home chrome): was bg-white/90 + backdrop-blur-md,
  // meant to read as frosted glass. Investigated the reported "transparent/
  // detached on scroll" look before touching anything: this header is
  // ALWAYS 90%-opaque (that's not scroll-dependent — it looks faintly
  // see-through at rest too), and backdrop-filter is well known to render
  // unreliably on exactly this combination — an element with an actively
  // Framer-Motion-animated `transform` (CollapsingHeader's hide/show slide)
  // plus `willChange: 'transform'`, which is precisely this header's setup.
  // WebKit/iOS in particular can fail to keep the blur's sampled backdrop
  // in sync with that compositing layer, which reads as exactly the
  // "detached" look reported. Fix: solid background (reliable on every
  // engine, no backdrop-filter dependency) + a border/shadow that only
  // appears once actually scrolled (scrolledClassName, CollapsingHeader's
  // new prop) — rather than the old unconditional border, so the header
  // doesn't look like a hard-edged bar sitting on the page before there's
  // anything to be "above."
  return (
    <CollapsingHeader
      zIndex={zIndex}
      className="bg-white"
      scrolledClassName="border-b border-gray-100 shadow-sm"
    >
      {innerRow}
      {/* Page-specific extras (e.g. segmented tabs on /feed) */}
      {children}
    </CollapsingHeader>
  );
}
