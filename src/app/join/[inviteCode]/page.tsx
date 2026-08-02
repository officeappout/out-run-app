'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, Users, Clock, Loader2, AlertCircle } from 'lucide-react';
import { onAuthStateChange, signInGuest } from '@/lib/auth.service';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import type { CommunityGroup } from '@/types/community.types';

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; gradient: string }> = {
  walking:      { label: 'הליכה',      icon: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:      { label: 'ריצה',       icon: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:         { label: 'יוגה',       icon: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics: { label: 'קליסתניקס', icon: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:      { label: 'רכיבה',      icon: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:        { label: 'אחר',        icon: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const { profile } = useUserStore();
  const { flags: featureFlags } = useFeatureFlags();
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!inviteCode) return;
    // Use the public preview API (Admin SDK, no client auth required) so a
    // new unauthenticated user can see the group before being asked to sign in.
    // Joining (member write) is still gated behind auth — see handleJoinClick.
    // Note: only pending_invite_code is stored here; pending_group_id is
    // intentionally omitted so the gateway doesn't consume the invite early
    // via consumePendingGroupInvite before identity collection is complete.
    fetch(`/api/join/preview?code=${encodeURIComponent(inviteCode)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(({ group: g }: { group: CommunityGroup & { id: string } }) => {
        setGroup(g);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [inviteCode]);

  const handleJoinClick = () => {
    if (!group || joining) return;
    setJoining(true);

    const unsub = onAuthStateChange(async (user) => {
      unsub();

      // Gate: user must be signed in AND have a completed profile (ageGroup set
      // by /api/user/complete-profile server-side). If either is missing, route
      // through the express identity screen first — it collects name/gender/DOB,
      // then B3 routing returns here once identity is complete.
      const hasProfile = Boolean(user && profile?.core?.ageGroup);
      if (!user || !hasProfile) {
        // Ensure an anonymous auth session exists before routing to the express
        // identity screen. Without this, the profile page finds no auth.currentUser
        // and bounces back to the gateway selection screen.
        if (!user) {
          const { user: anonUser } = await signInGuest();
          if (anonUser) setOnboardingPref('gateway_uid', anonUser.uid);
        }
        localStorage.setItem('pending_invite_code', inviteCode);
        if (group?.name) localStorage.setItem('pending_invite_group_name', group.name);
        router.push('/onboarding-new/profile?context=express');
        setJoining(false);
        return;
      }

      // Signed in + profile complete → confirm membership via server.
      // /api/join/confirm verifies the code server-side (Admin SDK), writes
      // community_groups/{groupId}/members/{uid} + user_memberships/{uid}
      // + users/{uid}.social.groupIds atomically in a single batch.
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('no-token');

        const res = await fetch('/api/join/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ inviteCode }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if ((err as { error?: string }).error === 'invalid-invite-code') {
            setJoining(false);
            setNotFound(true);
            return;
          }
          throw new Error((err as { error?: string }).error ?? 'server-error');
        }

        const { groupId } = await res.json() as { groupId: string };
        localStorage.removeItem('pending_invite_code');
        // joined=true triggers the PostJoinSuccessDrawer on /community.
        router.push(`/community?groupId=${groupId}&joined=true`);
      } catch (e) {
        console.error('[JoinPage] confirm failed:', e);
        setJoining(false);
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  // A league-type invite (groupType set) while enableLeagues is off is treated
  // identically to an invalid link — no separate "leagues is off" messaging.
  const isBlockedByLeaguesFlag = !!group?.groupType && !featureFlags.enableLeagues;

  if (notFound || !group || isBlockedByLeaguesFlag) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] px-6 text-center" dir="rtl">
        <AlertCircle className="w-14 h-14 text-gray-300 mb-4" />
        <h1 className="text-xl font-black text-gray-900 mb-2">הקישור אינו תקף</h1>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          ייתכן שהקבוצה הוסרה או שהקישור פג תוקפו.
        </p>
        <button
          onClick={() => router.push('/community')}
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black shadow-lg shadow-cyan-500/30"
        >
          גלה קבוצות אחרות
        </button>
      </div>
    );
  }

  const cat = CATEGORY_CONFIG[group.category] ?? CATEGORY_CONFIG.other;
  const scheduleLabel = (() => {
    if (group.scheduleSlots?.length) {
      return group.scheduleSlots
        .map((s) => `יום ${DAY_LABELS[s.dayOfWeek]} בשעה ${s.time}`)
        .join(' · ');
    }
    if (group.schedule) {
      return `יום ${DAY_LABELS[group.schedule.dayOfWeek]} בשעה ${group.schedule.time}`;
    }
    return null;
  })();

  const coverImage = group.images?.[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col" dir="rtl">
      {/* Hero */}
      <div className="relative h-56 flex-shrink-0 overflow-hidden">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt={group.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${cat.gradient} flex items-center justify-center`}>
            <span className="text-8xl drop-shadow-xl select-none">{cat.icon}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* OutRun wordmark */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2">
          <span className="text-lg font-black text-white/90 tracking-tight drop-shadow">OutRun</span>
        </div>

        {/* Category chip */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-full">
          <span>{cat.icon}</span>
          <span>{cat.label}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-6 space-y-4 max-w-md mx-auto w-full">
        {/* Invite tag */}
        <div className="flex items-center gap-1.5">
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black">
            הוזמנת להצטרף
          </span>
        </div>

        <h1 className="text-2xl font-black text-gray-900 leading-tight">{group.name}</h1>

        {group.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{group.description}</p>
        )}

        <div className="space-y-2.5">
          {group.meetingLocation?.address && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="w-4 h-4 text-cyan-500 flex-shrink-0" />
              <span className="font-medium">{group.meetingLocation.address}</span>
            </div>
          )}
          {scheduleLabel && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <span className="font-medium">{scheduleLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="font-medium">{group.currentParticipants} חברים כבר בפנים</span>
          </div>
        </div>

        {group.rules && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-amber-700 mb-1">כללי הקבוצה</p>
            <p className="text-xs text-amber-700 leading-relaxed whitespace-pre-line">{group.rules}</p>
          </div>
        )}
      </div>

      {/* CTA — sticky bottom */}
      <div
        className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-gray-100 px-5 py-4 max-w-md mx-auto w-full"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={handleJoinClick}
          disabled={joining}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-base font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-xl shadow-cyan-500/30 active:scale-[0.97] transition-transform disabled:opacity-70"
        >
          {joining ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Users className="w-5 h-5" />
              הצטרף לקבוצה
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-gray-400 mt-2.5">
          תועבר לאפליקציית OutRun כדי להשלים את ההצטרפות
        </p>
      </div>
    </div>
  );
}
