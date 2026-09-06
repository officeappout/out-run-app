'use client';

/**
 * QrCodeGenerator — QR code generator for a Smart Link, rendered inside
 * the `/admin/links` edit drawer for any link with `useSmartLink: true`.
 *
 * Local-only: uses the `qrcode` npm package (no network calls, no
 * external QR service ever sees the link). Logo is loaded once from a
 * fixed project asset (`/assets/logo/logo-mark.png`) — never uploaded.
 *
 * See `src/features/admin/services/qr-generator.ts` for the actual
 * generation logic (color contrast, quiet zone, logo overlay sizing) —
 * this component is UI only: color pickers, live preview, downloads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, ShieldAlert } from 'lucide-react';
import {
  computeContrastRatio,
  generateQrPngDataUrl,
  generateQrSvgString,
  isContrastSafe,
  MIN_PRINT_PNG_WIDTH,
  sanitizeFilename,
} from '@/features/admin/services/qr-generator';

const LOGO_PATH = '/assets/logo/logo-mark.png';
const DEFAULT_DARK = '#0F172A';
const DEFAULT_LIGHT = '#FFFFFF';

async function loadLogoAsDataUrl(): Promise<string> {
  const res = await fetch(LOGO_PATH);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to load logo asset'));
    reader.readAsDataURL(blob);
  });
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

interface QrCodeGeneratorProps {
  /** The full tracking URL to encode, e.g. 'https://outrun.co.il/r/abc123'. */
  value: string;
  /** Used to build the downloaded filename. */
  friendlyName: string;
}

export default function QrCodeGenerator({ value, friendlyName }: QrCodeGeneratorProps) {
  const [dark, setDark] = useState(DEFAULT_DARK);
  const [light, setLight] = useState(DEFAULT_LIGHT);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLogoAsDataUrl()
      .then((url) => { if (!cancelled) setLogoDataUrl(url); })
      .catch(() => { if (!cancelled) setLogoLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const contrastRatio = useMemo(() => computeContrastRatio(dark, light), [dark, light]);
  const contrastSafe = useMemo(() => isContrastSafe({ dark, light }), [dark, light]);

  useEffect(() => {
    let cancelled = false;
    generateQrSvgString({ value, colors: { dark, light }, logoDataUrl })
      .then((svg) => { if (!cancelled) setPreviewSvg(svg); })
      .catch(() => { if (!cancelled) setPreviewSvg(null); });
    return () => { cancelled = true; };
  }, [value, dark, light, logoDataUrl]);

  const previewImgSrc = useMemo(() => {
    if (!previewSvg) return null;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
  }, [previewSvg]);

  const handleDownloadPng = useCallback(async () => {
    setDownloading('png');
    setDownloadError(null);
    try {
      const dataUrl = await generateQrPngDataUrl({
        value, colors: { dark, light }, logoDataUrl, widthPx: MIN_PRINT_PNG_WIDTH,
      });
      triggerDownload(dataUrl, sanitizeFilename(friendlyName, 'png'));
    } catch (err) {
      console.error('[QrCodeGenerator] PNG generation failed:', err);
      setDownloadError('יצירת ה-PNG נכשלה');
    } finally {
      setDownloading(null);
    }
  }, [value, dark, light, logoDataUrl, friendlyName]);

  const handleDownloadSvg = useCallback(async () => {
    setDownloading('svg');
    setDownloadError(null);
    try {
      const svg = await generateQrSvgString({ value, colors: { dark, light }, logoDataUrl });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, sanitizeFilename(friendlyName, 'svg'));
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[QrCodeGenerator] SVG generation failed:', err);
      setDownloadError('יצירת ה-SVG נכשלה');
    } finally {
      setDownloading(null);
    }
  }, [value, dark, light, logoDataUrl, friendlyName]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          מחולל QR
        </span>
        <span className="text-[11px] text-slate-400" dir="ltr">{value}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto,1fr]">
        {/* Live preview */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2">
            {previewImgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URI, not a static asset
              <img src={previewImgSrc} alt="תצוגה מקדימה של קוד QR" className="h-full w-full" />
            ) : (
              <span className="text-xs text-slate-400">טוען תצוגה מקדימה…</span>
            )}
          </div>
          {logoLoadFailed && (
            <span className="text-[11px] text-amber-600">לוגו לא נטען — QR ייוצר בלי לוגו</span>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              צבע כהה
              <input
                type="color"
                value={dark}
                onChange={(e) => setDark(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-slate-300"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              צבע רקע
              <input
                type="color"
                value={light}
                onChange={(e) => setLight(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-slate-300"
              />
            </label>
          </div>

          {!contrastSafe && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              ניגודיות נמוכה מדי ({contrastRatio.toFixed(1)}:1) — QR בהיר על רקע בהיר עלול לא להיסרק. ההורדה חסומה עד שתבחר צבעים עם ניגודיות מספקת.
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={downloading !== null || !contrastSafe}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {downloading === 'png' ? 'מייצר…' : `PNG (${MIN_PRINT_PNG_WIDTH}px)`}
            </button>
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={downloading !== null || !contrastSafe}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {downloading === 'svg' ? 'מייצר…' : 'SVG'}
            </button>
          </div>

          {downloadError && <p className="text-xs text-rose-600">{downloadError}</p>}

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            סרוק בדיקה לפני שליחה לדפוס.
          </div>
        </div>
      </div>
    </div>
  );
}
