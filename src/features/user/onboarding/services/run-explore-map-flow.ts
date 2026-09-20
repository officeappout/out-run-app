/**
 * run-explore-map-flow.ts
 *
 * Extracted from gateway/page.tsx's handleExploreMap (the "גלו את המפה" card)
 * so the exact same flow can be reused by the landing page's "הרשמה מהירה"
 * quick-register button without duplicating this logic a second time — the
 * kind of drift that caused the bug Part 2 (gateway-explore-map.service.ts's
 * wipe guard) had to fix. One shared flow; gateway and quick-register both
 * call it.
 *
 * resolveUser/consumePendingGroupInvite/consumePendingSessionInvite are also
 * exported here because gateway/page.tsx's handleGetProgram (and its own
 * auto-redirect effect) use them too — extracting only runExploreMapFlow and
 * leaving these three duplicated locally in gateway/page.tsx would have
 * reintroduced the same class of duplication this refactor exists to avoid.
 */

import { auth, db } from '@/lib/firebase';
import { signInGuest } from '@/lib/auth.service';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { buildExploreMapProfileWrite } from './gateway-explore-map.service';
import { detectCityFromGPS, addAffiliation } from '@/features/user/identity/services/affiliation.service';
import {
  getStoredReferrer,
  establishSocialConnection,
  processReferral,
  clearStoredReferrer,
} from '@/features/safecity/services/referral.service';
import { joinGroup } from '@/features/arena/services/group.service';
import { consumeSessionInvitation } from '@/features/arena/services/group-invitation.service';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';

/**
 * Minimal router shape — matches both next/navigation's useRouter() and
 * AppRouterInstance, same convention already established in
 * mini-domain-assessment.ts.
 */
export interface ExploreMapRouter {
  push: (href: string) => void;
}

/**
 * Resolve the active user — reuse an existing provider session if present.
 * This flow is reachable both by brand-new visitors AND by users who just
 * signed in with Apple/Google but haven't completed onboarding yet. Calling
 * signInGuest() (signInAnonymously) when a provider user is already
 * authenticated replaces their session with a new anonymous uid, permanently
 * breaking the link between their Apple/Google account and their profile.
 */
export async function resolveUser() {
  const current = auth.currentUser;
  if (current && !current.isAnonymous) {
    return { user: current, error: null };
  }
  return signInGuest();
}

/**
 * Consume a pending group invite (set by /join/[inviteCode]). Auto-joins the
 * group right after auth resolves so an invited user lands INSIDE the league
 * with the success drawer firing — instead of being dropped on the group
 * drawer and having to tap "Join" manually. Returns the post-join redirect
 * path, or null when there's no pending invite.
 */
export async function consumePendingGroupInvite(
  uid: string,
  name: string,
): Promise<string | null> {
  const pendingGroupId = localStorage.getItem('pending_group_id');
  if (!pendingGroupId) return null;

  const pendingInviteCode = localStorage.getItem('pending_invite_code') ?? undefined;
  localStorage.removeItem('pending_group_id');
  localStorage.removeItem('pending_invite_code');

  try {
    await joinGroup(
      pendingGroupId,
      uid,
      name,
      pendingInviteCode ? { providedCode: pendingInviteCode } : undefined,
    );
  } catch (e) {
    console.error('[ExploreMapFlow] auto-join pending group failed:', e);
  }

  // joined=true tells the community page to fire PostJoinSuccessDrawer.
  return `/community?groupId=${pendingGroupId}&joined=true`;
}

/**
 * Phase G v1 — session invite token consumed post-auth. Returns the redirect
 * URL if a pending token was found and consumed, null otherwise.
 */
export async function consumePendingSessionInvite(
  uid: string,
  displayName: string,
  photoURL?: string | null,
): Promise<string | null> {
  const pendingToken = localStorage.getItem('pending_session_token');
  if (!pendingToken) return null;
  localStorage.removeItem('pending_session_token');

  try {
    const { groupId, attendanceId, source, activityType } = await consumeSessionInvitation(
      pendingToken,
      uid,
      { name: displayName, ...(photoURL ? { photoURL } : {}) },
    );
    // Seed the group session context — onSnapshot fills memberIds/profiles.
    // user_memberships is confirmed written (consumeSessionInvitation succeeded).
    useSharedSession.getState().joinViaDeepLink(groupId, attendanceId, [], {}, '');
    useSharedSession.getState().setMembershipReady();

    if (source === 'run-invite' && activityType) {
      // Write pending_run_invite so DiscoverLayer can restore partner context
      // if the page reloads after navigation (Zustand reset on iOS hard-close).
      localStorage.setItem(
        'pending_run_invite',
        JSON.stringify({ groupId, attendanceId, activityType, source }),
      );
      return `/map?openRun=${activityType}`;
    }

    // Standard group session: open community page with group drawer.
    return `/community?groupId=${groupId}`;
  } catch (e) {
    console.error('[ExploreMapFlow] session invite consume failed:', e);
    localStorage.removeItem('pending_run_invite');
    return '/map';
  }
}

