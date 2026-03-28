'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import RouteEditor from '@/features/admin/components/routes/RouteEditor';

export default function MunicipalityRouteBuilderPage() {
    const router = useRouter();

    const [authorityId,   setAuthorityId]   = useState<string | null>(null);
    const [authorityName, setAuthorityName] = useState<string>('');
    const [authorityLat,  setAuthorityLat]  = useState<number | undefined>(undefined);
    const [authorityLng,  setAuthorityLng]  = useState<number | undefined>(undefined);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/admin'); return; }

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

                if (!aId) {
                    setError('אין לך הרשאה לנהל מסלולים. פנה למנהל המערכת.');
                    setLoading(false);
                    return;
                }

                setAuthorityId(aId);
                setAuthorityName(aName);
                if (aLat !== undefined) setAuthorityLat(aLat);
                if (aLng !== undefined) setAuthorityLng(aLng);
            } catch (err) {
                console.error('Error checking role:', err);
                setError('שגיאה בטעינת הרשאות. נסה שוב.');
            } finally {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, [router]);

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-cyan-500" size={40} />
                    <p className="text-gray-500 font-bold">טוען הרשאות...</p>
                </div>
            </div>
        );
    }

    if (error || !authorityId) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center" dir="rtl">
                    <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
                    <h2 className="text-lg font-black text-gray-800 mb-2">אין הרשאה</h2>
                    <p className="text-sm text-gray-500 mb-6">{error || 'לא נמצאה רשות משויכת לחשבון.'}</p>
                    <Link href="/admin"
                        className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl font-bold hover:bg-gray-200 transition-all">
                        <ArrowRight size={16} />
                        חזור למרכז הניהול
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col">
            {/* Back nav */}
            <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-2 z-30 shrink-0">
                <Link
                    href="/admin/authority/routes"
                    className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition-all active:scale-95"
                >
                    <ArrowRight size={15} />
                    חזור לניהול מסלולים
                </Link>
            </div>

            <div className="flex-1 overflow-hidden">
                <RouteEditor
                    lockedAuthorityId={authorityId}
                    lockedAuthorityName={authorityName}
                    defaultStatus="pending"
                    redirectPath="/admin/authority/routes"
                    initialLat={authorityLat}
                    initialLng={authorityLng}
                    initialZoom={14}
                />
            </div>
        </div>
    );
}
