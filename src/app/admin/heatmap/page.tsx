'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  getAuthoritiesByManager,
  getAllAuthorities,
} from '@/features/admin/services/authority.service';
import LiveHeatMap from '@/features/heatmap/components/LiveHeatMap';
import PopularRoutesCard from '@/features/heatmap/components/PopularRoutesCard';
import PopularParksCard from '@/features/heatmap/components/PopularParksCard';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

export default function HeatmapPage() {
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [center, setCenter] = useState<{ lat: number; lng: number } | undefined>();
  const [loading, setLoading] = useState(true);

  const resolveAuthority = useCallback(async (uid: string) => {
    try {
      const role = await checkUserRole(uid);
      let aId: string | null = role.authorityIds?.[0] || null;
      let aName = '';

      if (role.isSuperAdmin) {
        const allAuths = await getAllAuthorities(undefined, true);
        const savedId =
          typeof window !== 'undefined'
            ? localStorage.getItem(AUTHORITY_STORAGE_KEY)
            : null;
        const target =
          (savedId && allAuths.find((a) => a.id === savedId)) ?? allAuths[0];
        if (target) {
          aId = target.id;
          aName =
            typeof target.name === 'string'
              ? target.name
              : target.name?.he || '';
          if (target.location) {
            setCenter({
              lat: (target.location as any).lat ?? 31.525,
              lng: (target.location as any).lng ?? 34.595,
            });
          }
        }
      } else {
        const auths = await getAuthoritiesByManager(uid);
        if (auths.length > 0) {
          aId = auths[0].id;
          aName =
            typeof auths[0].name === 'string'
              ? auths[0].name
              : (auths[0].name as any)?.he || '';
          if (auths[0].location) {
            setCenter({
              lat: (auths[0].location as any).lat ?? 31.525,
              lng: (auths[0].location as any).lng ?? 34.595,
            });
          }
        }
      }

      setAuthorityId(aId);
      setAuthorityName(aName);
    } catch (err) {
      console.error('[HeatmapPage] Error resolving authority:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        resolveAuthority(user.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [resolveAuthority]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!authorityId) {
    return (
      <div className="p-6 text-center text-gray-500" dir="rtl">
        <p>לא נמצאה רשות מנהלת. ודא שאתה מוקצה לרשות.</p>
        <Link href="/admin/dashboard" className="text-cyan-500 mt-3 inline-block">
          חזרה לדשבורד
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/admin/dashboard"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            מפת חום חיה — {authorityName}
          </h1>
          <p className="text-xs text-gray-500">
            נתונים מצטברים בלבד • ללא מידע מזהה
          </p>
        </div>
      </div>

      {/* Heatmap */}
      <div className="w-full h-[calc(100vh-260px)] min-h-[500px] rounded-xl overflow-hidden">
        <LiveHeatMap authorityId={authorityId} center={center} />
      </div>

      {/* Top routes by usage — sits below the map */}
      <PopularRoutesCard authorityId={authorityId} />

      {/* Top parks by monthly visit count — mirrors the routes card */}
      <PopularParksCard authorityId={authorityId} />
    </div>
  );
}
