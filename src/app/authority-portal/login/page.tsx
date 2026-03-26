'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { sendAdminMagicLink } from '@/features/admin/services/passwordless-auth.service';
import { getAuthoritiesByManager, getAuthority } from '@/features/admin/services/authority.service';
import { Building2, Mail, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function AuthorityPortalLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
      </div>
    }>
      <AuthorityPortalLoginContent />
    </Suspense>
  );
}

function AuthorityPortalLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);

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

          if (roleInfo.isAuthorityManager || isOnly) {
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
            router.replace('/admin/authority-manager');
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
    setSuccess('');
    setLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const roleInfo = await checkUserRole(currentUser.uid);
          if (roleInfo.isSuperAdmin) {
            setSuccess('מעביר לדשבורד...');
            setTimeout(() => { router.push('/admin/authority-manager'); }, 500);
            return;
          }
        } catch {}
      }

      const result = await sendAdminMagicLink(
        email,
        'authority_manager',
        `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/auth/callback?email=${encodeURIComponent(email)}`
      );

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.sent) {
        const isDevMode = typeof window !== 'undefined' &&
          (window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname.includes('localhost'));

        if (isDevMode) {
          setSuccess('מעביר לדשבורד...');
          setTimeout(() => { router.push('/admin/authority-manager'); }, 500);
        } else {
          setSuccess(`נשלח קישור התחברות לכתובת ${email}. בדוק את תיבת הדואר הנכנס שלך.`);
          setEmail('');
        }
      } else {
        setError('שגיאה בשליחת הקישור. נסה שוב.');
      }
    } catch {
      setError('שגיאה בשליחת הקישור. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">בודק הרשאות...</p>
        </div>
      </div>
    );
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
              פורטל ניהול הבריאות הרשותי
            </p>
            <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
              {brandName
                ? `התחברו לניהול הפארקים והמסלולים ב${brandName}`
                : 'התחברו לניהול הפארקים והמסלולים במועצה המקומית שלכם'}
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100">
          {error && (
            <div className="mb-6 p-4 border border-red-200 bg-red-50 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm flex-1 text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 border border-green-200 bg-green-50 rounded-lg flex items-start gap-3">
              <CheckCircle size={20} className="flex-shrink-0 mt-0.5 text-green-600" />
              <p className="text-sm flex-1 text-green-800">{success}</p>
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
                  className="w-full pr-12 pl-4 py-4 text-base border-2 border-gray-200 rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gray-50 focus:bg-white"
                  placeholder="your.email@municipality.co.il"
                  dir="ltr"
                />
              </div>
              <p className="mt-3 text-xs text-gray-500 text-center">
                נשלח לך קישור התחברות ישירות למייל שלך
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
    </div>
  );
}
