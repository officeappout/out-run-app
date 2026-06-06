'use client';

import { useState, useEffect, useCallback } from 'react';

interface CaughtError {
  type: 'uncaught' | 'unhandled-rejection';
  message: string;
  stack?: string;
  filename?: string;
  line?: number;
  col?: number;
  timestamp: string;
}

// Only render the diagnostic banner in non-production environments.
// On Vercel preview deployments NEXT_PUBLIC_VERCEL_ENV is 'preview'.
// Locally NODE_ENV is 'development'. Production Vercel is 'production'.
const IS_DIAGNOSTIC =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';

export default function GlobalErrorOverlay() {
  const [errors, setErrors] = useState<CaughtError[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const addError = useCallback((err: CaughtError) => {
    setErrors((prev) => [err, ...prev].slice(0, 20));
    setDismissed(false);
  }, []);

  useEffect(() => {
    // SSR guard — this effect only runs in the browser.
    if (typeof window === 'undefined') return;

    const handleError = (event: ErrorEvent) => {
      const raw = event.error;
      addError({
        type: 'uncaught',
        message: event.message || raw?.message || 'Unknown error',
        stack: raw?.stack,
        filename: event.filename,
        line: event.lineno,
        col: event.colno,
        timestamp: new Date().toISOString(),
      });

      if (!IS_DIAGNOSTIC) {
        // In production: only log, no banner — let Crashlytics handle reporting.
        console.error('[GlobalError] Uncaught:', raw ?? event.message);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled Promise Rejection';

      addError({
        type: 'unhandled-rejection',
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      if (!IS_DIAGNOSTIC) {
        console.error('[GlobalError] Unhandled rejection:', reason);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [addError]);

  // In production the listeners are registered (for future Crashlytics wiring)
  // but the visible banner is suppressed — nothing renders.
  if (!IS_DIAGNOSTIC || errors.length === 0 || dismissed) return null;

  const latest = errors[0];
  const latestText = [
    `[${latest.timestamp}]`,
    `${latest.type === 'unhandled-rejection' ? 'UNHANDLED REJECTION' : 'UNCAUGHT ERROR'}: ${latest.message}`,
    latest.stack,
    latest.filename
      ? `  at ${latest.filename}:${latest.line ?? '?'}:${latest.col ?? '?'}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const allText = errors
    .map((e) =>
      [
        `[${e.timestamp}] ${e.type === 'unhandled-rejection' ? 'UNHANDLED REJECTION' : 'UNCAUGHT ERROR'}: ${e.message}`,
        e.stack,
        e.filename ? `  at ${e.filename}:${e.line ?? '?'}:${e.col ?? '?'}` : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n────────────────────\n\n');

  const copyAll = () => {
    navigator.clipboard?.writeText(allText).catch(() => {
      // Clipboard API not available (e.g. non-secure context on device).
      // Silently fail — user can read the stack in the banner.
    });
  };

  return (
    // dir="ltr" because stack traces and file paths are always LTR text.
    <div
      dir="ltr"
      role="alert"
      aria-live="assertive"
      className="fixed bottom-0 left-0 right-0 z-[120] flex max-h-[55dvh] flex-col border-t-2 border-red-500 bg-red-950 text-red-100 shadow-floating"
    >
      {/* ── Header bar ── */}
      <div className="flex shrink-0 items-center justify-between bg-red-900 px-3 py-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-wider text-red-400">
            ⚠ DEV ERROR
          </span>
          {errors.length > 1 && (
            <span className="shrink-0 rounded bg-red-700 px-1.5 py-0.5 font-mono text-[10px] text-red-200">
              {errors.length} errors
            </span>
          )}
          <span className="truncate font-mono text-[10px] text-red-300">
            {latest.type === 'unhandled-rejection'
              ? 'Unhandled Promise Rejection'
              : 'Uncaught Runtime Error'}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={copyAll}
            className="rounded bg-red-700 px-2 py-0.5 font-mono text-[11px] text-white hover:bg-red-600 active:bg-red-500"
          >
            Copy Error
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss error overlay"
            className="ml-1 font-mono text-lg leading-none text-red-400 hover:text-white"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Stack trace ── */}
      <pre className="overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[10px] leading-relaxed text-red-200">
        {latestText}
      </pre>
    </div>
  );
}
