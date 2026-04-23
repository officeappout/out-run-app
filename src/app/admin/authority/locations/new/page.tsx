'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import ParkForm from '@/features/admin/components/parks/ParkForm';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export default function MunicipalityLocationBuilderPage() {
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);

        let aId = role.authorityIds?.[0] || null;
        let aName = '';

        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          const stored = typeof window !== 'undefined'
            ? localStorage.getItem('admin_selected_authority_id') : null;
          const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
          if (target) {
            aId = target.id;
            aName = typeof target.name === 'string' ? target.name : (target.name?.he || '');
          }
        } else {
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) {
            const a = auths[0];
            aId = aId ?? a.id;
            aName = typeof a.name === 'string' ? a.name : (a.name?.he || a.name?.en || '');
          }
        }

        if (!aId) { setError('לא נמצאה רשות משויכת לחשבון זה'); setLoading(false); return; }

        setAuthorityId(aId);
        setAuthorityName(aName);
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
    <div className="min-h-screen flex flex-col" dir="rtl">
      <div className="flex-shrink-0 px-5 py-2.5 border-b border-slate-200 bg-white flex items-center gap-3">
        <Link
          href="/admin/authority/locations"
          className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition-all active:scale-95"
        >
          <ArrowLeft size={15} />
          חזור לניהול מיקומים
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <ParkForm
          lockedAuthorityId={authorityId}
          lockedAuthorityName={authorityName}
          defaultStatus="pending"
          redirectPath="/admin/authority/locations"
        />
      </div>
    </div>
  );
}
