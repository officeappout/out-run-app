'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { sendAdminMagicLink } from '@/features/admin/services/passwordless-auth.service';
import { Shield, Mail, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleInfo = await checkUserRole(user.uid);
          
          // Only allow super_admin and system_admin to access this portal
          if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin) {
            router.replace('/admin');
            return;
          } else if (roleInfo.isAuthorityManager) {
            // Authority manager tried to access super admin portal - redirect to their portal
            router.replace('/authority-portal/login');
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

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Send magic link only for super_admin/system_admin
      const result = await sendAdminMagicLink(
        email,
        'super_admin', // This will check for both super_admin and system_admin
        `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/auth/callback?email=${encodeURIComponent(email)}`
      );

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.sent) {
        setSuccess(`נשלח קישור התחברות לכתובת ${email}. בדוק את תיבת הדואר הנכנס שלך.`);
        setEmail('');
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield size={48} className="text-cyan-600" />
            <h1 className="text-3xl font-black text-gray-900">OUT RUN</h1>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            פורטל ניהול מערכת
          </h2>
          <p className="text-gray-600 text-sm">
            התחבר כמנהל מערכת (Super Admin / System Admin)
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
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

          {/* Email Login Form */}
          <form onSubmit={handleSendMagicLink} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="your.email@example.com"
                  dir="ltr"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                נשלח לך קישור התחברות ישירות למייל שלך
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-cyan-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 leading-relaxed">
            על ידי התחברות, אתה מסכים ל
            <a href="#" className="text-cyan-600 hover:underline font-medium mx-1">
              תנאי השימוש
            </a>
            ו-
            <a href="#" className="text-cyan-600 hover:underline font-medium mx-1">
              מדיניות הפרטיות
            </a>
            של הפורטל.
          </p>
        </div>
      </div>
    </div>
  );
}
