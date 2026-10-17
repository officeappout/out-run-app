'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DraggableSheet } from '@/components/ui/v2';
import { summarySheetSnaps, type SummarySnap } from './summary-sheet.util';

export interface DrawerTab {
  id: string;
  label: string;
}

interface SummaryDrawerShellProps {
  tabs: DrawerTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /**
   * Hero row rendered in the drag zone above the tabs — stays visible when the
   * drawer is collapsed to its peek.
   */
  header?: ReactNode;
  /** Transparent gap above the OPEN drawer so the live map behind SummaryLayer peeks through. */
  peekHeight?: number;
  /** Snap the drawer opens at (previews / screenshots use 'peek'). Default 'full'. */
  initialSnap?: SummarySnap;
  /**
   * Collapsed (peek) height override — only for a footer taller than the
   * default (G7.1's continuation row). Omitted = SUMMARY_COLLAPSED_PX, as before.
   */
  collapsedPx?: number;
  /**
   * Pinned footer — the ONLY place an exit/save action lives. Dragging the
   * drawer never dismisses, finishes or saves.
   */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Drawer-over-map chassis for the post-workout summaries (aerobic + hybrid),
 * built on the v2 DraggableSheet: pull the handle/hero down and the drawer
 * collapses to a peek (map visible behind), pull up and it snaps open again.
 * Unlike the previous chassis there is no dismiss chevron — a stray tap used
 * to exit AND save the workout; finishing is now one explicit footer button.
 *
 * z-100 = the registered post-workout-summary band (.cursorrules); the
 * sheet's pinned footer sits one step above it (DraggableSheet), no new values.
 */
export default function SummaryDrawerShell({
  tabs,
  activeTab,
  onTabChange,
  header,
  peekHeight = 150,
  initialSnap = 'full',
  collapsedPx,
  footer,
  children,
}: SummaryDrawerShellProps) {
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const update = () => setVh(window.innerHeight || 800);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { snapPoints, initialIndex } = summarySheetSnaps(vh, peekHeight, initialSnap, collapsedPx);

  const tabRow = (
    <div
      role="tablist"
      className="flex items-center justify-around px-1 border-b border-v2-hairline"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            className={`relative h-10 px-2 text-[13px] transition-colors duration-200 ease-v2 ${
              active ? 'font-extrabold text-v2-ink' : 'font-semibold text-v2-muted'
            }`}
          >
            {tab.label}
            <span
              aria-hidden
              className={`absolute inset-x-1 bottom-0 h-[3px] rounded-full bg-v2-accent transition-opacity duration-200 ease-v2 ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        );
      })}
    </div>
  );

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-simpler, system-ui, sans-serif)' }}>
      <DraggableSheet
        snapPoints={snapPoints}
        initialSnap={initialIndex}
        zIndex={100}
        ariaLabel="סיכום אימון"
        header={
          <>
            {header}
            {tabRow}
          </>
        }
        footer={footer}
      >
        {children}
      </DraggableSheet>
    </div>
  );
}
