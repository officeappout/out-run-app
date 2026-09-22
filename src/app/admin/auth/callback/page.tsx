'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithMagicLink, isMagicLinkCallback } from '@/lib/auth.service';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import { CheckCircle, AlertCircle, Mail } from 'lucide-react';
import AppLogoLoader from '@/components/AppLogoLoader';

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

  const completeSignIn = async (emailToUse: string) => {
    setEmail(emailToUse);

    // Sign in with magic link. If emailToUse doesn't match the address the
    // link's oobCode was actually issued for (someone confirms with the
    // wrong email), Firebase's backend rejects the code itself — this
    // surfaces as result.error, same as an expired/invalid link.
    const result = await signInWithMagicLink(emailToUse);

    if (result.error) {
      setError(result.error === 'auth/invalid-action-code'
        ? 'הקישור לא תקין, פג תוקף, או שכתובת המייל אינה תואמת את ההזמנה. נסה שוב.'
        : 'שגיאה בהתחברות. נסה שוב.');
      setLoading(false);
      return;
    }

    if (!result.user) {
      setError('שגיאה בהתחברות. נסה שוב.');
      setLoading(false);
      return;
    }

    // Mint the admin session cookie NOW, before any router navigation.
    // The middleware checks for this cookie on the very first /admin/* request.
    // If we navigate first and mint later (via AdminSessionSync), the middleware
    // intercepts the navigation while the cookie is still missing → redirect loop.
    try {
      const idToken = await result.user.getIdToken(/* forceRefresh */ true);
      await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
    } catch (sessionErr) {
      // Non-fatal: AdminSessionSync will retry. Middleware will catch the missing
      // cookie and redirect to login, but that is safer than blocking sign-in.
      console.warn('[AuthCallback] Session cookie pre-mint failed:', sessionErr);
    }

    // Check for invitation token — redeem it before role check
    const invitationToken = searchParams?.get('token') ||
      (typeof window !== 'undefined' ? window.localStorage.getItem('pendingInvitationToken') : null);

    let invitationApplied = false;
    let invitationRole: string | null = null;
    let invitationOrgId: string | null = null;

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
      if (typeof window !== 'undefined' && invitationOrgId) {
        localStorage.setItem('admin_selected_org_id', invitationOrgId);
      }
      if (invitationRole === 'super_admin') {
        router.replace('/admin');
      } else if (invitationRole === 'vertical_admin') {
        router.replace('/admin/organizations');
      } else {
        router.replace('/admin/authority-manager');
      }
      return;
    }

    // No invitation — check existing role
    const roleInfo = await checkUserRole(result.user.uid);
    const isOnly = await isOnlyAuthorityManager(result.user.uid);

    // Auto-set selectedOrgId so sidebar/context picks up the correct org
    if (typeof window !== 'undefined') {
      if (roleInfo.authorityIds.length > 0) {
        localStorage.setItem('admin_selected_org_id', roleInfo.authorityIds[0]);
      } else if (roleInfo.tenantId) {
        localStorage.setItem('admin_selected_org_id', roleInfo.tenantId);
      }
    }

    if (roleInfo.isAuthorityManager || isOnly) {
      // Check if this is a neighborhood admin — redirect to their profile
      try {
        const authorities = await getAuthoritiesByManager(result.user.uid);
        if (authorities.length > 0 && authorities[0].type === 'neighborhood') {
          router.replace(`/admin/authority/neighborhoods/${authorities[0].id}`);
          return;
        }
      } catch { /* fall through to default */ }
      router.replace('/admin/authority-manager');
    } else if (roleInfo.isVerticalAdmin) {
      router.replace('/admin/organizations');
    } else if (roleInfo.isTenantOwner) {
      router.replace('/admin/authority-manager');
    } else if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin) {
      router.replace('/admin');
    } else {
      setError('אין לך הרשאות גישה לפורטל הניהול.');
      setLoading(false);
    }
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
        const emailToUse = emailFromStorage || emailFromUrl;

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
