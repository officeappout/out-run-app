'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { sendMagicLinkRateLimited, mintAdminSessionCookie, signOutUser } from '@/lib/auth.service';
import { getAuthoritiesByManager, getAuthority } from '@/features/admin/services/authority.service';
import { authorityTypeToTenantType, getTenantLabels } from '@/features/admin/config/tenantLabels';
import { decideUnitAdminRedirect, decideTenantOwnerRedirect } from '@/features/admin/services/postAcceptRedirect';
import { decideLoopBreak, readLastLoopAttempt, recordLoopAttempt, clearLoopAttempt } from '@/features/admin/services/authority-login-loop-guard';
import { resolveSafeNextPath } from '@/features/admin/services/safeNextPath';
import { Building2, Mail, AlertCircle, CheckCircle, Loader2, X, MailCheck, Search } from 'lucide-react';
import AppLogoLoader from '@/components/AppLogoLoader';
import type { TenantType } from '@/types/admin-types';

export default function AuthorityPortalLoginPage() {
  return (
    <Suspense fallback={<AppLogoLoader />}>
      <AuthorityPortalLoginContent />
    </Suspense>
  );
}

// Mirrors admin/auth/callback/page.tsx's own resolveTenantType — both
// callers need the org's ACTUAL current vertical to route/brand correctly.
// tenant_owner gets core.tenantType written at accept-time, unit_admin does
// NOT (checked against accept-invitation/route.ts — no such write in that
// branch), so both resolve it fresh via getAuthority(tenantId) +
// authorityTypeToTenantType() rather than trusting a possibly-missing
// stored field. Also returns name/logo so this page reuses the SAME fetch
// for branding instead of a second one.
async function resolveTenantOrg(tenantId: string): Promise<{ tenantType: TenantType; name: string; logoUrl: string | null } | null> {
  try {
    const org = await getAuthority(tenantId);
    if (!org) return null;
    // Authority['name'] is typed as plain `string`, but real docs can carry
    // a {he,en} object at runtime (the same pre-existing drift admin/
    // layout.tsx's unit_admin branch already works around this same way —
    // not fixing the underlying type here, out of scope). Explicit cast
    // instead of the `.he`/`.en`-on-`never` narrowing error the plain
    // ternary below produces.
    const rawName = org.name as unknown as string | { he?: string; en?: string };
    const name = typeof rawName === 'object' && rawName !== null ? (rawName.he || rawName.en || '') : (rawName || '');
    return { tenantType: authorityTypeToTenantType(org), name, logoUrl: org.logoUrl ?? null };
  } catch {
    return null;
  }
}

function AuthorityPortalLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sentToEmail, setSentToEmail] = useState('');

  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  // Vertical-copy pass (28.09.2026) — resolved from the SAME ?authority=
  // param as brandName/brandLogo below (once /api/admin/invitations
  // forwards tenantId for unit_admin/tenant_owner invites too, not just
  // authorityId), or from the post-auth branch further down for a
  // returning/session-loss officer. null (unresolved) renders today's
  // existing municipal copy via getTenantLabels' own fallback — never a
  // guess at an unconfirmed vertical.
  const [tenantType, setTenantType] = useState<TenantType | null>(null);
  const labels = getTenantLabels(tenantType);

  // Login-entry-points unification (00-MASTER-PLAN.md, 28.09.2026) —
  // middleware.ts now sends a session-lost officer/authority-manager here
  // (their own door, never /admin/login) with ?next=<the page they were on>
  // set. Validated the same way /admin/login already validates it (P1-3) —
  // resolveSafeNextPath rejects anything outside /admin and any open-
  // redirect shape.
  const safeNext = resolveSafeNextPath(searchParams.get('next'));

  // 29.09.2026, David's live-test trap: middleware sets this specifically
  // for an unit_admin/tenant_owner session BLOCKED from an out-of-scope
  // path (never alongside ?next= — see decideAdminGateAction's own
  // comment). A genuinely different situation from "session expired,
  // resume where you were" — the session here is perfectly valid, the
  // PATH just isn't in this scope's territory. Shown as its own explicit
  // screen (accessBlocked below) rather than auto-redirected, so the
  // message is honest about what actually happened instead of either
  // silently landing them somewhere unexplained or (the original bug)
  // re-attempting the same blocked path and tripping the loop guard.
  const wasBlockedByGate = searchParams.get('blocked') === '1';
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [accessBlockedDestination, setAccessBlockedDestination] = useState<string | null>(null);

  // Loop breaker (00-MASTER-PLAN.md §13.10): this page redirects a
  // confirmed authority manager straight to /admin/authority-manager.
  // Before the scope-cookie fix, middleware always bounced that request
  // back to /admin/login, whose own client-side check sent them right back
  // here — forever.
  //
  // ?redirected=1 alone is NOT a loop signal — an already-signed-in
  // manager who visits /admin/login directly (not looping at all) gets
  // bounced here exactly once, legitimately, by admin/login's own
  // isAuthorityManager check. Treating that first bounce as "stop" blocked
  // a real manager who was never looping (caught in review before merge).
  // Instead, a sessionStorage-backed timestamp tracks actual REPEATED
  // attempts across the full-page navigations a real loop implies (React
  // state wouldn't survive those) — only a second attempt within a short
  // window counts as a genuine loop. See authority-login-loop-guard.ts for
  // the pure decision function and its own tests.
  const [loopDetected, setLoopDetected] = useState(false);

  // Persist invitation token to localStorage so it survives the magic link redirect
  useEffect(() => {
    const token = searchParams.get('token');
    if (token && typeof window !== 'undefined') {
      window.localStorage.setItem('pendingInvitationToken', token);
    }
  }, [searchParams]);

  // Fetch branding from ?authority=XXXX URL parameter
  useEffect(() => {
    const authorityParam = searchParams.get('authority') || searchParams.get('authorityId');
    if (!authorityParam) return;

    setBrandLoading(true);
    getAuthority(authorityParam)
      .then(auth => {
        if (auth) {
          const name = typeof auth.name === 'string' ? auth.name : (auth.name?.he || auth.name?.en || '');
          if (name) setBrandName(name);
          if (auth.logoUrl) setBrandLogo(auth.logoUrl);
          setTenantType(authorityTypeToTenantType(auth));
        }
      })
      .catch(() => {})
      .finally(() => setBrandLoading(false));
  }, [searchParams]);

  // Check if user is already authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleInfo = await checkUserRole(user.uid);
          const isOnly = await isOnlyAuthorityManager(user.uid);

          // Login-entry-points unification follow-up (28.09.2026, David's
          // live-test finding) — check isTenantOwner/isUnitAdmin BEFORE
          // isAuthorityManager, the same ordering postAcceptRedirect.ts
          // documents and admin/auth/callback/page.tsx already follows: a
          // real tenant_owner is ALSO, mechanically, an authority_manager
          // (accept-invitation/route.ts arrayUnions them into
          // authorities/{tenantId}.managerIds too) — checking
          // isAuthorityManager first would send every tenant_owner to
          // /admin/authority-manager instead of their own destination.
          // unit_admin has no such collision but was never handled at all
          // before this: falling through every branch below, it silently
          // showed this page's login FORM to an already-authenticated
          // officer, unbranded — exactly what David reported.
          if (roleInfo.isTenantOwner || roleInfo.isUnitAdmin) {
            // Same loop guard as the authority_manager branch below — an
            // already-signed-in local manager landing here (a session-loss
            // bounce, not a fresh visit) is the same category of risk
            // regardless of which of the three local-manager roles it is.
            const loopDecision = decideLoopBreak(readLastLoopAttempt(), Date.now());
            if (loopDecision === 'stop') {
              setLoopDetected(true);
              setCheckingAuth(false);
              return;
            }
            recordLoopAttempt();

            const org = roleInfo.tenantId ? await resolveTenantOrg(roleInfo.tenantId) : null;
            if (!brandName && org) {
              setBrandName(org.name);
              if (org.logoUrl) setBrandLogo(org.logoUrl);
            }
            if (org) setTenantType(org.tenantType);

            const decision = roleInfo.isUnitAdmin
              ? decideUnitAdminRedirect({ tenantId: roleInfo.tenantId, unitId: roleInfo.unitId, tenantType: org?.tenantType ?? null })
              : decideTenantOwnerRedirect({ tenantId: roleInfo.tenantId, tenantType: org?.tenantType ?? null });

            if (decision.kind === 'redirect') {
              if (wasBlockedByGate) {
                // This session is perfectly valid — middleware sent them
                // here specifically BECAUSE the path they tried isn't in
                // their scope, not because of a session problem. Show that
                // plainly instead of auto-navigating (the ?next= trap this
                // replaces) — the user clicks through deliberately.
                setAccessBlockedDestination(decision.path);
                setAccessBlocked(true);
                setCheckingAuth(false);
                return;
              }
              // Mint BEFORE navigating — same reason as the
              // authority_manager branch below: this page lives OUTSIDE
              // admin/layout.tsx, so AdminSessionSync never runs here.
              await mintAdminSessionCookie(user);
              router.replace(safeNext ?? decision.path);
              return;
            }
            // 'cannot-determine' — a declared failure, not a silent one
            // (same principle as admin/layout.tsx's
            // unitOrgResolutionFailed): surface the message on this page's
            // existing error banner rather than guess a destination.
            setError(decision.message);
            setCheckingAuth(false);
            return;
          }

          if (roleInfo.isAuthorityManager || isOnly) {
            // Loop guard: retry on the first attempt regardless of
            // ?redirected=1 (see the comment above this effect) — only
            // stop when a PRIOR attempt was recorded within the window.
            const loopDecision = decideLoopBreak(readLastLoopAttempt(), Date.now());
            if (loopDecision === 'stop') {
              setLoopDetected(true);
              setCheckingAuth(false);
              return;
            }
            recordLoopAttempt();

            // If branding not yet loaded from URL, try from user's authority
            if (!brandName) {
              try {
                const authorities = await getAuthoritiesByManager(user.uid);
                if (authorities.length > 0) {
                  const a = authorities[0];
                  const n = typeof a.name === 'string' ? a.name : (a.name?.he || '');
                  if (n) setBrandName(n);
                  if (a.logoUrl) setBrandLogo(a.logoUrl);
                }
              } catch {}
            }
            // Mint the session cookie BEFORE navigating — this page lives
            // OUTSIDE admin/layout.tsx, so AdminSessionSync never runs
            // here to do it for us. Without this, middleware.ts sees the
            // stale/missing cookie on the very first /admin/authority-manager
            // request and bounces to /admin/login (00-MASTER-PLAN.md §13.10).
            await mintAdminSessionCookie(user);
            router.replace(safeNext ?? '/admin/authority-manager');
            return;
          } else if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin) {
            router.replace('/admin/login');
            return;
          }
        } catch (error) {
          console.error('Error checking user role:', error);
        }
      }
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, [router, brandName]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const roleInfo = await checkUserRole(currentUser.uid);
          if (roleInfo.isSuperAdmin) {
            router.push('/admin/authority-manager');
            return;
          }
        } catch {}
      }

      // No pre-send lookup of whether this email is a manager — that check
      // (checkAdminEmail → getUserByEmail, a client Firestore query keyed
      // on an arbitrary caller-supplied email) is exactly the shape of a
      // public "is X an admin" oracle: it would let anyone enumerate the
      // manager roster by trying addresses and reading the different error
      // text back. The link is sent unconditionally to whatever address was
      // typed; the server decides what that account is entitled to only
      // AFTER a real sign-in, in /admin/auth/callback.
      // Forward the validated next= so a session that expired mid-
      // navigation lands back where the officer/manager actually was,
      // not always at the generic /admin/authority-manager default.
      const nextParam = safeNext ? `&next=${encodeURIComponent(safeNext)}` : '';
      const continueUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/auth/callback?email=${encodeURIComponent(email)}${nextParam}`;
      const result = await sendMagicLinkRateLimited(email, continueUrl);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setSentToEmail(email);
      setShowSuccessModal(true);
      setEmail('');
    } catch {
      setError('שגיאה בשליחת הקישור. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setSentToEmail('');
  };

  const handleLoopSignOut = async () => {
    await signOutUser();
    clearLoopAttempt();
    setLoopDetected(false);
    setCheckingAuth(false);
  };

  if (accessBlocked) {
    // Deliberately distinct from loopDetected below — different cause,
    // different message. This is an intentional, working-as-designed
    // block (a valid session tried a path outside its scope); loopDetected
    // is for when the system genuinely couldn't identify the caller.
    // Conflating them (the original bug, 29.09.2026) shows the wrong
    // message and makes the next real identification failure harder to
    // tell apart from an ordinary access block.
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">אין לך גישה לעמוד הזה</h2>
          <p className="text-gray-600 mb-6">
            העמוד שניסית להגיע אליו אינו בתחום ההרשאה שלך.
          </p>
          {accessBlockedDestination && (
            <a
              href={accessBlockedDestination}
              className="inline-block w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition-colors"
            >
              עבור לדף שלי
            </a>
          )}
        </div>
      </div>
    );
  }

  if (loopDetected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">יש בעיה בזיהוי ההרשאות שלך</h2>
          <p className="text-gray-600 mb-6">
            לא הצלחנו להעביר אותך לפורטל הנכון. נסה להתנתק ולהתחבר שוב — אם זה חוזר, פנה למנהל המערכת.
          </p>
          <button
            onClick={handleLoopSignOut}
            className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition-colors"
          >
            התנתק ונסה שוב
          </button>
        </div>
      </div>
    );
  }

  if (checkingAuth) {
    return <AppLogoLoader caption="בודק הרשאות..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-12">
          {brandLogo ? (
            <div className="mb-6">
              <img
                src={brandLogo}
                alt={brandName || 'Authority Logo'}
                className="h-24 w-auto mx-auto object-contain drop-shadow-lg"
              />
            </div>
          ) : (
            <div className="mb-6 flex items-center justify-center gap-2">
              <Building2 size={40} className="text-cyan-600" />
            </div>
          )}

          {/* Dynamic Welcome Message */}
          <div className="mb-8">
            {brandLoading ? (
              <div className="h-10 w-48 mx-auto bg-gray-200 animate-pulse rounded-lg" />
            ) : (
              <h1 className="text-3xl font-black text-gray-900 mb-3">
                {brandName
                  ? `ברוכים הבאים לפורטל ניהול ${brandName}`
                  : 'ברוכים הבאים'}
              </h1>
            )}
            <p className="text-lg text-gray-700 font-semibold mb-2">
              {labels.loginSubtitle}
            </p>
            <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
              {brandName
                ? `התחברו לניהול ${labels.loginSubjectPhrase} ב${brandName}`
                : `התחברו לניהול ${labels.loginSubjectPhrase} ${labels.loginOrgFallbackPhrase}`}
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100">
          {error && (
            <div className="mb-6 p-4 border border-red-200 bg-red-50 rounded-xl flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm flex-1 text-red-800">{error}</p>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          )}

          <form onSubmit={handleSendMagicLink} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-3">
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail
                  size={20}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full pr-12 pl-4 py-4 text-base text-gray-900 placeholder:text-gray-600 border-2 border-gray-200 rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gray-50 focus:bg-white"
                  placeholder={labels.loginEmailPlaceholder}
                  dir="ltr"
                />
              </div>
              <p className="mt-3 text-xs text-gray-500 text-center">
                {labels.loginEmailHelper}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-4 rounded-2xl font-bold text-base hover:from-cyan-700 hover:to-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-200/50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  <span>שולח קישור...</span>
                </>
              ) : (
                <>
                  <Mail size={18} />
                  <span>שלח קישור התחברות</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Privacy Notice */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            על ידי התחברות, אתה מסכים ל
            <a href="#" className="text-gray-600 hover:text-cyan-600 font-medium mx-1 transition-colors">
              תנאי השימוש
            </a>
            ו-
            <a href="#" className="text-gray-600 hover:text-cyan-600 font-medium mx-1 transition-colors">
              מדיניות הפרטיות
            </a>
          </p>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in-95 duration-300">
            {/* Close */}
            <button
              onClick={handleCloseSuccessModal}
              className="absolute top-5 left-5 text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X size={22} />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-200/60">
                <MailCheck size={36} className="text-white" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-black text-gray-900 text-center mb-3">
              נשלחה בקשת התחברות
            </h2>

            {/* Body */}
            <p className="text-gray-600 text-center leading-relaxed mb-2">
              {labels.loginSuccessModalBody}
              {' '}לחיצה על הקישור תעביר אותך אוטומטית ליעד המתאים לך.
            </p>

            {/* Email badge */}
            {sentToEmail && (
              <div className="flex justify-center mb-5">
                <span className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold" dir="ltr">
                  <Mail size={14} className="text-cyan-600" />
                  {sentToEmail}
                </span>
              </div>
            )}

            {/* Spam warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Search size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 leading-relaxed">
                <strong>לא מצאת את המייל?</strong>
                {' '}כדאי לבדוק גם בתיקיית ה-Spam (דואר זבל).
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={handleCloseSuccessModal}
              className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-200 transition-colors"
            >
              הבנתי, אבדוק את המייל
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
