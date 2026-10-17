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
import { ACTIVITY_SEEN_EVENT, countUnseenActivity, readActivitySeenAt } from '@/features/social/utils/activity-seen';
import { useChatInbox } from '@/features/social/hooks/useChatInbox';
import { isUserVerified } from '@/features/user/identity/services/access-control.service';
import type { ActivityType } from '@/features/activity/types/activity.types';
import { hapticSuccess } from '@/lib/haptics';
import StreakFlame from '@/components/ui/v2/StreakFlame';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

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
  /**
   * Home v2 (enable_home_v2): the streak flame sits ON the avatar (brand Lottie +
   * count) instead of beside it; avatar on a soft tint; chat/search as round
   * white buttons. Same data, same targets — only the right/left zones restyle.
   */
  v2?: boolean;
}

export default function AppHeader({ children, zIndex = 40, asOverlay = false, v2: v2Prop }: AppHeaderProps) {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  // Pages that don't pass `v2` (community, search, progression, map) follow
  // enable_home_v2 themselves — the header used to stay classic there.
  const flagV2 = useFeatureFlags(!!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin).flags.enableHomeV2;
  const v2 = v2Prop ?? flagV2;
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
  const { unreadCount: activityUnreadLegacy, items: activityItems } = useActivityFeed(userId);
  // v2: the dot only for someone else's activity the user hasn't opened yet
  // (the legacy count includes the user's own event-join entries, which can
  // never be marked read — see activity-seen.ts).
  const [activitySeenAt, setActivitySeenAt] = useState(0);
  useEffect(() => {
    const sync = () => setActivitySeenAt(readActivitySeenAt(userId));
    sync();
    window.addEventListener(ACTIVITY_SEEN_EVENT, sync);
    return () => window.removeEventListener(ACTIVITY_SEEN_EVENT, sync);
  }, [userId]);
  const activityUnread = v2
    ? countUnseenActivity(activityItems, userId, activitySeenAt)
    : activityUnreadLegacy;
  const { totalUnread: chatUnread } = useChatInbox(userId);

  // Sheet openers
  const openActivity = useActivityPanelStore((s) => s.open);
  const openChat = useChatStore((s) => s.open);

  // ── Shared inner row — identical markup for both sticky and overlay modes ──
  // py-1 not py-1.5 (chrome polish — header was reported too thick;
  // tightened vertical padding only, icon sizes untouched).
  const innerRow = (
    <div
      className={`max-w-md mx-auto px-4 ${v2 ? 'py-2' : 'py-1'} flex items-center justify-between`}
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
      {v2 ? (
      <div
        role="button"
        tabIndex={0}
        onClick={() => { hapticSuccess(); router.push('/profile'); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { hapticSuccess(); router.push('/profile'); }
        }}
        className="relative active:scale-95 transition-transform cursor-pointer"
        aria-label={streak > 0 ? `פרופיל · ${streak} ימים ברצף` : 'פרופיל'}
      >
        <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-white" style={{ boxShadow: '0 0 0 1px rgba(14,27,42,0.08)' }}>
          {photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoURL} alt={userName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[15px] font-black" style={{ background: '#eef8fc', color: '#0284c7' }}>
              {userName.charAt(0).toUpperCase() || <Users className="w-4 h-4" />}
            </div>
          )}
        </div>
        {verified && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow-sm">
            <BadgeCheck className="w-3 h-3 text-blue-500" fill="currentColor" />
          </span>
        )}
        {activityUnread > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openActivity(); }}
            aria-label={`התראות — ${activityUnread > 99 ? '99+' : activityUnread} חדשות`}
            className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-v2-accent border-2 border-white"
          />
        )}
        {streak > 0 && !activityLoading && (
          <span
            className="absolute -bottom-1.5 -left-2 flex items-center rounded-full bg-white pe-1.5"
            style={{ boxShadow: '0 0 0 1px rgba(14,27,42,0.08)' }}
          >
            <StreakFlame tones={['strength']} size={24} live={activityType !== 'none' && activityType !== 'rest'} />
            <span className="text-[12px] font-black tabular-nums" style={{ color: '#0284c7' }}>{streak}</span>
          </span>
        )}
      </div>
      ) : (
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
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-500 text-on-brand text-xs font-bold">
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
      )}

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
      <div className={`flex items-center ${v2 ? 'gap-1.5' : 'gap-0.5'}`}>
        <button
          type="button"
          onClick={openChat}
          className={v2
            ? 'relative w-10 h-10 grid place-items-center rounded-full bg-white active:scale-95 transition-transform'
            : 'relative p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all'}
          style={v2 ? { boxShadow: '0 0 0 1px rgba(14,27,42,0.08)' } : undefined}
          aria-label="הודעות"
        >
          <MessageCircle className="w-5 h-5 text-gray-600" />
          {chatUnread > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full ${v2 ? 'bg-[#0e1419] text-white' : 'bg-cyan-500 text-on-brand'} text-[9px] font-black flex items-center justify-center px-1 shadow-sm`}>
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          )}
        </button>

        <Link
          href="/search"
          className={v2
            ? 'w-10 h-10 grid place-items-center rounded-full bg-white active:scale-95 transition-transform'
            : 'p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all'}
          style={v2 ? { boxShadow: '0 0 0 1px rgba(14,27,42,0.08)' } : undefined}
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
  // applySafeAreaTop={false} — chrome polish, thick-header/overlap bug fix.
  // Root cause: ClientLayout.tsx's <main> ALREADY applies
  // `paddingTop: env(safe-area-inset-top)` for every route that is neither
  // /map nor on its explicit TOP_PADDING_EXEMPT_EXACT_ROUTES list (which
  // this file's own sticky consumers — /home, /search, bare /profile, bare
  // /community, /progression — all confirmed NOT to be on, and none of the
  // actually-exempt routes render this component at all, confirmed via
  // grep). CollapsingHeader's own `applySafeAreaTop` default (true) was
  // ALSO adding the same inset on top of that — doubling the real safe-area
  // height into a visibly "thick" header, and plausibly the cause of the
  // reported content-clipping too (a `position: sticky` element asserting
  // its own safe-area padding INSIDE an ancestor scroll container that
  // already reserved that exact space is a known source of iOS WebKit
  // sticky-offset glitches). <main>'s own padding is relied on as the
  // single source of truth here instead — matches the asOverlay branch
  // above, which has always had single (not double) safe-area handling,
  // which is why Map's header reads "slim" relative to this one.
  return (
    <CollapsingHeader
      zIndex={zIndex}
      className="bg-white"
      scrolledClassName="border-b border-gray-100 shadow-sm"
      applySafeAreaTop={false}
    >
      {innerRow}
      {/* Page-specific extras (e.g. segmented tabs on /feed) */}
      {children}
    </CollapsingHeader>
  );
}
