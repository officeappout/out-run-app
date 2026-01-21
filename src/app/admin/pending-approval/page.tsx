'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Shield, Clock, AlertCircle, LogOut } from 'lucide-react';

export default function PendingApprovalPage() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/authority-login');
        return;
      }

      // Check if user is approved
      try {
        const { getUserFromFirestore } = await import('@/lib/firestore.service');
        const profile = await getUserFromFirestore(user.uid);
        
        // If user is approved, redirect to appropriate dashboard
        if (profile?.core?.isApproved === true) {
          const { checkUserRole, isOnlyAuthorityManager } = await import('@/features/admin/services/auth.service');
          const roleInfo = await checkUserRole(user.uid);
          const isOnly = await isOnlyAuthorityManager(user.uid);
          
          if (roleInfo.isAuthorityManager || isOnly) {
            router.push('/admin/authority-manager');
          } else if (roleInfo.isSuperAdmin) {
            router.push('/admin');
          } else {
            router.push('/admin/authority-login');
          }
        }
      } catch (error) {
        console.error('Error checking approval status:', error);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/authority-login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={40} className="text-yellow-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">ממתין לאישור</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              ההרשמה הצליחה, אך ממתינה לאישור מנהל מערכת.
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-right text-sm text-yellow-800">
                <p className="font-bold mb-1">מה קורה עכשיו?</p>
                <p>
                  בקשתך נשלחה למנהלי המערכת. לאחר אישור, תקבל הודעה ותוכל להתחבר לפורטל הניהול.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
          >
            <LogOut size={18} />
            <span>התנתק</span>
          </button>
        </div>
      </div>
    </div>
  );
}
