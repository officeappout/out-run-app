'use client';

/**
 * QrCodeGenerator — QR code generator for a Smart Link, rendered inside
 * the `/admin/links` edit drawer for any link with `useSmartLink: true`.
 *
 * Local-only: uses the `qr-code-styling` npm package (no network calls, no
 * external QR service ever sees the link). Logo is loaded once from a
 * fixed project asset (`/assets/logo/logo-mark.png`) — never uploaded.
 *
 * See `src/features/admin/services/qr-generator.ts` for the pure logic
 * (options builder, contrast math, risk heuristic, print-size calculator)
 * — this component is UI only: controls, live preview, downloads.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, ShieldAlert } from 'lucide-react';
import QRCodeStyling from 'qr-code-styling';
import type { CornerSquareType, DotType } from 'qr-code-styling';
import {
  buildQrCodeStylingOptions,
  clampLogoSizeRatio,
  computeEffectiveContrastRatio,
  computeMinPrintWidthCm,
  computeScanRiskLevel,
  LOGO_SIZE_DEFAULT_RATIO,
  LOGO_SIZE_MAX_RATIO,
  LOGO_SIZE_MIN_RATIO,
  MIN_CONTRAST_RATIO,
  MIN_PRINT_PNG_WIDTH,
  sanitizeFilename,
  type ScanRiskLevel,
} from '@/features/admin/services/qr-generator';

const LOGO_PATH = '/assets/logo/logo-mark.png';
const DEFAULT_DARK = '#0F172A';
const DEFAULT_LIGHT = '#FFFFFF';
const DEFAULT_GRADIENT_END = '#7C3AED';
const PREVIEW_SIZE_PX = 220;

const DOT_STYLE_OPTIONS: { value: DotType; label: string }[] = [
  { value: 'square', label: 'ריבועי' },
  { value: 'rounded', label: 'מעוגל' },
  { value: 'dots', label: 'נקודות' },
  { value: 'classy', label: 'Classy' },
];

const CORNER_STYLE_OPTIONS: { value: CornerSquareType; label: string }[] = [
  { value: 'square', label: 'מרובע' },
  { value: 'extra-rounded', label: 'מעוגל' },
  { value: 'dot', label: 'נקודה' },
];

const RISK_DISPLAY: Record<ScanRiskLevel, { icon: string; label: string }> = {
  low: { icon: '🟢', label: 'אמינות גבוהה — מתאים לדפוס גדול ולמרחק' },
  medium: { icon: '🟡', label: 'בדוק היטב לפני דפוס — לוגו גדול או סגנון דקורטיבי' },
  high: { icon: '🔴', label: 'לא מומלץ לדפוס — סיכון גבוה לכשל סריקה' },
};

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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read generated QR blob'));
    reader.readAsDataURL(blob);
  });
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
  const [dotType, setDotType] = useState<DotType>('square');
  const [cornerSquareType, setCornerSquareType] = useState<CornerSquareType>('square');
  const [logoSizeRatio, setLogoSizeRatio] = useState(LOGO_SIZE_DEFAULT_RATIO);
  const [logoPadding, setLogoPadding] = useState(true);
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [gradientEndColor, setGradientEndColor] = useState(DEFAULT_GRADIENT_END);
  const [scanDistanceMeters, setScanDistanceMeters] = useState(1);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewInstanceRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLogoAsDataUrl()
      .then((url) => { if (!cancelled) setLogoDataUrl(url); })
      .catch(() => { if (!cancelled) setLogoLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const activeGradientEndColor = gradientEnabled ? gradientEndColor : null;

  const contrastRatio = useMemo(
    () => computeEffectiveContrastRatio({ dark, light }, activeGradientEndColor),
    [dark, light, activeGradientEndColor],
  );
  const contrastSafe = useMemo(
    () => contrastRatio >= MIN_CONTRAST_RATIO,
    [contrastRatio],
  );

  const riskResult = useMemo(
    () => computeScanRiskLevel({ logoSizeRatio, dotType, contrastRatio }),
    [logoSizeRatio, dotType, contrastRatio],
  );

  const minPrintWidthCm = useMemo(
    () => computeMinPrintWidthCm(scanDistanceMeters),
    [scanDistanceMeters],
  );

  const buildOptions = useCallback(
    (sizePx: number, outputType: 'canvas' | 'svg') =>
      buildQrCodeStylingOptions(
        {
          value,
          colors: { dark, light },
          sizePx,
          dotType,
          cornerSquareType,
          logoDataUrl,
          logoSizeRatio,
          logoPadding,
          gradientEndColor: activeGradientEndColor,
        },
        outputType,
      ),
    [value, dark, light, dotType, cornerSquareType, logoDataUrl, logoSizeRatio, logoPadding, activeGradientEndColor],
  );

  // Live preview — renders directly into `previewRef` via qr-code-styling's own append().
  useEffect(() => {
    if (!previewRef.current) return;
    const options = buildOptions(PREVIEW_SIZE_PX, 'canvas');
    if (!previewInstanceRef.current) {
      previewInstanceRef.current = new QRCodeStyling(options);
      previewRef.current.innerHTML = '';
      previewInstanceRef.current.append(previewRef.current);
    } else {
      previewInstanceRef.current.update(options);
    }
  }, [buildOptions]);

  const handleDownloadPng = useCallback(async () => {
    setDownloading('png');
    setDownloadError(null);
    try {
      const instance = new QRCodeStyling(buildOptions(MIN_PRINT_PNG_WIDTH, 'canvas'));
      const blob = await instance.getRawData('png');
      if (!blob || !(blob instanceof Blob)) throw new Error('No PNG data returned');
      const dataUrl = await blobToDataUrl(blob);
      triggerDownload(dataUrl, sanitizeFilename(friendlyName, 'png'));
    } catch (err) {
      console.error('[QrCodeGenerator] PNG generation failed:', err);
      setDownloadError('יצירת ה-PNG נכשלה');
    } finally {
      setDownloading(null);
    }
  }, [buildOptions, friendlyName]);

  const handleDownloadSvg = useCallback(async () => {
    setDownloading('svg');
    setDownloadError(null);
    try {
      const instance = new QRCodeStyling(buildOptions(MIN_PRINT_PNG_WIDTH, 'svg'));
      const blob = await instance.getRawData('svg');
      if (!blob || !(blob instanceof Blob)) throw new Error('No SVG data returned');
      const url = URL.createObjectURL(blob);
      triggerDownload(url, sanitizeFilename(friendlyName, 'svg'));
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[QrCodeGenerator] SVG generation failed:', err);
      setDownloadError('יצירת ה-SVG נכשלה');
    } finally {
      setDownloading(null);
    }
  }, [buildOptions, friendlyName]);

  const risk = RISK_DISPLAY[riskResult.level];

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
          <div
            className="flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2"
            ref={previewRef}
          />
          {logoLoadFailed && (
            <span className="text-[11px] text-amber-600">לוגו לא נטען — QR ייוצר בלי לוגו</span>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
            <span aria-hidden>{risk.icon}</span>
            <span>{risk.label}</span>
          </div>

          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
            <label className="mb-1 flex items-center justify-between gap-2">
              <span>מרחק סריקה צפוי (מ׳)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={scanDistanceMeters}
                onChange={(e) => setScanDistanceMeters(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-left"
                dir="ltr"
              />
            </label>
            <p>
              רוחב הדפסה מינימלי מומלץ: <strong>{minPrintWidthCm > 0 ? `${minPrintWidthCm.toFixed(0)} ס״מ` : '—'}</strong>
              <span className="text-slate-400"> (כלל אצבע: מרחק ≈ פי 10 מהרוחב)</span>
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>צבע כהה (מודולים)</span>
              <input
                type="color"
                value={dark}
                onChange={(e) => setDark(e.target.value)}
                className="h-8 w-16 cursor-pointer rounded border border-slate-300"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>צבע בהיר (רקע)</span>
              <input
                type="color"
                value={light}
                onChange={(e) => setLight(e.target.value)}
                className="h-8 w-16 cursor-pointer rounded border border-slate-300"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={gradientEnabled}
              onChange={(e) => setGradientEnabled(e.target.checked)}
              className="cursor-pointer"
            />
            <span>גרדיאנט לצבע הכהה</span>
            {gradientEnabled && (
              <input
                type="color"
                value={gradientEndColor}
                onChange={(e) => setGradientEndColor(e.target.value)}
                className="h-6 w-10 cursor-pointer rounded border border-slate-300"
                aria-label="צבע סיום הגרדיאנט"
              />
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>סגנון נקודות</span>
              <select
                value={dotType}
                onChange={(e) => setDotType(e.target.value as DotType)}
                className="rounded border border-slate-300 px-2 py-1.5 text-xs"
              >
                {DOT_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>סגנון פינות</span>
              <select
                value={cornerSquareType}
                onChange={(e) => setCornerSquareType(e.target.value as CornerSquareType)}
                className="rounded border border-slate-300 px-2 py-1.5 text-xs"
              >
                {CORNER_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>גודל לוגו</span>
              <span dir="ltr">{Math.round(logoSizeRatio * 100)}%</span>
            </div>
            <input
              type="range"
              min={LOGO_SIZE_MIN_RATIO}
              max={LOGO_SIZE_MAX_RATIO}
              step={0.01}
              value={logoSizeRatio}
              onChange={(e) => setLogoSizeRatio(clampLogoSizeRatio(parseFloat(e.target.value)))}
              className="w-full cursor-pointer"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={logoPadding}
              onChange={(e) => setLogoPadding(e.target.checked)}
              className="cursor-pointer"
            />
            <span>ריפוד לבן מסביב ללוגו (משפר סריקה משמעותית)</span>
          </label>

          {!contrastSafe && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              ניגודיות נמוכה מדי ({contrastRatio.toFixed(1)}:1) — QR בהיר על רקע בהיר עלול לא להיסרק. ההורדה חסומה עד שתבחר צבעים עם ניגודיות מספקת.
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              הורדה
            </span>
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
