'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { DraggableSheet, IconButton } from '@/components/ui/v2';
import { useSafeAreaTop } from '@/lib/safe-area/useSafeAreaTop';
import { summarySheetSnaps, SUMMARY_COLLAPSED_PX, type SummarySnap } from './summary-sheet.util';

/** Height of the optional history top bar row (36px button + bottom pad). */
const TOP_BAR_PX = 40;

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
   * Pinned footer — the ONLY place an exit/save action lives. Dragging the
   * drawer never dismisses, finishes or saves.
   */
  footer?: ReactNode;
  /**
   * Opened from history (no live flow behind it): renders a small top bar
   * (title + ✕) above the hero, so there's always an exit besides the footer.
   */
  topBar?: { title: string; onClose: () => void };
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
  footer,
  topBar,
  children,
}: SummaryDrawerShellProps) {
  const safeTop = useSafeAreaTop();
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const update = () => setVh(window.innerHeight || 800);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { snapPoints, initialIndex } = summarySheetSnaps(
    vh,
    peekHeight,
    initialSnap,
    // The history top bar adds a row to the peek, so the collapsed sheet grows with it.
    SUMMARY_COLLAPSED_PX + (topBar ? TOP_BAR_PX : 0),
    safeTop,
  );

  const topBarRow = topBar ? (
    <div className="flex items-center justify-between gap-2 px-4 pb-1">
      <span className="truncate text-[15px] font-extrabold text-v2-ink">{topBar.title}</span>
      <IconButton
        aria-label="סגירה"
        tone="surface"
        size={36}
        // Keep the tap from starting a sheet drag (the header is the drag zone).
        onPointerDown={(e) => e.stopPropagation()}
        onClick={topBar.onClose}
      >
        <X className="h-4 w-4" aria-hidden />
      </IconButton>
    </div>
  ) : null;

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
            {topBarRow}
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
