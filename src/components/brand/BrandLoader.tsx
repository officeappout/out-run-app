'use client';

/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';

/** The brand cyan (owner note AJ1). */
export const BRAND_LOADER_CYAN = '#00C9F2';
/** The light canvas every entry screen shares (globe veil, explorer, intro). */
export const BRAND_LOADER_BG = '#F8FAFC';

export interface BrandLoaderProps {
  /**
   * `screen` (default): pinned to the viewport (fixed inset-0), for route gaps and
   * Suspense fallbacks. `overlay`: fills its positioned parent (absolute inset-0),
   * e.g. over the map canvas while it initialises.
   */
  variant?: 'screen' | 'overlay';
  /** Optional visible line under the bar (already translated). The a11y label is always set. */
  caption?: string;
  /** The a11y label (already translated); defaults to the caption, else common "טוען". */
  label?: string;
  /** Extra classes on the root (z-index tier, etc.). */
  className?: string;
}

/**
 * The ONE light branded loader of the entry flow (pilot notes AJ1, AJ3, AJ4):
 * the cyan OUT logotype on the app's light canvas, a soft brand blob at the top
 * (as on the intro screens) and a thin indeterminate cyan bar. Never a dark
 * splash. Pure CSS (no framer-motion, no data), so it is safe as any Suspense
 * fallback or first paint; the logo fades in over 180 ms so a short gap reads as
 * a calm beat, not a flash.
 */
export default function BrandLoader({ variant = 'screen', caption, label, className = '' }: BrandLoaderProps) {
  const t = useT(common);
  const pos = variant === 'overlay' ? 'absolute' : 'fixed';
  return (
    <div
      className={`${pos} inset-0 flex flex-col items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: BRAND_LOADER_BG }}
      role="status"
      aria-busy="true"
      aria-label={label ?? caption ?? t('ui.loading.label')}
      data-brand-loader=""
    >
      <style>{BRAND_LOADER_CSS}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-[60px] -top-[140px] h-[440px] rounded-b-[50%] opacity-[0.13]"
        style={{ background: `linear-gradient(135deg, #00baf7, #0cf2e3)` }}
      />
      <div className="out-brand-loader-in relative flex flex-col items-center gap-5">
        <img src="/images/intro/logo-out.svg" alt="" width={132} height={49} className="h-[49px] w-[132px] max-w-none" />
        <div className="relative h-[3px] w-[88px] overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(0,201,242,0.16)' }}>
          <div
            className="out-brand-loader-bar absolute inset-y-0 w-[40%] rounded-full"
            style={{ backgroundColor: BRAND_LOADER_CYAN }}
          />
        </div>
        {caption && <p className="m-0 text-[13px] font-semibold text-slate-500">{caption}</p>}
      </div>
    </div>
  );
}

const BRAND_LOADER_CSS = `
@keyframes out-brand-loader-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes out-brand-loader-bar { 0% { transform: translateX(-110%); } 100% { transform: translateX(260%); } }
.out-brand-loader-in { animation: out-brand-loader-in 180ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.out-brand-loader-bar { left: 0; animation: out-brand-loader-bar 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
@media (prefers-reduced-motion: reduce) {
  .out-brand-loader-in { animation: none; }
  .out-brand-loader-bar { animation: none; transform: translateX(75%); }
}
`;
