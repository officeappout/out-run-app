'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { Authority } from '@/types/admin-types';
import { BarChart3, Building2, ChevronDown } from 'lucide-react';
import { safeRenderText } from '@/utils/render-helpers';
import AnalyticsDashboard from '@/features/admin/components/authority-manager/AnalyticsDashboard';

const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

export default function AuthorityManagerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [allAuthorities, setAllAuthorities] = useState<Authority[]>([]); // For Super Admins
  const [selectedAuthority, setSelectedAuthority] = useState<Authority | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);

  /** Persist the chosen authority so a page refresh restores it. */
  const persistAndSelect = (auth: Authority) => {
    setSelectedAuthority(auth);
    try {
      localStorage.setItem(AUTHORITY_STORAGE_KEY, auth.id);
    } catch { /* private-browsing / storage full — graceful no-op */ }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // User is not authenticated, redirect to authority login
        if (typeof window !== 'undefined') {
          window.location.href = '/admin/authority-login';
        }
        return;
      }
      setUser(currentUser);
      loadAuthorities(currentUser.uid);
    });
    return () => unsubscribe();
  }, []);

  const loadAuthorities = async (userId: string) => {
    try {
      setLoading(true);
      
      // Check if user is Super Admin
      const roleInfo = await checkUserRole(userId);
      const isSuper = roleInfo.isSuperAdmin || false;
      setIsSuperAdmin(isSuper);
      
      if (isSuper) {
        // For Super Admins: Load ALL top-level authorities for switching
        const allTopLevel = await getAllAuthorities(undefined, true);
        setAllAuthorities(allTopLevel);
        setAuthorities(allTopLevel);

        if (allTopLevel.length > 0) {
          // Restore previously selected authority from localStorage, fall back to first
          const savedId = typeof window !== 'undefined'
            ? localStorage.getItem(AUTHORITY_STORAGE_KEY)
            : null;
          const restored = savedId ? allTopLevel.find(a => a.id === savedId) : null;
          const target = restored ?? allTopLevel[0];
          setSelectedAuthority(target);
          const authName = typeof target.name === 'string' ? target.name : (target.name?.he || target.name?.en || '');
          console.log('[Authority Manager] Super Admin - Selected authority:', authName, restored ? '(restored from localStorage)' : '(default first)');
        }
      } else {
        // For Authority Managers: Use getAuthoritiesByManager
        const data = await getAuthoritiesByManager(userId);
        if (data.length > 0) {
          console.log('[AuthorityManager] DEBUG: Authority name type:', typeof data[0].name, data[0].name);
        }
        console.log('[Authority Manager] Loaded', data.length, 'authorities');
        setAuthorities(data);

        if (data.length > 0) {
          const savedId = typeof window !== 'undefined'
            ? localStorage.getItem(AUTHORITY_STORAGE_KEY)
            : null;
          const restored = savedId ? data.find(a => a.id === savedId) : null;
          const target = restored ?? data[0];
          setSelectedAuthority(target);
          const authName = typeof target.name === 'string' ? target.name : (target.name?.he || target.name?.en || '');
          console.log('[Authority Manager] Selected authority:', authName, restored ? '(restored from localStorage)' : '(default first)');
        }
      }
    } catch (error) {
      console.error('Error loading authorities:', error);
      alert('שגיאה בטעינת הרשויות');
    } finally {
      setLoading(false);
    }
  };

  // searchParams used for legacy deep links — redirect groups/events to community hub
  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam === 'groups' || tabParam === 'events') {
      router.replace('/admin/authority/community?tab=manage');
    }
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (authorities.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Building2 size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">לא נמצאו רשויות</h3>
          <p className="text-gray-500">אינך מוגדר כמנהל של רשות כלשהי</p>
          <p className="text-sm text-gray-400 mt-2">
            אם אתה מנהל מערכת, ודא שיש רשויות במערכת
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center">
              <BarChart3 size={24} className="text-cyan-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">
                {isSuperAdmin ? 'אנליטיקה — צפייה כרשות' : 'אנליטיקה ו-BI'}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {isSuperAdmin ? 'מנהל מערכת — צפייה בנתוני רשות' : 'נתונים, מגמות ותובנות'}
              </p>
            </div>
          </div>
          
          {/* Authority Selector - Enhanced for Super Admins */}
          {isSuperAdmin && allAuthorities.length > 0 ? (
            <div className="relative">
              <button
                onClick={() => setShowAuthorityDropdown(!showAuthorityDropdown)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl bg-white hover:bg-gray-50 transition-colors text-black"
              >
                <span className="text-sm font-medium">
                  צפייה כ: {safeRenderText(selectedAuthority?.name) || 'בחר רשות'}
                </span>
                <ChevronDown size={16} className={`transition-transform ${showAuthorityDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showAuthorityDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowAuthorityDropdown(false)}
                  />
                  <div className="absolute top-full mt-2 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg max-h-96 overflow-y-auto min-w-[250px]">
                    {allAuthorities.map((auth) => (
                      <button
                        key={auth.id}
                        onClick={() => {
                          persistAndSelect(auth);
                          setShowAuthorityDropdown(false);
                        }}
                        className={`w-full text-right px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${
                          selectedAuthority?.id === auth.id 
                            ? 'bg-cyan-50 text-cyan-700 font-bold' 
                            : 'text-black'
                        }`}
                      >
                        {safeRenderText(auth.name)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : authorities.length > 1 ? (
            <select
              value={selectedAuthority?.id || ''}
              onChange={(e) => {
                const authority = authorities.find((a) => a.id === e.target.value);
                if (authority) persistAndSelect(authority);
              }}
              className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black bg-white"
            >
              {authorities.map((auth) => (
                <option key={auth.id} value={auth.id}>
                  {safeRenderText(auth.name)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Authority Info Card */}
      {selectedAuthority && (
        <div className="bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">{safeRenderText(selectedAuthority.name)}</h2>
              <div className="flex items-center gap-6 text-sm">
                <span>👥 {selectedAuthority.userCount || 0} משתמשים</span>
                <span>👨‍💼 {selectedAuthority.managerIds?.length || 0} מנהלים</span>
              </div>
            </div>
            {selectedAuthority.logoUrl && (
              <img
                src={selectedAuthority.logoUrl}
                alt={safeRenderText(selectedAuthority.name)}
                className="w-20 h-20 rounded-full object-cover border-4 border-white/20"
              />
            )}
          </div>
        </div>
      )}

      {/* Analytics Content */}
      {selectedAuthority && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <AnalyticsDashboard
            authorityId={selectedAuthority.id}
            onNavigateToSessions={() => router.push('/admin/authority/community?tab=schedule')}
          />
        </div>
      )}
    </div>
  );
}
