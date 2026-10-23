'use client';

/**
 * CardHiddenUnderDrawer — the owner's hierarchy rule (23.10.2026): never a
 * card AND a drawer on screen together. While `hidden` (a drawer is open),
 * the cards stay MOUNTED but invisible and untappable, so their generated
 * routes, map polylines and scroll position survive the round-trip back.
 * `visibility` (not display:none) keeps layout + scroll offsets intact.
 *
 * `active=false` renders the children with no wrapper at all (flag-off paths
 * stay byte-identical).
 */

import type { ReactNode } from 'react';

export default function CardHiddenUnderDrawer({ active, hidden, children }: { active: boolean; hidden: boolean; children: ReactNode }) {
  if (!active) return <>{children}</>;
  return (
    <div
      data-card-hidden-under-drawer={hidden ? 'true' : 'false'}
      aria-hidden={hidden || undefined}
      style={hidden ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
    >
      {children}
    </div>
  );
}
