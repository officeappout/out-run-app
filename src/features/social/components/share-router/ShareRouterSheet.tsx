'use client';

/**
 * ShareRouterSheet (pilot AG2, enable_share_router_v1) — the ONE share button's small sheet:
 *   1. post to the in-app feed  → the summary card's own feed sheet (SummaryFeedShare)
 *   2. designed images          → the existing ShareImageSheet (v2 templates behind enable_home_v2)
 *   3. send via phone           → the caller's existing OS share (navigator.share)
 * A router, not a new design: each row closes this sheet and opens the existing piece.
 * Feed / images come from the summary's registered card (summary-share-registry); `imageInput`
 * is the fallback for images when no card is on screen. Rows that aren't available are hidden.
 *
 * z: the LegalDocModal row (130/131) — above the summary drawer (100), never on screen with it.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Newspaper, Smartphone, type LucideIcon } from 'lucide-react';
import { IconTile, Sheet } from '@/components/ui/v2';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import ShareImageSheet from '../ShareImageSheet';
import type { ShareImageInput } from '../../services/share-image';
import { availableShareRoutes, type ShareRoute } from './share-routes';
import { useSummaryShareRegistry } from './summary-share-registry';

export interface ShareRouterSheetProps {
  open: boolean;
  onClose: () => void;
  /** The caller's existing OS share (what "share" did before). */
  onPhone: () => void;
  /** Share-image data when the summary has no feed card to take it from. */
  imageInput?: ShareImageInput | null;
}

const ROW: Record<ShareRoute, { icon: LucideIcon; title: 'shareRouter.feed' | 'shareRouter.images' | 'shareRouter.phone'; sub: 'shareRouter.feedSub' | 'shareRouter.imagesSub' | 'shareRouter.phoneSub' }> = {
  feed: { icon: Newspaper, title: 'shareRouter.feed', sub: 'shareRouter.feedSub' },
  images: { icon: ImageIcon, title: 'shareRouter.images', sub: 'shareRouter.imagesSub' },
  phone: { icon: Smartphone, title: 'shareRouter.phone', sub: 'shareRouter.phoneSub' },
};

export default function ShareRouterSheet({ open, onClose, onPhone, imageInput = null }: ShareRouterSheetProps) {
  const t = useT(community);
  const feed = useSummaryShareRegistry((s) => s.feed);
  const cardImages = useSummaryShareRegistry((s) => s.images);
  const [ownImageOpen, setOwnImageOpen] = useState(false);
  const routes = availableShareRoutes({ feed: !!feed, images: !!cardImages || !!imageInput });

  const pick = (route: ShareRoute) => {
    onClose();
    if (route === 'feed') feed?.();
    else if (route === 'images') {
      if (cardImages) cardImages();
      else setOwnImageOpen(true);
    } else onPhone();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t('shareRouter.title')}
        zIndex={SHEET_Z.legalPanel}
        backdropZIndex={SHEET_Z.legal}
        scroll="none"
        closeOnEscape
        dragToDismiss
      >
        <ul className="flex flex-col gap-2 px-4 pb-2 pt-1">
          {routes.map((route) => {
            const row = ROW[route];
            return (
              <li key={route}>
                <button
                  type="button"
                  onClick={() => pick(route)}
                  className="flex w-full items-center gap-3 rounded-v2-card bg-white px-3.5 py-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.98]"
                >
                  <IconTile icon={row.icon} tone="accent" size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold text-v2-ink">{t(row.title)}</span>
                    <span className="block truncate text-[12.5px] font-bold text-v2-muted">{t(row.sub)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
      {/* Fixed overlay: the summary is a dragged (transformed) drawer, so portal it (as SummaryFeedShare does). */}
      {typeof document !== 'undefined'
        ? createPortal(
            <ShareImageSheet open={ownImageOpen} onClose={() => setOwnImageOpen(false)} input={ownImageOpen ? imageInput : null} />,
            document.body,
          )
        : null}
    </>
  );
}
