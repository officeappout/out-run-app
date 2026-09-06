'use client';

/**
 * /admin/links — מרכז ניהול קישורים שיווקיים (UTM Registry).
 *
 * The Growth Hub's single source of truth for trackable smart links.
 * Each row mints a marketing link that:
 *   1. Carries `utm_source / utm_medium / utm_campaign` query params on
 *      every visit so the onboarding pipeline can populate
 *      `users/{uid}.marketingAttribution` (see
 *      `src/lib/marketingAttribution.ts`).
 *   2. Routes through `/r/[id]` so we can atomically bump a per-link
 *      counter via Admin SDK (no client auth required) — device/bot
 *      filtering + (opt-in per link) direct-to-store Smart Link routing
 *      live in `link-click-handler.ts`, shared with the legacy
 *      `/api/links/[id]/click` path kept for back-compat.
 *   3. Surfaces in the Funnel Dashboard's `Campaign / Source / Medium`
 *      filter dropdowns once a user has been attributed to it.
 *
 * The page is intentionally lean — no charts, no funnels, no analytics.
 * It is a campaign-link directory; the funnel dashboard at
 * `/admin/analytics` is where the conversion-quality story lives.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Link2,
  Plus,
  Copy,
  Check,
  X,
  Trash2,
  ExternalLink,
  Edit3,
  RefreshCw,
  Loader2,
  TrendingUp,
  PowerOff,
  BarChart2,
} from 'lucide-react';
import {
  createMarketingLink,
  DEFAULT_LINK_DESTINATIONS,
  deleteMarketingLink,
  getMarketingLinks,
  LINK_TYPES,
  SHORT_LINK_DOMAIN,
  type LinkType,
  type MarketingLink,
  updateMarketingLink,
} from '@/features/admin/services/marketing-links.service';
import QrCodeGenerator from '@/features/admin/components/QrCodeGenerator';

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  qr_physical: 'QR פיזי (רולאפ/שילוט)',
  web: 'קישור אתר',
  paid_ads: 'פרסום ממומן',
  email: 'מייל',
  partner: 'שותף',
  other: 'אחר',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dateFmt = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  try {
    return dateFmt.format(d);
  } catch {
    return '—';
  }
}

// Read from SHORT_LINK_DOMAIN (env var, never window.location.origin) so a
// planned domain cutover (outrun.co.il → appout.co.il) is a single Vercel
// env var change — the admin panel could in principle be viewed from a
// different host (a Vercel preview URL, a future staging domain) than the
// canonical short-link domain, and window.location.origin would silently
// bake that in.
function getTrackingApiUrl(id: string): string {
  return `${SHORT_LINK_DOMAIN}/r/${id}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminMarketingLinksPage() {
  const [links, setLinks] = useState<MarketingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getMarketingLinks();
      setLinks(rows);
    } catch (err) {
      console.error('[admin/links] load failed:', err);
      setError('שגיאה בטעינת רשימת הקישורים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const totalClicks = useMemo(
    () => links.reduce((sum, l) => sum + (l.clicksCount ?? 0), 0),
    [links],
  );
  const activeCount = useMemo(
    () => links.filter((l) => l.isActive).length,
    [links],
  );

  const handleCopy = useCallback(async (id: string, url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1600);
    } catch (err) {
      console.warn('[admin/links] clipboard write failed:', err);
    }
  }, []);

  const handleToggleActive = useCallback(
    async (link: MarketingLink) => {
      setBusyId(link.id);
      try {
        await updateMarketingLink(link.id, { isActive: !link.isActive });
        setLinks((prev) =>
          prev.map((l) =>
            l.id === link.id ? { ...l, isActive: !link.isActive } : l,
          ),
        );
      } catch (err) {
        console.error('[admin/links] toggle failed:', err);
        setError('הפעלה/השבתה נכשלה');
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const handleDelete = useCallback(async (link: MarketingLink) => {
    if (!confirm(`למחוק את הקישור "${link.friendlyName}"?`)) return;
    setBusyId(link.id);
    try {
      await deleteMarketingLink(link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } catch (err) {
      console.error('[admin/links] delete failed:', err);
      setError('מחיקה נכשלה');
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-500">
            <Link2 className="h-5 w-5" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">
              Marketing UTM Registry
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            מרכז ניהול קישורים שיווקיים
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            יצירה, מעקב ועריכה של קישורים עם פרמטרי UTM. כל לחיצה נספרת
            אוטומטית ומוזרמת ל-Funnel Dashboard.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadLinks}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            רענון
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            קישור חדש
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="סה״כ קישורים"
          value={links.length.toLocaleString('he-IL')}
          icon={<Link2 className="h-4 w-4 text-slate-500" aria-hidden />}
        />
        <KpiCard
          label="קישורים פעילים"
          value={activeCount.toLocaleString('he-IL')}
          tone="emerald"
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />}
        />
        <KpiCard
          label="סה״כ לחיצות"
          value={totalClicks.toLocaleString('he-IL')}
          tone="indigo"
          icon={<TrendingUp className="h-4 w-4 text-indigo-600" aria-hidden />}
        />
        <KpiCard
          label="לא פעילים"
          value={(links.length - activeCount).toLocaleString('he-IL')}
          tone="slate"
          icon={<PowerOff className="h-4 w-4 text-slate-400" aria-hidden />}
        />
      </section>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-md p-1 hover:bg-rose-100"
            aria-label="dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">שם פנימי</th>
                <th className="px-4 py-3">ערוץ</th>
                <th className="px-4 py-3">מקור</th>
                <th className="px-4 py-3">קמפיין</th>
                <th className="px-4 py-3">מדיה</th>
                <th className="px-4 py-3">לחיצות</th>
                <th className="px-4 py-3">נוצר</th>
                <th className="px-4 py-3">סטטוס</th>
                <th className="px-4 py-3 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && links.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden />
                    טוען קישורים…
                  </td>
                </tr>
              )}
              {!loading && links.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    אין עדיין קישורים. לחץ "קישור חדש" כדי להתחיל.
                  </td>
                </tr>
              )}
              {links.map((link) => {
                const trackingUrl = getTrackingApiUrl(link.id);
                return (
                  <tr key={link.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900">
                        {link.friendlyName}
                      </div>
                      <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={link.oneLinkUrl}>
                        {link.oneLinkUrl}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-700">{LINK_TYPE_LABELS[link.linkType]}</div>
                      {link.physicalLocation && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={link.physicalLocation}>
                          {link.physicalLocation}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-700">
                      {link.utmSource || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-700">
                      {link.utmCampaign || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-700">
                      {link.utmMedium || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top font-semibold text-indigo-700">
                      {link.clicksCount.toLocaleString('he-IL')}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-500">
                      {formatDate(link.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(link)}
                        disabled={busyId === link.id}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                          link.isActive
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        {link.isActive ? 'פעיל' : 'כבוי'}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(link.id, trackingUrl)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="העתק קישור מעקב"
                        >
                          {copiedId === link.id ? (
                            <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="פתח קישור (יספור לחיצה)"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                        <Link
                          href={`/admin/links/${link.id}`}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="אנליטיקה"
                        >
                          <BarChart2 className="h-4 w-4" aria-hidden />
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(link);
                            setDrawerOpen(true);
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="ערוך"
                        >
                          <Edit3 className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(link)}
                          disabled={busyId === link.id}
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          title="מחק"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create / edit drawer */}
      <LinkDrawer
        open={drawerOpen}
        link={editing}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setDrawerOpen(false);
          setEditing(null);
          await loadLinks();
        }}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone = 'slate',
  icon,
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'indigo';
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-100 bg-emerald-50'
      : tone === 'indigo'
        ? 'border-indigo-100 bg-indigo-50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-2xl border ${toneClass} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

