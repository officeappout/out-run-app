'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { getPark } from '@/features/admin/services/parks.service';
import LocationEditor from '@/features/admin/components/locations/LocationEditor';
import type { Park } from '@/features/parks/core/types/park.types';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export default function EditLocationPage() {
  const params = useParams();
  const parkId = params?.id as string;

  const [park,          setPark]          = useState<Park | null>(null);
  const [authorityId,   setAuthorityId]   = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState<string>('');
  const [authorityLat,  setAuthorityLat]  = useState<number | undefined>(undefined);
  const [authorityLng,  setAuthorityLng]  = useState<number | undefined>(undefined);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!parkId) { setError('מזהה מיקום חסר'); setLoading(false); return; }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const [role, fetchedPark] = await Promise.all([
          checkUserRole(user.uid),
          getPark(parkId),
        ]);

        if (!fetchedPark) { setError('המיקום לא נמצא'); setLoading(false); return; }

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

        // Guard: authority manager can only edit parks that belong to their authority
        if (!role.isSuperAdmin && aId && fetchedPark.authorityId && fetchedPark.authorityId !== aId) {
          setError('אין לך הרשאה לערוך מיקום זה');
          setLoading(false);
          return;
        }

        setPark(fetchedPark);
        setAuthorityId(aId);
        setAuthorityName(aName);
        if (aLat !== undefined) setAuthorityLat(aLat);
        if (aLng !== undefined) setAuthorityLng(aLng);
      } catch (err: any) {
        setError(err?.message || 'שגיאה בטעינת המיקום');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [parkId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" dir="rtl">
        <Loader2 className="animate-spin text-blue-500" size={28} />
        <span className="text-slate-600">טוען מיקום...</span>
      </div>
    );
  }

  if (error || !park) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error || 'לא ניתן לטעון את המיקום'}</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" dir="rtl">
      <div className="flex-shrink-0 px-5 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
        <Link
          href="/admin/authority/locations"
          className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition-all active:scale-95"
        >
          <ArrowLeft size={15} />
          חזור לניהול מיקומים
        </Link>
        <span className="text-xs text-slate-400 font-mono">{parkId}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <LocationEditor
          lockedAuthorityId={authorityId ?? undefined}
          lockedAuthorityName={authorityName}
          defaultStatus={park.contentStatus === 'published' ? 'published' : 'pending'}
          redirectPath="/admin/authority/locations"
          initialLat={authorityLat}
          initialLng={authorityLng}
          initialZoom={15}
          initialData={park}
        />
      </div>
    </div>
  );
}
