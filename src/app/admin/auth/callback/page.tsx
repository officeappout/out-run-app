'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { signInWithMagicLink, isMagicLinkCallback, signOutUser, mintAdminSessionCookie } from '@/lib/auth.service';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAuthority } from '@/features/admin/services/authority.service';
import { authorityTypeToTenantType } from '@/features/admin/config/tenantLabels';
import { decidePreflightAction } from '@/features/admin/services/auth-callback-preflight';
import { decideInvitationRoleRedirect, decideResolveDestinationBranch } from '@/features/admin/services/postAcceptRedirect';
import { resolveSafeNextPath } from '@/features/admin/services/safeNextPath';
import { CheckCircle, AlertCircle, Mail } from 'lucide-react';
import AppLogoLoader from '@/components/AppLogoLoader';

// A raw `auth.currentUser` read can momentarily be null on a hard refresh —
// Firebase hasn't finished restoring the persisted session from storage yet
// — which would make an already-signed-in user look signed-out. Waiting for
// the first onAuthStateChanged emission instead gets Firebase's settled
// answer (a real user, or a confirmed null), not the pre-restore flicker.
function waitForInitialAuthState(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// §13.39 — resolves an org's ACTUAL current vertical fresh, every time,
// rather than trusting a possibly-stale/absent stored field. tenant_owner
// gets core.tenantType written at accept-time; unit_admin does NOT
// (checked against accept-invitation/route.ts — no such write in that
// branch) — resolving both the same way here avoids that asymmetry
// mattering to either caller below. Returns null on any failure (missing
// doc, network error) — callers treat that as "cannot determine."
async function resolveTenantType(tenantId: string): Promise<string | null> {
  try {
    const org = await getAuthority(tenantId);
    return org ? authorityTypeToTenantType(org) : null;
  } catch {
    return null;
  }
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  // Standard Firebase cross-device email-link flow: this browser never
  // stored emailForSignIn (a different device sent the link — e.g. root
  // auto-sending an invitation straight to the invitee's inbox from root's
  // OWN browser, see admin/authority/team/page.tsx and
  // InviteMemberModal.tsx) and the URL doesn't carry ?email= either
  // (deliberately, for invitation links — /api/admin/invitations'
  // callbackUrl never embeds the recipient's email, so it can't be
  // silently pre-filled). Rather than dead-end with an error, ask the
  // user to confirm their own email and complete sign-in from that.
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Set when a magic link resolves to a DIFFERENT email than whoever is
  // currently signed in on this device/browser — e.g. root sent an
  // invitation link that got opened in a browser still holding someone
  // else's session. We must not silently swap sessions (that's exactly
  // what used to happen via signInWithEmailLink, with no confirmation).
  const [needsAccountSwitchConfirm, setNeedsAccountSwitchConfirm] = useState(false);
  const [switchFromEmail, setSwitchFromEmail] = useState('');
  const [switchToEmail, setSwitchToEmail] = useState('');
  const [switching, setSwitching] = useState(false);

  // The tail end of a successful sign-in: no server-side role/section check
  // ever runs before this point (see authority-portal/login/page.tsx — the
  // pre-auth "is this email a manager" lookup was removed entirely, exactly
  // to avoid answering that for an unauthenticated caller). Everything here
  // reads the CALLER'S OWN doc under their own freshly-verified session.
  //
  // Mints/refreshes the session cookie FIRST, unconditionally — every
  // caller of this function (the normal sign-in tail, the pre-flight
  // "already signed in, resolve directly" shortcut, and the account-switch
  // cancel handler) is about to router.replace() to an /admin/* path that
  // middleware.ts gates on that exact cookie. Relying on AdminSessionSync
  // (admin/layout.tsx) alone races the navigation — see
  // 00-MASTER-PLAN.md §13.10.
  const resolveDestination = async (user: User) => {
    await mintAdminSessionCookie(user);
    const roleInfo = await checkUserRole(user.uid);
    const isOnly = await isOnlyAuthorityManager(user.uid);

    if (typeof window !== 'undefined') {
      if (roleInfo.authorityIds.length > 0) {
        localStorage.setItem('admin_selected_org_id', roleInfo.authorityIds[0]);
      } else if (roleInfo.tenantId) {
        localStorage.setItem('admin_selected_org_id', roleInfo.tenantId);
      }
    }

    // §13.39 — decideResolveDestinationBranch checks isTenantOwner/
    // isUnitAdmin BEFORE isAuthorityManager: a tenant_owner is ALSO,
    // mechanically, an authority_manager (accept-invitation/route.ts
    // arrayUnions them into authorities/{tenantId}.managerIds too — the two
    // roles' registration is deliberately identical at that level).
    // Checking isAuthorityManager first would catch every real tenant_owner
    // before ever reaching the tenant_owner branch, sending them to
    // /admin/authority-manager regardless — exactly the bug being fixed.
    // David's requirement 1: if tenantType (or unitId, for unit_admin)
    // can't be resolved, show a clear message — never guess a fallback
    // path, never leave the screen stuck on the loader.
    const tenantType = roleInfo.tenantId ? await resolveTenantType(roleInfo.tenantId) : null;
    const decision = decideResolveDestinationBranch({
      isTenantOwner: roleInfo.isTenantOwner,
      isUnitAdmin: roleInfo.isUnitAdmin,
      isAuthorityManager: roleInfo.isAuthorityManager,
      isOnlyAuthorityManager: isOnly,
      isVerticalAdmin: roleInfo.isVerticalAdmin,
      isSuperAdmin: roleInfo.isSuperAdmin,
      isSystemAdmin: roleInfo.isSystemAdmin,
      tenantId: roleInfo.tenantId,
      unitId: roleInfo.unitId,
      tenantType,
    });

    if (decision.kind === 'redirect') {
      // P1-3 (00-MASTER-PLAN.md §13.43): only this "existing role, no
      // invitation" branch honors `next` — a session that simply expired
      // mid-navigation lands back where the admin actually was. The
      // invitation-acceptance branches above/below this function keep
      // their own explicit, unrelated destination logic untouched.
      const safeNext = resolveSafeNextPath(searchParams?.get('next'));
      router.replace(safeNext ?? decision.path);
    } else if (decision.kind === 'cannot-determine') {
      setError(decision.message);
      setLoading(false);
    } else {
      // 'legacy-authority-manager' — UNCHANGED existing behavior: a real
      // authority_manager (municipal or otherwise) must keep landing
      // exactly where they do today.
      try {
        const authorities = await getAuthoritiesByManager(user.uid);
        if (authorities.length > 0 && authorities[0].type === 'neighborhood') {
          router.replace(`/admin/authority/neighborhoods/${authorities[0].id}`);
          return;
        }
      } catch { /* fall through to default */ }
      router.replace('/admin/authority-manager');
    }
  };

  const completeSignIn = async (emailToUse: string) => {
    setEmail(emailToUse);

    // Sign in with magic link. If emailToUse doesn't match the address the
    // link's oobCode was actually issued for (someone confirms with the
    // wrong email), Firebase's backend rejects the code itself — this
    // surfaces as result.error, same as an expired/invalid link.
    const result = await signInWithMagicLink(emailToUse);

    if (result.error || !result.user) {
      setError(result.error === 'auth/invalid-action-code'
        ? 'הקישור לא תקין, פג תוקף, או שכתובת המייל אינה תואמת את ההזמנה. נסה שוב.'
        : 'שגיאה בהתחברות. נסה שוב.');
      setLoading(false);
      return;
    }

    // Mint the admin session cookie NOW, before any router navigation.
    // The middleware checks for this cookie on the very first /admin/* request.
    // If we navigate first and mint later (via AdminSessionSync), the middleware
    // intercepts the navigation while the cookie is still missing → redirect loop.
    // (resolveDestination() below mints again for its own callers — this
    // earlier mint is still needed because the invitationApplied branch
    // right below navigates directly, without ever calling resolveDestination.)
    await mintAdminSessionCookie(result.user);

    // Check for invitation token — redeem it before role check
    const invitationToken = searchParams?.get('token') ||
      (typeof window !== 'undefined' ? window.localStorage.getItem('pendingInvitationToken') : null);

    let invitationApplied = false;
    let invitationRole: string | null = null;
    let invitationOrgId: string | null = null;
    let invitationUnitId: string | null = null;

    if (invitationToken) {
      try {
        const { validateInvitation } = await import(
          '@/features/admin/services/invitation.service'
        );
        const invitation = await validateInvitation(invitationToken);
        if (invitation) {
          // SPEC-PERMISSIONS-MODEL.md §7 — acceptance moved server-side
          // (POST /api/auth/accept-invitation). The client sends ONLY the
          // invitation id; every written value is read from the
          // invitation document by the server, never from here. Works
          // identically whether result.user was already signed in as
          // something else (e.g. anonymous) before this magic-link
          // sign-in ran — signInWithEmailLink() always replaces the
          // current user with the newly authenticated one, so by this
          // point result.user IS the invitee's real account regardless of
          // whatever session existed before.
          const acceptIdToken = await result.user.getIdToken();
          const res = await fetch('/api/auth/accept-invitation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acceptIdToken}` },
            body: JSON.stringify({ invitationId: invitation.id }),
          });
          if (res.ok) {
            invitationApplied = true;
            invitationRole = invitation.role;
            invitationOrgId = invitation.authorityId || invitation.tenantId || null;
            invitationUnitId = invitation.unitId || null;
            console.log('[AuthCallback] Invitation applied successfully for', invitation.role);
          } else {
            const errBody = await res.json().catch(() => ({}));
            console.error('[AuthCallback] accept-invitation failed:', res.status, errBody);
          }
        } else {
          console.warn('[AuthCallback] Invitation token invalid or expired');
        }
      } catch (invErr) {
        console.error('[AuthCallback] Error applying invitation:', invErr);
      } finally {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('pendingInvitationToken');
        }
      }
    }

    // If invitation was just applied, redirect based on the invitation role
    // without re-querying Firestore (avoids cache/timing issues).
    if (invitationApplied) {
      // 30.09.2026, David's live-test finding 3 (first-login race): the
      // EARLIER mint above (before accept-invitation even ran) reflects
      // this user's PRE-acceptance role — typically none at all. Every
      // branch below navigates straight to an authority-scoped path
      // without minting again, so middleware saw a scope-less cookie on
      // the very first request and bounced to /authority-portal/login —
      // which then had to re-resolve everything from scratch, and if
      // THAT hit its own hiccup (e.g. getAuthority), decideLoopBreak
      // mistook the resulting retry for a genuine identification failure.
      // One re-mint, right here, through the SAME existing metered
      // entrypoint (never a second path, never a retry loop) — closes
      // this at the root instead of leaving every redirect below racing
      // against a stale cookie.
      //
      // 01.10.2026 (00-MASTER-PLAN.md §13.60, axioms.md §28) — this call
      // MUST bypass mintAdminSessionCookie's 5-second dedupe. The earlier
      // mint above (line ~180) ran BEFORE accept-invitation wrote this
      // user's real role; this one runs AFTER. Without forceReason, the
      // two near-simultaneous calls looked identical to the dedupe cache
      // and the second one silently no-opped — this exact comment block
      // describes the fix this was SUPPOSED to be, while the dedupe
      // (added two days earlier, for an unrelated 429 problem) quietly
      // swallowed it. Confirmed via git history, not guessed.
      await mintAdminSessionCookie(result.user, { forceReason: 'role-changed-post-accept-invitation' });
      if (typeof window !== 'undefined' && invitationOrgId) {
        localStorage.setItem('admin_selected_org_id', invitationOrgId);
      }
      if (invitationRole === 'super_admin') {
        router.replace('/admin');
      } else if (invitationRole === 'vertical_admin') {
        router.replace('/admin/organizations');
      } else {
        // §13.39 — invitationOrgId is already the invitation's tenantId for
        // tenant_owner/unit_admin (authorityId is never set on either kind
        // of invitation — see InviteMemberModal.tsx/§13.35). Only the org's
        // CURRENT vertical needs a fresh lookup, and only for those two
        // roles — decideInvitationRoleRedirect returns 'legacy' for every
        // other role (authority_manager, platform_member), which keeps
        // its EXISTING, unchanged destination below.
        const tenantType = invitationOrgId ? await resolveTenantType(invitationOrgId) : null;
        const decision = decideInvitationRoleRedirect(invitationRole, {
          tenantId: invitationOrgId,
          unitId: invitationUnitId,
          tenantType,
        });
        if (decision.kind === 'redirect') {
          router.replace(decision.path);
        } else if (decision.kind === 'cannot-determine') {
          setError(decision.message);
          setLoading(false);
        } else {
          router.replace('/admin/authority-manager');
        }
      }
      return;
    }

    // No invitation — check existing role
    await resolveDestination(result.user);
  };

  useEffect(() => {
    const handleMagicLink = async () => {
      try {
        setLoading(true);

        // Check if this is a magic link callback
        if (!isMagicLinkCallback()) {
          setError('קישור לא תקין. נסה שוב.');
          setLoading(false);
          return;
        }

        // Get email from localStorage or URL params
        const emailFromStorage = typeof window !== 'undefined'
          ? window.localStorage.getItem('emailForSignIn')
          : null;
        const emailFromUrl = searchParams?.get('email') || '';
        const tokenParam = searchParams?.get('token') ||
          (typeof window !== 'undefined' ? window.localStorage.getItem('pendingInvitationToken') : null);

        // Best-effort resolution of who this specific link is FOR, without
        // consuming it yet. Invitation links carry no ?email= (deliberately
        // — see the comment on that route) so for those we ask the
        // (public, narrow-response) verify-token lookup instead.
        let targetEmail = emailFromStorage || emailFromUrl || '';
        if (!targetEmail && tokenParam) {
          try {
            const res = await fetch(`/api/auth/admin-invite/verify-token?token=${encodeURIComponent(tokenParam)}`);
            const data = res.ok ? await res.json() : null;
            targetEmail = data?.invitation?.email || '';
          } catch { /* unresolved — handled by the fallthrough below */ }
        }

        const currentUser = await waitForInitialAuthState();
        const decision = decidePreflightAction(
          currentUser ? { uid: currentUser.uid, email: currentUser.email, isAnonymous: currentUser.isAnonymous } : null,
          targetEmail,
        );

        if (decision.kind === 'confirm-switch') {
          // A real, signed-in session already exists for someone ELSE —
          // don't silently swap it out from under them (that's exactly
          // what a bare signInWithEmailLink call would do). Ask first.
          setSwitchFromEmail(decision.fromEmail);
          setSwitchToEmail(decision.toEmail);
          setNeedsAccountSwitchConfirm(true);
          setLoading(false);
          return;
        }

        if (decision.kind === 'resolve' && currentUser) {
          // Same user (or an invitation link whose target we genuinely
          // couldn't resolve) already has a live session — most likely a
          // refresh of this same URL after signing in already consumed the
          // one-time code. Re-running signInWithEmailLink would fail on the
          // stale code and show an error despite the user already being
          // signed in correctly; resolve their destination directly instead.
          await resolveDestination(currentUser);
          return;
        }

        // decision.kind === 'proceed' — either nobody is signed in, or the
        // only existing session is anonymous (treated identically: an
        // anonymous uid is a disposable identity that says nothing about
        // who's actually opening this link, so it must never block or
        // stand in for a real sign-in — see auth-callback-preflight.ts).
        const emailToUse = targetEmail;
        if (!emailToUse) {
          setNeedsEmailConfirm(true);
          setLoading(false);
          return;
        }

        await completeSignIn(emailToUse);
      } catch (err: any) {
        console.error('Error handling magic link:', err);
        setError('שגיאה בהתחברות. נסה שוב.');
        setLoading(false);
      }
    };

    handleMagicLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  const handleConfirmEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmEmailInput.trim()) return;
    setConfirming(true);
    setError('');
    try {
      await completeSignIn(confirmEmailInput.trim());
    } catch (err: any) {
      console.error('Error confirming email:', err);
      setError('שגיאה בהתחברות. נסה שוב.');
      setLoading(false);
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmSwitch = async () => {
    setSwitching(true);
    setError('');
    try {
      await signOutUser();
      setNeedsAccountSwitchConfirm(false);
      await completeSignIn(switchToEmail);
    } catch (err: any) {
      console.error('Error switching accounts:', err);
      setError('שגיאה בהתנתקות. נסה שוב.');
      setSwitching(false);
    }
  };

  const handleCancelSwitch = async () => {
    // Stay signed in as whoever is currently authenticated — send them to
    // THEIR destination rather than strand them on this screen or, worse,
    // retry the link and re-trigger the same prompt.
    setNeedsAccountSwitchConfirm(false);
    setLoading(true);
    if (auth.currentUser) {
      await resolveDestination(auth.currentUser);
    } else {
      router.replace('/admin/login');
    }
  };

  if (needsAccountSwitchConfirm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">משתמש אחר מחובר</h2>
            <p className="text-gray-600">
              אתה מחובר כ-<strong dir="ltr">{switchFromEmail}</strong>.
              הקישור מיועד ל-<strong dir="ltr">{switchToEmail}</strong>.
              להתנתק ולהמשיך?
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleConfirmSwitch}
              disabled={switching}
              className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition-colors disabled:opacity-60"
            >
              {switching ? 'מתנתק...' : 'התנתק והמשך'}
            </button>
            <button
              onClick={handleCancelSwitch}
              disabled={switching}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors disabled:opacity-60"
            >
              הישאר מחובר כ-{switchFromEmail}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsEmailConfirm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Mail className="w-16 h-16 text-cyan-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">אשר את כתובת המייל שלך</h2>
            <p className="text-gray-600">
              כדי להשלים את ההתחברות, הזן את כתובת המייל שאליה נשלח הקישור.
            </p>
          </div>
          <form onSubmit={handleConfirmEmailSubmit} className="space-y-4">
            <input
              type="email"
              required
              autoFocus
              value={confirmEmailInput}
              onChange={(e) => setConfirmEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={confirming}
              className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition-colors disabled:opacity-60"
            >
              {confirming ? 'מתחבר...' : 'המשך'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return <AppLogoLoader caption="מתחבר..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">שגיאה בהתחברות</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/admin/login')}
                className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition-colors"
              >
                חזור למסך ההתחברות
              </button>
              <button
                onClick={() => router.push('/authority-portal/login')}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                התחבר כנציג רשות
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AppLogoLoader caption="טוען..." />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
