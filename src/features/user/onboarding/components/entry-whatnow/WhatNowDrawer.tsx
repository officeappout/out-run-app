'use client';

/**
 * WhatNowDrawer — the entry flow's step 2 on the map (enable_entry_whatnow_v1, designs N2/N2b):
 * step bar (2) · "מה בא לך עכשיו?" · route card (only near a park / route) · plan hero · Kelly ·
 * "או רק להסתכל מסביב". A modal v2 Sheet (its backdrop dims the map), so no other bottom card
 * competes with it (one-card law, axioms §9). The host decides when it is open and records the
 * answer; this component only renders and reports which card was picked.
 */
import { Sheet, StepBar } from '@/components/ui/v2';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import type { WhatNowAnswer, WhatNowLayout, WhatNowRouteCopy } from '../../services/entry-whatnow';
import { WhatNowKellyCard, WhatNowPlanCard, WhatNowRouteCard } from './WhatNowCards';

export interface WhatNowDrawerProps {
  open: boolean;
  layout: WhatNowLayout;
  routeCopy: WhatNowRouteCopy | null;
  routeMapUrl: string | null;
  /** Kelly is reachable for this user (AI or unified team chat). */
  showKelly: boolean;
  onAnswer: (answer: WhatNowAnswer) => void;
}

export default function WhatNowDrawer({ open, layout, routeCopy, routeMapUrl, showKelly, onAnswer }: WhatNowDrawerProps) {
  return (
    <Sheet
      open={open}
      onClose={() => onAnswer('dismiss')}
      // Same tier as WelcomeDrawer (auto-mounted onboarding drawer): above the map chrome
      // (search z-[70]) and OfflineBanner — .cursorrules z-[101] row.
      zIndex={SHEET_Z.aboveOffline}
      backdropZIndex={SHEET_Z.overlay}
      backdropStyle={{ background: 'rgba(14,20,25,0.18)' }}
      surface="rounded-t-[28px] bg-[#f8fafc] shadow-v2-sheet"
      header={null}
      hideClose
      scroll="body"
      ariaLabel="מה בא לך עכשיו?"
      className="max-h-[85vh]"
    >
      <div className="flex flex-col gap-3 px-[18px] pb-2 pt-1" dir="rtl">
        <StepBar current={2} />
        <h2 className="text-[22px] font-bold text-v2-ink">{layout.title}</h2>
        {layout.cards.map((card) => {
          if (card === 'route') {
            return routeCopy ? (
              <WhatNowRouteCard key="route" copy={routeCopy} mapUrl={routeMapUrl} onClick={() => onAnswer('route')} />
            ) : null;
          }
          if (card === 'plan') return <WhatNowPlanCard key="plan" tagged={layout.planTagged} onClick={() => onAnswer('plan')} />;
          return showKelly ? <WhatNowKellyCard key="kelly" onClick={() => onAnswer('kelly')} /> : null;
        })}
        <button
          type="button"
          onClick={() => onAnswer('browse')}
          className="mt-2 self-center py-2 text-[13.5px] font-bold text-v2-muted"
        >
          או רק להסתכל מסביב
        </button>
      </div>
    </Sheet>
  );
}
