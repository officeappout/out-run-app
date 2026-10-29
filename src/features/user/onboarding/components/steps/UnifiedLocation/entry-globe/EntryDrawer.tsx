'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { SHEET_SURFACE_CLASS, SHEET_GRABBER_CLASS } from '@/components/ui/v2/Sheet';
import StepBar from '@/components/ui/v2/StepBar';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { collapsedAfterSwipe } from './drawer-collapse';

/**
 * The entry flow's bottom drawer frame: white, rounded-28 top, grabber, the
 * step bar (step 1 — "האזור שלך"), then the content. The step is `fixed
 * inset-0`, so the drawer owns the bottom safe-area inset, once.
 *
 * Collapsible (AD2) when `onCollapsedChange` is given: the grabber becomes a
 * handle (tap toggles, swipe down / up collapses / expands, see
 * drawer-collapse.ts). Collapsed, only `pinned` (the primary CTA) stays.
 */
export function EntryDrawer({
  children,
  delay = 0,
  collapsed = false,
  onCollapsedChange,
  pinned,
  footer,
}: {
  children: React.ReactNode;
  /** Seconds — the first drawer waits for the Earth to rise. */
  delay?: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Always visible, under the collapsible content. */
  pinned?: React.ReactNode;
  /** Under `pinned`, collapses with the content (e.g. the secondary link). */
  footer?: React.ReactNode;
}) {
  const t = useT(onboarding);
  const collapsible = !!onCollapsedChange;
  const isCollapsed = collapsible && collapsed;
  const fold = (key: string, node: React.ReactNode) => (
    <motion.div
      key={key}
      initial={false}
      animate={isCollapsed ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="-mx-1 flex flex-col gap-3 overflow-hidden px-1"
      aria-hidden={isCollapsed || undefined}
    >
      {node}
    </motion.div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay }}
      className="absolute bottom-0 end-0 start-0 z-30"
    >
      <div
        className={`${SHEET_SURFACE_CLASS} flex flex-col gap-3 px-5 pt-3`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        {collapsible ? (
          <motion.button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={t(isCollapsed ? 'location.entry.drawer.expand' : 'location.entry.drawer.collapse')}
            onTap={() => onCollapsedChange(!isCollapsed)}
            onPanEnd={(_e, info) => onCollapsedChange(collapsedAfterSwipe(isCollapsed, info.offset.y, info.velocity.y))}
            className="-mx-5 -mt-3 flex h-7 touch-none items-center justify-center"
          >
            <span className={SHEET_GRABBER_CLASS} />
          </motion.button>
        ) : (
          <div className={`mx-auto ${SHEET_GRABBER_CLASS}`} />
        )}
        {fold('content', <><StepBar current={1} />{children}</>)}
        {pinned}
        {footer && fold('footer', footer)}
      </div>
    </motion.div>
  );
}

/** The one gradient pill CTA of each drawer (dark text). */
export function EntryCta({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        disabled
          ? 'flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-v2-hairline px-5 text-[17px] font-extrabold text-v2-muted whitespace-nowrap cursor-not-allowed'
          : 'flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-v2-cta px-5 text-[17px] font-extrabold text-v2-on-cta shadow-v2-cta whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2'
      }
    >
      {children}
    </button>
  );
}

/** Secondary text link under the CTA. */
export function EntryLink({
  children,
  onClick,
  tone = 'muted',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'muted' | 'deep';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mx-auto h-10 px-2 text-[14px] font-extrabold whitespace-nowrap active:scale-[0.97] transition-transform duration-150 ease-v2 ${
        tone === 'deep' ? 'text-v2-deep' : 'text-v2-muted'
      }`}
    >
      {children}
    </button>
  );
}
