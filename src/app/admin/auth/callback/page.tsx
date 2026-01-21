'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithMagicLink, isMagicLinkCallback } from '@/lib/auth.service';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

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
          setError('כתובת אימייל לא נמצאה. נסה להתחבר שוב.');
          setLoading(false);
          return;
        }

        setEmail(emailToUse);

        // Sign in with magic link
        const result = await signInWithMagicLink(emailToUse);

        if (result.error) {
          setError(result.error === 'auth/invalid-action-code' 
            ? 'הקישור לא תקין או פג תוקף. נסה להתחבר שוב.'
            : 'שגיאה בהתחברות. נסה שוב.');
          setLoading(false);
          return;
        }

        if (!result.user) {
          setError('שגיאה בהתחברות. נסה שוב.');
          setLoading(false);
          return;
        }

        // Check user role and redirect accordingly
        const roleInfo = await checkUserRole(result.user.uid);
        const isOnly = await isOnlyAuthorityManager(result.user.uid);

        if (roleInfo.isAuthorityManager || isOnly) {
          router.replace('/admin/authority-manager');
        } else if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin) {
          router.replace('/admin');
        } else {
          setError('אין לך הרשאות גישה לפורטל הניהול.');
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Error handling magic link:', err);
        setError('שגיאה בהתחברות. נסה שוב.');
        setLoading(false);
      }
    };

    handleMagicLink();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">מתחבר...</h2>
          <p className="text-gray-600">בודק את הקישור ומתחבר למערכת</p>
        </div>
      </div>
    );
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
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">טוען...</h2>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
