'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowRight, UserPlus, UserMinus, Flag } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { getUserPosts, type FeedPost } from '@/features/social/services/feed.service';
import FeedPostCard from '@/features/social/components/FeedPostCard';
import ReportContentSheet from '@/features/arena/components/ReportContentSheet';

interface PublicProfile {
  name: string;
  photoURL?: string;
  currentLevel?: string;
  initialFitnessTier?: number;
  mainGoal?: string;
}

const GOAL_LABELS: Record<string, string> = {
  healthy_lifestyle: 'אורח חיים בריא',
  performance_boost: 'שיפור ביצועים',
  weight_loss: 'ירידה במשקל',
  skill_mastery: 'שליטה במיומנויות',
};

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

  const isSelf = myUid === targetUid;
  const followed = isFollowing(targetUid);

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
        const [userSnap, userPosts] = await Promise.all([
          getDoc(doc(db, 'users', targetUid)),
          getUserPosts(targetUid, 15),
        ]);

        if (cancelled) return;

        if (userSnap.exists()) {
          const data = userSnap.data();
          setPublicProfile({
            name: data.core?.name ?? 'משתמש',
            photoURL: data.core?.photoURL ?? undefined,
            currentLevel: data.progression?.currentLevel ?? undefined,
            initialFitnessTier: data.core?.initialFitnessTier ?? undefined,
            mainGoal: data.core?.mainGoal ?? undefined,
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
  }, [targetUid]);

  const handleToggleFollow = useCallback(() => {
    if (!myUid || isSelf) return;
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

      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
          dir="rtl"
        >
          <div className="flex items-center gap-4 mb-4">
            {publicProfile.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={publicProfile.photoURL}
                alt={publicProfile.name}
                className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
                {publicProfile.name.charAt(0)}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black text-gray-900 truncate">
                {publicProfile.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {publicProfile.currentLevel && (
                  <span className="text-xs font-bold text-cyan-600">
                    {publicProfile.currentLevel}
                  </span>
                )}
                {publicProfile.mainGoal && (
                  <span className="text-[11px] text-gray-500">
                    {GOAL_LABELS[publicProfile.mainGoal] ?? publicProfile.mainGoal}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Follow button */}
          {!isSelf && myUid && (
            <button
              onClick={handleToggleFollow}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                followed
                  ? 'bg-gray-100 text-gray-600 border border-gray-200'
                  : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
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
          )}
        </motion.div>

        {/* Activity feed */}
        {posts.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-gray-900 px-1 mb-3" dir="rtl">
              פעילות אחרונה
            </h3>
            <div className="space-y-3">
              {posts.map((post) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <FeedPostCard post={post} currentUid={myUid} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {posts.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center" dir="rtl">
            <p className="text-sm text-gray-500">אין פעילות אחרונה</p>
          </div>
        )}
      </div>
    </div>
  );
}
