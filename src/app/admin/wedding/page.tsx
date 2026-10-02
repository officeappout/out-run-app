'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { isWeddingOwner } from '@/features/wedding/wedding.config';
import { WeddingPlanner } from '@/features/wedding/components/WeddingPlanner';

/**
 * /admin/wedding — the owner's personal wedding planner.
 * Client gate mirrors the server gate in /api/admin/wedding (super admin +
 * owner email); the server is the real boundary, this only avoids
 * rendering the page for anyone else.
 */
export default function WeddingPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/login');
        return;
      }
      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin || !isWeddingOwner(user.email)) {
          router.push('/admin');
          return;
        }
        setAllowed(true);
      } catch {
        router.push('/admin');
      }
    });
    return () => unsub();
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
      </div>
    );
  }
  return <WeddingPlanner />;
}