interface LinkDrawerProps {
  open: boolean;
  link: MarketingLink | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function LinkDrawer({ open, link, onClose, onSaved }: LinkDrawerProps) {
  const isEdit = !!link;
  const [friendlyName, setFriendlyName] = useState('');
  const [oneLinkUrl, setOneLinkUrl] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('web');
  const [physicalLocation, setPhysicalLocation] = useState('');
  const [useSmartLink, setUseSmartLink] = useState(false);
  const [iosUrl, setIosUrl] = useState('');
  const [androidUrl, setAndroidUrl] = useState('');
  const [desktopUrl, setDesktopUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCopied, setPreviewCopied] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Reset the form whenever the drawer opens, so a fresh "create" never
  // leaks state from a prior "edit".
  useEffect(() => {
    if (!open) return;
    if (link) {
      setFriendlyName(link.friendlyName);
      setOneLinkUrl(link.oneLinkUrl);
      setUtmSource(link.utmSource ?? '');
      setUtmMedium(link.utmMedium ?? '');
      setUtmCampaign(link.utmCampaign ?? '');
      setLinkType(link.linkType);
      setPhysicalLocation(link.physicalLocation ?? '');
      setUseSmartLink(link.useSmartLink);
      setIosUrl(link.iosUrl ?? '');
      setAndroidUrl(link.androidUrl ?? '');
      setDesktopUrl(link.desktopUrl ?? '');
      setFallbackUrl(link.fallbackUrl ?? '');
      setNotes(link.notes ?? '');
      setIsActive(link.isActive);
    } else {
      setFriendlyName('');
      setOneLinkUrl('');
      setUtmSource('');
      setUtmMedium('');
      setUtmCampaign('');
      setLinkType('web');
      setPhysicalLocation('');
      setUseSmartLink(false);
      setIosUrl('');
      setAndroidUrl('');
      setDesktopUrl('');
      setFallbackUrl('');
      setNotes('');
      setIsActive(true);
    }
    setDrawerError(null);
    setPreviewCopied(false);
  }, [open, link]);

  // The preview MUST show our own tracking URL (`/r/{id}` + utm), never
  // the onelink.to/destination URL — a copy-pasted preview is exactly as
  // leaky as an unrouted physical QR code (same bug, every channel).
  // Only available once a real id exists (i.e. editing an already-saved
  // link) — a brand-new, unsaved link has no id yet to build the URL
  // with.
  const previewUrl = useMemo(() => {
    if (!isEdit || !link) return '';
    const base = getTrackingApiUrl(link.id);
    try {
      const url = new URL(base);
      if (utmSource.trim()) url.searchParams.set('utm_source', utmSource.trim());
      if (utmMedium.trim()) url.searchParams.set('utm_medium', utmMedium.trim());
      if (utmCampaign.trim()) url.searchParams.set('utm_campaign', utmCampaign.trim());
      return url.toString();
    } catch {
      return base;
    }
  }, [isEdit, link, utmSource, utmMedium, utmCampaign]);

  const handleCopyPreview = useCallback(async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setPreviewCopied(true);
      setTimeout(() => setPreviewCopied(false), 1600);
    } catch (err) {
      console.warn('[admin/links] preview copy failed:', err);
    }
  }, [previewUrl]);

  const handleSubmit = useCallback(async () => {
    if (!friendlyName.trim()) {
      setDrawerError('שם פנימי הוא שדה חובה');
      return;
    }
    if (!useSmartLink && !oneLinkUrl.trim()) {
      setDrawerError('כתובת URL היא שדה חובה (אלא אם מסומן Smart Link)');
      return;
    }
    setSaving(true);
    setDrawerError(null);
    try {
      const payload = {
        friendlyName,
        oneLinkUrl,
        utmSource: utmSource.trim() || null,
        utmMedium: utmMedium.trim() || null,
        utmCampaign: utmCampaign.trim() || null,
        linkType,
        physicalLocation: physicalLocation.trim() || null,
        useSmartLink,
        iosUrl: iosUrl.trim() || null,
        androidUrl: androidUrl.trim() || null,
        desktopUrl: desktopUrl.trim() || null,
        fallbackUrl: fallbackUrl.trim() || null,
        notes,
        isActive,
      };
      if (isEdit && link) {
        await updateMarketingLink(link.id, payload);
      } else {
        await createMarketingLink(payload);
      }
      await onSaved();
    } catch (err) {
      console.error('[admin/links] save failed:', err);
      setDrawerError('שמירת הקישור נכשלה');
    } finally {
      setSaving(false);
    }
  }, [
    friendlyName, oneLinkUrl, utmSource, utmMedium, utmCampaign, linkType,
    physicalLocation, useSmartLink, iosUrl, androidUrl, desktopUrl, fallbackUrl,
    notes, isActive, isEdit, link, onSaved,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <button
        type="button"
        aria-label="סגור"
        className="flex-1 bg-slate-900/40"
        onClick={() => (!saving ? onClose() : undefined)}
      />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? 'עריכת קישור שיווקי' : 'יצירת קישור שיווקי חדש'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              הפרמטרים יעודכנו מיידית ל-Funnel Dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <Field label="שם פנימי" required>
            <input
              type="text"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="למשל: קמפיין מנויים אפריל"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </Field>

          <Field label="כתובת היעד (URL)" required={!useSmartLink}>
            <input
              type="url"
              dir="ltr"
              value={oneLinkUrl}
              onChange={(e) => setOneLinkUrl(e.target.value)}
              placeholder="https://outrun.co.il/gateway"
              disabled={useSmartLink}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100 disabled:text-slate-400"
            />
            {useSmartLink && (
              <span className="mt-1 block text-xs text-slate-500">
                לא בשימוש כש-Smart Link מסומן — הניתוב נקבע לפי המכשיר למטה.
              </span>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="utm_source">
              <input
                type="text"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="instagram"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </Field>
            <Field label="utm_medium">
              <input
                type="text"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="social"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </Field>
            <Field label="utm_campaign">
              <input
                type="text"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                placeholder="spring_2026"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ערוץ">
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as LinkType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {LINK_TYPES.map((t) => (
                  <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="מיקום פיזי (ל-QR פיזי בלבד)">
              <input
                type="text"
                value={physicalLocation}
                onChange={(e) => setPhysicalLocation(e.target.value)}
                placeholder="גן העירוני, רעננה"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </Field>
          </div>

          {/* Smart Link — device-based routing straight to the store,
              bypassing onelink.to. Opt-in per link (see useSmartLink doc
              comment in marketing-links.service.ts) — existing links are
              never silently switched over. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useSmartLink}
                onChange={(e) => setUseSmartLink(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-semibold text-slate-800">
                Smart Link — ניתוב ישיר לחנות לפי מכשיר (בלי onelink.to)
              </span>
            </label>

            {useSmartLink && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="iOS URL (ריק = ברירת מחדל)">
                  <input
                    type="url"
                    dir="ltr"
                    value={iosUrl}
                    onChange={(e) => setIosUrl(e.target.value)}
                    placeholder={DEFAULT_LINK_DESTINATIONS.iosUrl ?? ''}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </Field>
                <Field label="Android URL (ריק = ברירת מחדל)">
                  <input
                    type="url"
                    dir="ltr"
                    value={androidUrl}
                    onChange={(e) => setAndroidUrl(e.target.value)}
                    placeholder={DEFAULT_LINK_DESTINATIONS.androidUrl ?? ''}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </Field>
                <Field label="Desktop URL (ריק = ברירת מחדל)">
                  <input
                    type="url"
                    dir="ltr"
                    value={desktopUrl}
                    onChange={(e) => setDesktopUrl(e.target.value)}
                    placeholder={DEFAULT_LINK_DESTINATIONS.desktopUrl ?? ''}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </Field>
                <Field label="Fallback URL (ריק = ברירת מחדל)">
                  <input
                    type="url"
                    dir="ltr"
                    value={fallbackUrl}
                    onChange={(e) => setFallbackUrl(e.target.value)}
                    placeholder={DEFAULT_LINK_DESTINATIONS.fallbackUrl ?? ''}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </Field>
              </div>
            )}
          </div>

          <Field label="הערות פנים-ארגוניות (אופציונלי)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="פירוט פנימי על מטרת הקמפיין, קהל יעד, וכו'."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-700">קישור פעיל</span>
          </label>

          {/* Live preview */}
          <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Live Preview
              </span>
              <button
                type="button"
                onClick={handleCopyPreview}
                disabled={!previewUrl}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
              >
                {previewCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    הועתק
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    העתק
                  </>
                )}
              </button>
            </div>
            <div dir="ltr" className="break-all text-left font-mono text-xs text-emerald-900">
              {previewUrl || (
                <span className="text-emerald-700/60">
                  {isEdit
                    ? 'אין תצוגה מקדימה זמינה'
                    : 'התצוגה המקדימה זמינה לאחר השמירה הראשונה (הקישור צריך מזהה)'}
                </span>
              )}
            </div>
          </div>

          {useSmartLink && previewUrl && (
            <QrCodeGenerator value={previewUrl} friendlyName={friendlyName} />
          )}

          {drawerError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {drawerError}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? 'עדכון קישור' : 'יצירת קישור'}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
