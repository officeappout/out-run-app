'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { Authority } from '@/types/admin-types';
import { BarChart3, MapPin, Users, Calendar, Building2, ChevronDown } from 'lucide-react';
import ParksManagement from '@/features/admin/components/authority-manager/ParksManagement';
import AnalyticsDashboard from '@/features/admin/components/authority-manager/AnalyticsDashboard';
import CommunityGroups from '@/features/admin/components/authority-manager/CommunityGroups';
import CommunityEvents from '@/features/admin/components/authority-manager/CommunityEvents';

type Tab = 'analytics' | 'parks' | 'groups' | 'events';

export default function AuthorityManagerDashboard() {
  const [user, setUser] = useState<any>(null);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [allAuthorities, setAllAuthorities] = useState<Authority[]>([]); // For Super Admins
  const [selectedAuthority, setSelectedAuthority] = useState<Authority | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('analytics');
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // User is not authenticated, redirect to authority login
        window.location.href = '/admin/authority-login';
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
        
        // Auto-select first authority if available and none selected
        if (allTopLevel.length > 0 && !selectedAuthority) {
          setSelectedAuthority(allTopLevel[0]);
          console.log('[Authority Manager] Super Admin - Auto-selected authority:', allTopLevel[0].name);
        }
      } else {
        // For Authority Managers: Use getAuthoritiesByManager
      const data = await getAuthoritiesByManager(userId);
        console.log('[Authority Manager] Loaded', data.length, 'authorities');
      setAuthorities(data);
        
        // Auto-select first authority if available
      if (data.length > 0 && !selectedAuthority) {
        setSelectedAuthority(data[0]);
          console.log('[Authority Manager] Auto-selected authority:', data[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading authorities:', error);
      alert('שגיאה בטעינת הרשויות');
    } finally {
      setLoading(false);
    }
  };

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

  const tabs = [
    { id: 'analytics' as Tab, label: 'אנליטיקה', icon: BarChart3 },
    { id: 'parks' as Tab, label: 'ניהול פארקים', icon: MapPin },
    { id: 'groups' as Tab, label: 'קבוצות קהילה', icon: Users },
    { id: 'events' as Tab, label: 'אירועים', icon: Calendar },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-900">
              {isSuperAdmin ? 'צפייה כפורטל רשות' : 'לוח בקרה למנהל רשות'}
            </h1>
            <p className="text-gray-500 mt-2">
              {isSuperAdmin ? 'מנהל מערכת - צפייה בדשבורד של רשות' : 'ניהול פארקים, אנליטיקה וקהילה'}
            </p>
          </div>
          
          {/* Authority Selector - Enhanced for Super Admins */}
          {isSuperAdmin && allAuthorities.length > 0 ? (
            <div className="relative">
              <button
                onClick={() => setShowAuthorityDropdown(!showAuthorityDropdown)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl bg-white hover:bg-gray-50 transition-colors text-black"
              >
                <span className="text-sm font-medium">
                  צפייה כ: {selectedAuthority?.name || 'בחר רשות'}
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
                          setSelectedAuthority(auth);
                          setShowAuthorityDropdown(false);
                        }}
                        className={`w-full text-right px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${
                          selectedAuthority?.id === auth.id 
                            ? 'bg-cyan-50 text-cyan-700 font-bold' 
                            : 'text-black'
                        }`}
                      >
                        {auth.name}
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
                setSelectedAuthority(authority || null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black bg-white"
            >
              {authorities.map((auth) => (
                <option key={auth.id} value={auth.id}>
                  {auth.name}
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
              <h2 className="text-2xl font-bold mb-2">{selectedAuthority.name}</h2>
              <div className="flex items-center gap-6 text-sm">
                <span>👥 {selectedAuthority.userCount || 0} משתמשים</span>
                <span>👨‍💼 {selectedAuthority.managerIds?.length || 0} מנהלים</span>
              </div>
            </div>
            {selectedAuthority.logoUrl && (
              <img
                src={selectedAuthority.logoUrl}
                alt={selectedAuthority.name}
                className="w-20 h-20 rounded-full object-cover border-4 border-white/20"
              />
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {selectedAuthority && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {activeTab === 'analytics' && (
            <AnalyticsDashboard authorityId={selectedAuthority.id} />
          )}
          {activeTab === 'parks' && (
            <ParksManagement authorityId={selectedAuthority.id} />
          )}
          {activeTab === 'groups' && (
            <CommunityGroups authorityId={selectedAuthority.id} />
          )}
          {activeTab === 'events' && (
            <CommunityEvents authorityId={selectedAuthority.id} />
          )}
        </div>
      )}
    </div>
  );
}
