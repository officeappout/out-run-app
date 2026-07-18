'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export interface DrawerTab {
  id: string;
  label: string;
}

interface SummaryDrawerShellProps {
  tabs: DrawerTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Chevron/dismiss → finish. The caller owns the teardown (clearSession + navigate). */
  onDismiss: () => void;
  /** Transparent gap at the top so the live map behind SummaryLayer peeks through. */
  peekHeight?: number;
  /** Pinned footer (share / finish) — stays below the scroll area. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Drawer-over-map chassis — the single source of truth for the summary drawer,
 * matching AerobicSummaryShell's inline drawer (design spec v0.9): a transparent
 * fixed container so the live Mapbox behind SummaryLayer peeks at the top, a
 * white rounded card below, a drag handle + dismiss chevron, an underline tab
 * row, a scroll area, and an optional pinned footer.
 *
 * z-100 container = the registered post-workout-summary band (.cursorrules) — no
 * new z values. Currently used only by HybridSummary (behind HYBRID_SUMMARY_
 * ENABLED); AerobicSummaryShell can migrate to it in the aerobic-V2 follow-up.
 */
export default function SummaryDrawerShell({
  tabs,
  activeTab,
  onTabChange,
  onDismiss,
  peekHeight = 150,
  footer,
  children,
}: SummaryDrawerShellProps) {
  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        fontFamily: 'var(--font-simpler, system-ui, sans-serif)',
      }}
    >
      {/* Transparent peek — live Mapbox map shows behind */}
      <div style={{ flex: `0 0 ${peekHeight}px`, background: 'transparent' }} />

      {/* White card */}
      <div
        style={{
          flex: 1,
          background: '#ffffff',
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle + dismiss chevron */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, background: '#d3d8d6', margin: '10px auto 6px' }} />
          <button
            onClick={onDismiss}
            aria-label="סגור"
            style={{
              position: 'absolute',
              top: 4,
              insetInlineStart: 10,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9aa3a1',
              padding: 4,
              lineHeight: 0,
            }}
          >
            <ChevronDown size={20} />
          </button>
        </div>

        {/* Underline tab row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            padding: '0 4px',
            borderBottom: '0.5px solid #e8ebea',
            flexShrink: 0,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 4px 10px',
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 500 : 400,
                color: activeTab === tab.id ? '#1D9E75' : '#9aa3a1',
                borderBottom: activeTab === tab.id ? '2px solid #1D9E75' : '2px solid transparent',
                lineHeight: '32px',
                transition: 'color 150ms',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scroll content */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>

        {/* Pinned footer */}
        {footer && (
          <div style={{ flexShrink: 0, borderTop: '0.5px solid #e8ebea', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
