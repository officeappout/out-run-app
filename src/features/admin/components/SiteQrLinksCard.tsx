'use client';

/**
 * SiteQrLinksCard — top of /admin/links, behind `enable_site_qr_links`
 * (super admins see it regardless).
 *
 * The marketing site (outrun.co.il/web) renders app-store QR codes that
 * point at three FIXED link ids — see `site-qr-links.ts`. This card shows
 * whether each exists, its clicks, and creates the missing ones with
 * today's store URLs. Changing a destination = editing that link in the
 * table below (or its stats page) — the QR on the site never changes.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { QrCode, Loader2, Plus, BarChart2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import {
  createMarketingLinkWithId,
  SHORT_LINK_DOMAIN,
  type MarketingLink,
} from '@/features/admin/services/marketing-links.service';
import { SITE_QR_LINKS, buildSiteQrLinkInput } from '@/features/admin/services/site-qr-links';

interface Props {
  /** The page's already-loaded rows — the card never re-reads Firestore itself. */
  links: MarketingLink[];
  /** Called after creating, so the page reloads its table. */
  onCreated: () => void;
}

export default function SiteQrLinksCard({ links, onCreated }: Props) {
  const { rawFlags } = useFeatureFlags();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return setIsSuperAdmin(false);
      try {
        const role = await checkUserRole(user.uid, user.email);
        setIsSuperAdmin(!!role.isSuperAdmin);
      } catch {
        setIsSuperAdmin(false);
      }
    });
    return unsub;
  }, []);

  if (!rawFlags.enableSiteQrLinks && !isSuperAdmin) return null;

  const byId = new Map(links.map((l) => [l.id, l]));
  const missing = SITE_QR_LINKS.filter((d) => !byId.has(d.id));

  const createMissing = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const d of missing) {
        await createMarketingLinkWithId(d.id, buildSiteQrLinkInput(d.id, auth.currentUser?.uid));
      }
      onCreated();
    } catch (err) {
      console.error('[admin/links] site QR create failed:', err);
      setError('יצירת הקישורים נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <QrCode className="h-5 w-5 text-emerald-600" aria-hidden />
            קודי QR באתר
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            קודי ה-QR באתר מפנים לשלושת הקישורים האלה. כדי לשנות לאן הם מובילים — עורכים את הקישור
            בטבלה (שדות היעד של הקישור החכם). המזהה לא משתנה, ולכן הקוד באתר לא משתנה.
          </p>
        </div>
        {missing.length > 0 && (
          <button
            type="button"
            onClick={createMissing}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            צור {missing.length === SITE_QR_LINKS.length ? 'את הקישורים' : 'את החסרים'}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {SITE_QR_LINKS.map((d) => {
          const row = byId.get(d.id);
          return (
            <li key={d.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{d.label}</span>
                {row ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {row.isActive ? 'פעיל' : 'כבוי'}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">חסר</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{d.hint}</p>
              <code dir="ltr" className="mt-2 block truncate text-[11px] text-slate-600">
                {SHORT_LINK_DOMAIN}/r/{d.id}
              </code>
              {row && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-700">{(row.clicksCount ?? 0).toLocaleString('he-IL')} סריקות/לחיצות</span>
                  <Link href={`/admin/links/${d.id}`} className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
                    <BarChart2 className="h-3.5 w-3.5" aria-hidden />
                    נתונים
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
