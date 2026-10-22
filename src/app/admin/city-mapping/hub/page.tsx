'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/city-mapping/hub — city-mapping hub (docs/admin/CITY-MAPPING-HUB-DESIGN.md),
 * behind enable_city_mapping_hub (default OFF, the live value — no super-admin
 * override). Guard: exactly /admin/city-mapping's (super admin or system admin),
 * plus every hub read re-checks requireSuperAdminApi + the flag on the server.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import CityMappingHub from '@/features/admin/components/city-mapping-hub/CityMappingHub';
import { useHubUrlState } from '@/features/admin/components/city-mapping-hub/useHubUrlState';
import type { ModeratorInfo } from '@/features/admin/services/moderation.service';

function HubWithUrlState({ admin }: { admin: ModeratorInfo | null }) {
  const [state, setState] = useHubUrlState();
  return <CityMappingHub state={state} onStateChange={setState} admin={admin} />;
}

export default function CityMappingHubPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  /** The moderator identity for reviewedBy / audit: the signed-in auth user (uid + display name or email). */
  const [admin, setAdmin] = useState<ModeratorInfo | null>(null);
  const { rawFlags, ready } = useFeatureFlags();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/login'); return; }
      try {
        const roleInfo = await checkUserRole(user.uid);
        const ok = !!roleInfo.isSuperAdmin || !!roleInfo.isSystemAdmin;
        if (!ok) { router.push('/admin'); return; }
        setAdmin({ adminId: user.uid, adminName: user.displayName || user.email || user.uid });
        setAuthorized(true);
      } catch (error) {
        console.error('[city-mapping/hub] auth check failed', error);
        router.push('/admin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (!authorized || !ready) {
    return <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> טוען…</div>;
  }
  if (rawFlags.enableCityMappingHub !== true) {
    return (
      <div dir="rtl" className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-sm">
        <h1 className="mb-2 text-lg font-black">מרכז מיפוי ערים — כבוי</h1>
        <p className="text-slate-600">הדף מאחורי הדגל <code>enable_city_mapping_hub</code>. מדליקים אותו בהגדרות המערכת.</p>
        <div className="mt-4 flex gap-2">
          <Link href="/admin/system-settings" className="rounded-xl border border-slate-200 px-3 py-2 font-bold hover:bg-slate-50">להגדרות המערכת</Link>
          <Link href="/admin/city-mapping" className="rounded-xl border border-slate-200 px-3 py-2 font-bold hover:bg-slate-50">לדף מיפוי העיר</Link>
        </div>
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <HubWithUrlState admin={admin} />
    </Suspense>
  );
}
