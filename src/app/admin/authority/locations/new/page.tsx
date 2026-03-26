'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import LocationEditor from '@/features/admin/components/locations/LocationEditor';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export default function MunicipalityLocationBuilderPage() {
  const [authorityId,   setAuthorityId]   = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState<string>('');
  const [authorityLat,  setAuthorityLat]  = useState<number | undefined>(undefined);
  const [authorityLng,  setAuthorityLng]  = useState<number | undefined>(undefined);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);

        let aId   = role.authorityIds?.[0] || null;
        let aName = '';
        let aLat: number | undefined;
        let aLng: number | undefined;

        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          const stored = typeof window !== 'undefined'
            ? localStorage.getItem('admin_selected_authority_id') : null;
          const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
          if (target) {
            aId   = target.id;
            aName = typeof target.name === 'string' ? target.name : (target.name?.he || '');
            aLat  = target.coordinates?.lat;
            aLng  = target.coordinates?.lng;
          }
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) {
            const a = auths[0];
            aId   = aId ?? a.id;
            aName = typeof a.name === 'string' ? a.name : (a.name?.he || a.name?.en || '');
            aLat  = a.coordinates?.lat;
            aLng  = a.coordinates?.lng;
          }
        }

        if (!aId) { setError('לא נמצאה רשות משויכת לחשבון זה'); setLoading(false); return; }

        setAuthorityId(aId);
        setAuthorityName(aName);
        if (aLat !== undefined) setAuthorityLat(aLat);
        if (aLng !== undefined) setAuthorityLng(aLng);
      } catch (err: any) {
        setError(err?.message || 'שגיאה בטעינת פרטי הרשות');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="animate-spin text-emerald-500" size={28} />
        <span className="text-slate-600">טוען פרטי רשות...</span>
      </div>
    );
  }

  if (error || !authorityId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error || 'לא ניתן לטעון פרטי רשות'}</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" dir="rtl">
      <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
        <Link
          href="/admin/authority/locations"
          className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={14} />
          חזור לניהול מיקומים
        </Link>
      </div>

      <div className="flex-1 overflow-hidden">
        <LocationEditor
          lockedAuthorityId={authorityId}
          lockedAuthorityName={authorityName}
          defaultStatus="pending"
          redirectPath="/admin/authority/locations"
          initialLat={authorityLat}
          initialLng={authorityLng}
          initialZoom={14}
        />
      </div>
    </div>
  );
}
