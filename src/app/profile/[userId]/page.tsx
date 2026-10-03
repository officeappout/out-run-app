'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowRight, UserPlus, UserMinus, Flag, MessageCircle, Lock, Flame } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { useChatStore } from '@/features/social/store/useChatStore';
import { getUserPosts, type FeedPost } from '@/features/social/services/feed.service';
import { getMutualPartners } from '@/features/social/services/mutual-partners.service';
import type { UserSearchResult } from '@/features/social/services/user-search.service';
import ReportContentSheet from '@/features/arena/components/ReportContentSheet';
import ProfileHeader from '@/features/profile/components/ProfileHeader';
import PartnersHighlightsRow from '@/features/profile/components/PartnersHighlightsRow';
import PublicActivityGrid from '@/features/profile/components/PublicActivityGrid';
import LinkAccountPrompt from '@/components/LinkAccountPrompt';

/**
 * Public profile — flat (IG-style) redesign, "public profile" slice 1.
 * Was a boxed-card placeholder (avatar, name, goal label, follow/message,
 * "אין פעילות אחרונה") — now built from the same flat building blocks the
 * self-profile (DashboardTab) uses: ProfileHeader, PartnersHighlightsRow,
 * PublicActivityGrid. All data-fetch + follow/message/report logic below
 * is unchanged from before this redesign — only the render changed.
 *
 * currentLevel/mainGoal are deliberately NOT displayed here (investigation
 * finding): `progression.currentLevel` is a per-program skill-level field,
 * a different concept from the self-profile's actual role-line source
 * (globalLevel/levelName via getLevelName) — showing it here would read
 * as an inconsistent "role line" relative to the self-profile's own,
 * currently-empty one (IS_XP_ENABLED=false). mainGoal's label-only value
 * added little on its own once currentLevel was dropped alongside it.
 */