/**
 * The full "explore map" flow — quick start with GPS city detection. Runs the
 * Part 2 wipe guard (buildExploreMapProfileWrite) automatically since it's a
 * direct call inside here, not something callers need to reapply.
 *
 * Returns true if it resolved a user and proceeded (navigated, or scheduled a
 * redirect) — false only when resolveUser() returned no user. Callers use
 * this to decide whether to reset their own loading UI: never reset on true,
 * since a navigation is already underway (matches the original gateway
 * behavior, which never resets its transition overlay on any success path —
 * the overlay must stay visible until the page actually unmounts).
 */
export async function runExploreMapFlow(router: ExploreMapRouter): Promise<boolean> {
  const { user } = await resolveUser();
  if (!user) return false;

  // gateway_uid persists via onboardingPrefs so the profile page can
  // resolve the uid even if Firebase auth restoration is slow after
  // a hard close on iOS.
  setOnboardingPref('gateway_uid', user.uid);

  // Wipe guard: an already-onboarded user can reach this flow during a
  // redirect-race window and trigger it before being routed away. Read the
  // doc first so an existing profile is never re-scaffolded — see
  // docs/research/gateway-home-strength-card-investigation.md for the
  // incident this closes (progression.domains, core.gender/weight,
  // running.activeProgram etc. were all being reset to blank defaults).
  const existingDocSnap = await getDoc(doc(db, 'users', user.uid));
  const scaffold = buildExploreMapProfileWrite(
    user.uid,
    existingDocSnap.exists() ? existingDocSnap.data() : undefined,
  );

  // onboarding_path is mirrored durably too, so a reopen whose Firestore doc
  // write was lost can still be recognised as a MAP_ONLY user (consumed by
  // the landing-router recovery branch) — only meaningful for a genuinely
  // new user; skip it for an existing profile so it can't misclassify one.
  if (scaffold) {
    setOnboardingPref('onboarding_path', 'MAP_ONLY');
  }

  // Capture the profile write so we can confirm it committed before
  // navigating. Fire-and-forget could strand a doc-less MAP_ONLY user on a
  // hard-close right after redirect. City detection still runs in parallel
  // below and does not block the redirect.
  const profileWrite = scaffold
    ? setDoc(doc(db, 'users', user.uid), {
        ...scaffold,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
        .then(() => true)
        .catch((e) => { console.error('[ExploreMapFlow] setDoc error:', e); return false; })
    : Promise.resolve(true);

  detectCityFromGPS().then(async (affiliation) => {
    if (affiliation) {
      await addAffiliation(affiliation);
    }
  }).catch(() => {});

  // Process referral + auto-connect if user came via an invite link
  const referrerUid = getStoredReferrer();
  if (referrerUid && referrerUid !== user.uid) {
    establishSocialConnection(referrerUid, user.uid).catch(() => {});
    processReferral(referrerUid, user.uid, '').catch(() => {});
    clearStoredReferrer();
  }

  // Auto-connect with group creator if user came via a group invite link
  const groupInviterUid = localStorage.getItem('group_inviter_uid');
  if (groupInviterUid && groupInviterUid !== user.uid) {
    establishSocialConnection(groupInviterUid, user.uid).catch(() => {});
    localStorage.removeItem('group_inviter_uid');
  }

  // If user came from a group invite deep link, auto-join then redirect
  const groupRedirect = await consumePendingGroupInvite(
    user.uid,
    user.displayName ?? 'משתמש',
  );
  if (groupRedirect) {
    setTimeout(() => { router.push(groupRedirect); }, 1200);
    return true;
  }

  // If user came from a session invite deep link, consume token then redirect to map
  const sessionRedirect = await consumePendingSessionInvite(
    user.uid,
    user.displayName ?? 'משתמש',
    user.photoURL,
  );
  if (sessionRedirect) {
    setTimeout(() => { router.push(sessionRedirect); }, 1200);
    return true;
  }

  // Give the profile write up to 1.5s to commit BEFORE navigating, so a
  // hard-close right after redirect can't strand a doc-less MAP_ONLY user.
  // Offline-safe: the race cap never hangs (the write stays queued and the
  // durable onboarding_path marker lets reopen recover). The ~1.2s
  // transition-animation window still elapses in parallel.
  await Promise.all([
    Promise.race([profileWrite, new Promise((r) => setTimeout(r, 1500))]),
    new Promise((r) => setTimeout(r, 1200)),
  ]);
  router.push('/explorer');
  return true;
}
