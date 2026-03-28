'use client';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import { Loader2 } from 'lucide-react';
import SessionsDashboard from '@/features/admin/components/authority-manager/SessionsDashboard';

const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

export default function AdminDashboardPage() {
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveAuthority = useCallback(async (uid: string) => {
    try {
      const authorities = await getAuthoritiesByManager(uid);
      if (!authorities.length) { setLoading(false); return; }

      const savedId = typeof window !== 'undefined' ? localStorage.getItem(AUTHORITY_STORAGE_KEY) : null;
      const matched = savedId ? authorities.find((a) => a.id === savedId) : null;
      const authority = matched ?? authorities[0];
      setAuthorityId(authority.id);
    } catch (err) {
      console.error('[DashboardPage] authority resolution failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let currentUid: string | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      currentUid = user.uid;
      await resolveAuthority(user.uid);
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === AUTHORITY_STORAGE_KEY && currentUid) {
        resolveAuthority(currentUid);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [resolveAuthority]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!authorityId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400" dir="rtl">
        <p className="text-sm">לא נמצאה רשות משויכת</p>
      </div>
    );
  }

  return <SessionsDashboard authorityId={authorityId} />;
}
