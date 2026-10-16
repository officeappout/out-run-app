'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { Eye, X } from 'lucide-react';
import { db } from '@/lib/firebase';

/**
 * "צפה כרשות" — OUT staff open a city's own portal exactly as its manager
 * sees it (audit 15.10.2026: it was reachable only by typing URLs, and the
 * city in view was an invisible localStorage value). The portal pages
 * already read the selected city from this key.
 */
export const SELECTED_AUTHORITY_KEY = 'admin_selected_authority_id';

export function ViewAsCityButton({ authorityId, name }: { authorityId: string; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try { localStorage.setItem(SELECTED_AUTHORITY_KEY, authorityId); } catch { /* storage blocked: the portal falls back to its picker */ }
        router.push('/admin/dashboard');
      }}
      className="p-2 text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors"
      title={`צפה בפורטל של ${name} כמו שמנהל הרשות רואה אותו`}
      aria-label={`צפה כרשות: ${name}`}
    >
      <Eye size={18} />
    </button>
  );
}

const PORTAL_PREFIXES = ['/admin/dashboard', '/admin/authority-manager', '/admin/heatmap', '/admin/authority/'];

/**
 * A persistent "צופה כ: <עיר>" bar on the city-portal screens for OUT staff,
 * so actions (status changes, quarantine…) are never taken on an invisible
 * city. Rendered by the admin layout for super/system admins only.
 */
export function ViewingAsBar() {
  const pathname = usePathname() ?? '';
  const [name, setName] = useState<string | null>(null);
  const onPortal = PORTAL_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!onPortal) return;
    let id: string | null = null;
    try { id = localStorage.getItem(SELECTED_AUTHORITY_KEY); } catch { /* ignore */ }
    if (!id) { setName(null); return; }
    let cancelled = false;
    getDoc(doc(db, 'authorities', id))
      .then((s) => {
        if (cancelled) return;
        const n = s.data()?.name;
        setName(typeof n === 'string' ? n : (n?.he as string | undefined) ?? id);
      })
      .catch(() => { if (!cancelled) setName(id); });
    return () => { cancelled = true; };
  }, [onPortal, pathname]);

  if (!onPortal || !name) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-cyan-50 px-4 py-2.5 text-sm text-cyan-900 shadow-[inset_0_0_0_1px_rgba(2,132,199,0.18)]" role="status">
      <span className="flex items-center gap-2 font-semibold">
        <Eye size={16} aria-hidden /> צופה כרשות: <b>{name}</b>
      </span>
      <Link href="/admin/authorities" className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-cyan-800 hover:bg-cyan-100">
        <X size={12} aria-hidden /> החלף רשות
      </Link>
    </div>
  );
}