interface PublicProfile {
  name: string;
  photoURL?: string;
  /** Set from users/{uid}.core.ageGroup — used by the DM gate, same as UserProfileSheet.tsx. */
  ageGroup?: 'minor' | 'adult';
  bio?: string;
  trainingTags?: string[];
  /** Header stat row additions. `undefined` means "not mirrored yet" (old
   * userPublicSync version, or the mirror piggybacks on another field and
   * hasn't refreshed since this user's last workout — see
   * userPublicSync.ts's own comment) -- rendered as an omitted stat, NOT
   * as 0, since a real 0 and "unknown" must not look the same. Steps are
   * deliberately never read/displayed anywhere on this page. */
  currentStreak?: number;
  workoutCount?: number;
}

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const targetUid = params.userId as string;

  const myProfile = useUserStore((s) => s.profile);
  const myUid = myProfile?.id;
  const { isFollowing, followUser, unfollowUser, isLoaded, loadConnections } = useSocialStore();

  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 7.2 — report-user sheet state
  const [showReport, setShowReport] = useState(false);

  // Real mutual-follow partners (connections/{targetUid}, readable by any
  // authenticated user — see mutual-partners.service.ts) — independent
  // loading state so the grid above it doesn't wait on this round trip.
  const [partners, setPartners] = useState<UserSearchResult[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);

  // Guest-account UX fix (03.10.2026 investigation): follow and DM both
  // hit firestore.rules' deliberate !isAnonymous() gate for a guest who
  // filled out the profile form but never linked Google/Apple -- the bar
  // itself is correct (owner decision, kept as-is), the bug was the
  // silent/raw failure. Gate client-side BEFORE firing the write; on a
  // successful link, re-run whichever action was pending.
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<'follow' | 'message' | null>(null);

  const isSelf = myUid === targetUid;
  const followed = isFollowing(targetUid);

  // Compliance Phase 2.2 — DM requires BOTH parties to be exactly 'adult',
  // same polarity as the server-side Firestore rule on /chats DM create
  // (firestore.rules' chats/{chatId} allow create: both participants'
  // core.ageGroup == 'adult'). Investigation finding (03.10.2026): this
  // used to read `!== 'minor'` -- permissive by default, so a missing/
  // undefined ageGroup (a legacy pre-ageGroup account) passed this check
  // and showed an enabled button that then 403'd on click, since the rule
  // requires the field to be PRESENT and exactly 'adult', not merely "not
  // minor". Tightened to match the rule's own polarity exactly -- this
  // only prevents showing a button that was always going to fail; it
  // never allows anything the rule wouldn't already allow.
  const canDirectMessage =
    !isSelf && !!myUid &&
    myProfile?.core?.ageGroup === 'adult' &&
    publicProfile?.ageGroup === 'adult';

  const handleSendMessage = useCallback(() => {
    if (!myUid || !publicProfile) return;
    if (auth.currentUser?.isAnonymous) {
      setPendingAction('message');
      setShowLinkPrompt(true);
      return;
    }
    void useChatStore.getState().openDM(
      myUid,
      myProfile?.core?.name ?? 'אווטיר',
      targetUid,
      publicProfile.name,
    );
  }, [myUid, myProfile, targetUid, publicProfile]);

  // Load connections if not yet loaded
  useEffect(() => {
    if (myUid && !isLoaded) {
      loadConnections(myUid);
    }
  }, [myUid, isLoaded, loadConnections]);

  // Fetch public profile + posts
  useEffect(() => {
    if (!targetUid) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // SPEC-03 Wave B (SEC-06): viewing someone ELSE's profile reads
        // userPublic — the full users/{uid} doc is owner+admin only now.
        // Viewing your OWN profile through this page still reads
        // users/{uid} directly (isOwner(userId) is unchanged by this fix)
        // — userPublic only mirrors DISCOVERABLE profiles, and the owner
        // must always be able to view their own profile regardless of
        // that toggle.
        const collectionName = isSelf ? 'users' : 'userPublic';
        const [userSnap, userPosts] = await Promise.all([
          getDoc(doc(db, collectionName, targetUid)),
          getUserPosts(targetUid, 15),
        ]);

        if (cancelled) return;

        if (userSnap.exists()) {
          const data = userSnap.data();
          setPublicProfile(isSelf ? {
            name: data.core?.name ?? 'משתמש',
            photoURL: data.core?.photoURL ?? undefined,
            ageGroup: data.core?.ageGroup === 'minor' || data.core?.ageGroup === 'adult' ? data.core.ageGroup : undefined,
            bio: data.core?.bio ?? undefined,
            trainingTags: data.core?.trainingTags ?? undefined,
            // isSelf reads the live private doc directly -- real-time
            // values, no mirror staleness (unlike the public branch below).
            currentStreak: data.progression?.currentStreak ?? undefined,
            workoutCount: data.progression?.workoutCount ?? undefined,
          } : {
            name: data.name ?? 'משתמש',
            photoURL: data.photoURL ?? undefined,
            // Merge note (main ← worktree-spec01-close-guest-leaks, 2026-09-10):
            // main added ageGroup only to the isSelf branch (data.core.ageGroup,
            // correct for the raw users/{uid} doc that branch reads). This repo's
            // SPEC-03 Wave B (SEC-06) had already split this ternary so the OTHER
            // branch reads userPublic instead, whose schema is flat (no .core) —
            // confirmed against userPublicSync.ts's MIRRORED_CORE_FIELDS and the
            // already-updated UserProfileSheet.tsx, which reads this same field
            // the same flat way. Keeping main's line only on the isSelf branch
            // would leave ageGroup permanently undefined for every OTHER
            // profile — canDirectMessage's publicProfile.ageGroup === 'adult'
            // check below would never pass, silently defeating the whole
            // minor-DM gate for the one case (viewing someone else) the
            // send-message feature actually exists for.
            ageGroup: data.ageGroup === 'minor' || data.ageGroup === 'adult' ? data.ageGroup : undefined,
            // Flat schema, same as the rest of this branch — see
            // userPublicSync.ts's publicRef.set() payload.
            bio: data.bio ?? undefined,
            trainingTags: data.trainingTags ?? undefined,
            // Mirrored, may lag behind the user's real current value (see
            // userPublicSync.ts) or be entirely absent on an older mirror
            // doc -- `?? undefined` (not `?? 0`) so ProfileHeader's stat
            // row can tell "unknown" apart from a real 0 and omit the
            // stat instead of showing a misleading number.
            currentStreak: data.currentStreak ?? undefined,
            workoutCount: data.workoutCount ?? undefined,
          });
        }
        setPosts(userPosts);
      } catch (err) {
        console.error('[PublicProfile] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [targetUid, isSelf]);

  // Fetch the target user's real mutual-follow partners, separately from
  // the profile+posts load above — needs the viewer's own ageGroup
  // (getUsersByUids' required age-scoping, see that function's own
  // comment), which may hydrate slightly after myUid itself.
  useEffect(() => {
    if (!targetUid || !myUid) {
      setPartnersLoading(false);
      return;
    }
    const callerAgeGroup = myProfile?.core?.ageGroup;
    if (callerAgeGroup !== 'minor' && callerAgeGroup !== 'adult') {
      setPartnersLoading(false);
      return;
    }

    let cancelled = false;
    setPartnersLoading(true);
    getMutualPartners(targetUid, callerAgeGroup, myUid)
      .then((result) => {
        if (!cancelled) setPartners(result);
      })
      .catch((err) => {
        console.error('[PublicProfile] getMutualPartners failed:', err);
      })
      .finally(() => {
        if (!cancelled) setPartnersLoading(false);
      });
    return () => { cancelled = true; };
  }, [targetUid, myUid, myProfile?.core?.ageGroup]);

  const handleToggleFollow = useCallback(() => {
    if (!myUid || isSelf) return;
    if (auth.currentUser?.isAnonymous) {
      setPendingAction('follow');
      setShowLinkPrompt(true);
      return;
    }
    if (followed) {
      unfollowUser(myUid, targetUid);
    } else {
      followUser(myUid, targetUid);
    }
  }, [myUid, isSelf, followed, targetUid, followUser, unfollowUser]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען פרופיל...</p>
      </div>
    );
  }

  if (!publicProfile) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F8FAFC] gap-3">
        <p className="text-sm font-bold text-gray-900">משתמש לא נמצא</p>
        <button
          onClick={() => router.back()}
          className="text-xs text-cyan-600 font-bold"
        >
          חזרה
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC]">
      {/* Header — pad below status bar so the back button isn't covered. */}
      <header
        className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-md mx-auto px-4 py-1.5 flex items-center gap-3" dir="rtl">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="חזרה"
          >
            <ArrowRight className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-black text-gray-900 flex-1 truncate">
            {publicProfile.name}
          </h1>
          {isSelf ? (
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              הפרופיל שלי
            </span>
          ) : (
            myUid && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all"
                aria-label="דווח על המשתמש"
                title="דווח על המשתמש"
              >
                <Flag className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </header>

      {/* Phase 7.2 — Report-user sheet */}
      {myUid && !isSelf && (
        <ReportContentSheet
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          targetId={targetUid}
          targetType="user"
          targetName={publicProfile.name}
          reporterId={myUid}
        />
      )}

      {/* Guest-account link prompt — see state comment above. Re-runs
          whichever handler triggered it once linking succeeds, so follow/
          send-message completes in one flow instead of a second tap. */}
      <LinkAccountPrompt
        isOpen={showLinkPrompt}
        onClose={() => {
          setShowLinkPrompt(false);
          setPendingAction(null);
        }}
        onLinked={() => {
          setShowLinkPrompt(false);
          if (pendingAction === 'follow') handleToggleFollow();
          else if (pendingAction === 'message') handleSendMessage();
          setPendingAction(null);
        }}
      />

      <div className="max-w-md mx-auto px-4 py-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <ProfileHeader
            photoURL={publicProfile.photoURL ?? null}
            name={publicProfile.name}
            stats={[
              // Omitted (not shown as 0/"—") when undefined -- the mirror
              // may not carry this field yet, either because userPublicSync
              // hasn't been redeployed, or because it's piggybacking on
              // another field's sync and hasn't refreshed since this
              // user's last workout (see userPublicSync.ts). Canvas order:
              // streak · partners · workouts.
              ...(publicProfile.currentStreak != null
                ? [{
                    key: 'streak',
                    value: (
                      <span className="inline-flex items-center gap-1">
                        <Flame className="w-4 h-4 text-orange-500" fill="currentColor" />
                        {publicProfile.currentStreak}
                      </span>
                    ),
                    label: 'ימי רצף',
                  }]
                : []),
              { key: 'partners', value: partnersLoading ? '—' : partners.length, label: 'שותפים' },
              ...(publicProfile.workoutCount != null
                ? [{ key: 'workouts', value: publicProfile.workoutCount, label: 'אימונים' }]
                : []),
            ]}
            bio={publicProfile.bio ?? null}
            bioPlaceholder={isSelf ? 'עדיין אין תיאור אישי' : 'המשתמש לא הוסיף תיאור אישי'}
            tagIds={publicProfile.trainingTags ?? []}
            actions={
              !isSelf && myUid ? (
                <div className="flex items-center gap-2 mt-4" dir="rtl">
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                      followed
                        ? 'bg-gray-100 text-gray-600 border border-gray-200'
                        : 'bg-[#00ADEF] text-white'
                    }`}
                  >
                    {followed ? (
                      <>
                        <UserMinus className="w-4 h-4" />
                        מפסיק לעקוב
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        עקוב
                      </>
                    )}
                  </button>

                  {canDirectMessage ? (
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      className="flex-1 py-2.5 rounded-full text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 bg-gray-50 text-gray-600 border border-gray-200"
                    >
                      <MessageCircle className="w-4 h-4" />
                      שלח הודעה
                    </button>
                  ) : (
                    // Covers both a real minor AND a missing/undefined
                    // ageGroup (legacy account) -- canDirectMessage already
                    // requires 'adult' on both sides, so "not that" always
                    // means "can't message," never "unknown, try anyway."
                    <div
                      className="flex-1 py-2.5 rounded-full text-[10px] font-bold leading-tight flex items-center justify-center gap-1.5 bg-gray-50 text-gray-400 border border-gray-100 text-center px-1"
                      aria-disabled="true"
                    >
                      <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                      הודעות לבני 18+ בלבד
                    </div>
                  )}
                </div>
              ) : undefined
            }
          />
        </motion.div>

        <div className="mt-5">
          <PartnersHighlightsRow
            partners={partners.map((p) => ({ uid: p.uid, name: p.name, photoURL: p.photoURL }))}
            isLoading={partnersLoading}
            onPartnerClick={(uid) => router.push(`/profile/${uid}`)}
          />
        </div>

        <div className="mt-5" dir="rtl">
          <h3 className="text-sm font-black text-gray-800 mb-3">פעילות אחרונה</h3>
          <PublicActivityGrid posts={posts} isLoading={loading} />
        </div>
      </div>
    </div>
  );
}
