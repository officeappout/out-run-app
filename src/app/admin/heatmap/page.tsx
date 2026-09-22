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
import { getParksByAuthority } from '@/features/parks';
import LiveHeatMap from '@/features/heatmap/components/LiveHeatMap';
import PopularRoutesCard from '@/features/heatmap/components/PopularRoutesCard';
import PopularParksCard from '@/features/heatmap/components/PopularParksCard';
import { Loader2, ArrowLeft, MapPinOff } from 'lucide-react';
import Link from 'next/link';

const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

/**
 * Average of an authority's own parks' real coordinates — used ONLY when
 * the authority doc has no usable `location` field. Never another
 * authority's coordinates (00-MASTER-PLAN.md §13.11 — this used to fall
 * back to Sderot's real coordinates for ANY authority without a location).
 * `parks` is world-readable (firestore.rules: `allow read: if true`), so
 * this is safe for an authority manager to call directly.
 */
async function computeParksCenter(authorityId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const parks = await getParksByAuthority(authorityId);
    const withRealCoords = parks.filter(
      (p) => p.location && (p.location.lat !== 0 || p.location.lng !== 0),
    );
    if (withRealCoords.length === 0) return null;
    const lat = withRealCoords.reduce((sum, p) => sum + p.location.lat, 0) / withRealCoords.length;
    const lng = withRealCoords.reduce((sum, p) => sum + p.location.lng, 0) / withRealCoords.length;
    return { lat, lng };
  } catch {
    return null;
  }
}

export default function HeatmapPage() {
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [center, setCenter] = useState<{ lat: number; lng: number } | undefined>();
  const [locationNotConfigured, setLocationNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  // Resolves the map center for ONE authority: its own `location` field if
  // present and complete; otherwise the average of its own parks' real
  // coordinates; otherwise leaves `center` unset entirely, which
  // LiveHeatMap resolves to a neutral whole-of-Israel view — never another
  // city's coordinates.
  const resolveCenterFor = useCallback(async (aId: string, location: unknown) => {
    const loc = location as { lat?: unknown; lng?: unknown } | null | undefined;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      setCenter({ lat: loc.lat, lng: loc.lng });
      setLocationNotConfigured(false);
      return;
    }
    setLocationNotConfigured(true);
    const parksCenter = await computeParksCenter(aId);
    setCenter(parksCenter ?? undefined);
  }, []);

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
          await resolveCenterFor(target.id, target.location);
        }
      } else {
        const auths = await getAuthoritiesByManager(uid);
        if (auths.length > 0) {
          aId = auths[0].id;
          aName =
            typeof auths[0].name === 'string'
              ? auths[0].name
              : (auths[0].name as any)?.he || '';
          await resolveCenterFor(auths[0].id, auths[0].location);
        }
      }

      setAuthorityId(aId);
      setAuthorityName(aName);
    } catch (err) {
      console.error('[HeatmapPage] Error resolving authority:', err);
    } finally {
      setLoading(false);
    }
  }, [resolveCenterFor]);

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

      {locationNotConfigured && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <MapPinOff size={14} className="flex-shrink-0" />
          <span className="font-semibold">
            מיקום הרשות לא מוגדר — {center
              ? 'המפה ממורכזת לפי הגינות של הרשות'
              : 'מוצגת תצוגת ארץ כללית'}.
          </span>
        </div>
      )}

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
