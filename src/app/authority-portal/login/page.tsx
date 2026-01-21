'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { sendAdminMagicLink, checkAdminEmail } from '@/features/admin/services/passwordless-auth.service';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import { Building2, Mail, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function AuthorityPortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorityLogo, setAuthorityLogo] = useState<string | null>(null);

  // Check if user is already authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleInfo = await checkUserRole(user.uid);
          const isOnly = await isOnlyAuthorityManager(user.uid);

          // Only allow authority_manager to access this portal
          if (roleInfo.isAuthorityManager || isOnly) {
            router.replace('/admin/authority-manager');
            return;
          } else if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin) {
            // Super admin/system admin tried to access authority portal - redirect to their portal
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
  }, [router]);

  // Try to get authority logo if user has one
  useEffect(() => {
    const loadAuthorityLogo = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const authorities = await getAuthoritiesByManager(user.uid);
          if (authorities.length > 0 && authorities[0].logoUrl) {
            setAuthorityLogo(authorities[0].logoUrl);
          }
        }
      } catch (error) {
        console.error('Error loading authority logo:', error);
      }
    };
    loadAuthorityLogo();
  }, []);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Check if current user is Super Admin (for testing/dev purposes)
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const roleInfo = await checkUserRole(currentUser.uid);
          if (roleInfo.isSuperAdmin) {
            // Super Admin bypass - redirect immediately
            setSuccess('מעביר לדשבורד...');
            setTimeout(() => {
              router.push('/admin/authority-manager');
            }, 500);
            return;
          }
        } catch (error) {
          console.error('Error checking super admin status:', error);
        }
      }

      // Send magic link only for authority_manager
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
        // In development mode, redirect immediately instead of waiting for email
        const isDevMode = typeof window !== 'undefined' && 
                          (window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname.includes('localhost'));
        
        if (isDevMode) {
          setSuccess('מעביר לדשבורד...');
          // Small delay for UX, then redirect
          setTimeout(() => {
            router.push('/admin/authority-manager');
          }, 500);
        } else {
        setSuccess(`נשלח קישור התחברות לכתובת ${email}. בדוק את תיבת הדואר הנכנס שלך.`);
        setEmail('');
        }
      } else {
        setError('שגיאה בשליחת הקישור. נסה שוב.');
      }
    } catch (err: any) {
      console.error('Error sending magic link:', err);
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
        {/* Logo Section - Minimal Design */}
        <div className="text-center mb-12">
          {authorityLogo ? (
            <div className="mb-6">
              <img
                src={authorityLogo}
                alt="Authority Logo"
                className="h-24 w-auto mx-auto object-contain drop-shadow-lg"
              />
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Building2 size={40} className="text-cyan-600" />
              </div>
            </div>
          )}
          
          {/* Welcome Message */}
          <div className="mb-8">
            <h1 className="text-3xl font-black text-gray-900 mb-3">
              ברוכים הבאים
            </h1>
            <p className="text-lg text-gray-700 font-semibold mb-2">
              פורטל ניהול הבריאות הרשותי
            </p>
            <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
              התחברו לניהול הפארקים והמסלולים במועצה המקומית שלכם
            </p>
          </div>
        </div>

        {/* Login Card - Clean Minimal Design */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 border border-red-200 bg-red-50 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm flex-1 text-red-800">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 border border-green-200 bg-green-50 rounded-lg flex items-start gap-3">
              <CheckCircle size={20} className="flex-shrink-0 mt-0.5 text-green-600" />
              <p className="text-sm flex-1 text-green-800">{success}</p>
            </div>
          )}

          {/* Email Login Form - Clean Minimal */}
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

        {/* Minimal Privacy Notice */}
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
