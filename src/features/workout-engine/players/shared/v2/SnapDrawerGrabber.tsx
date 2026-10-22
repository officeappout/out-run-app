'use client';

/**
 * SnapDrawerGrabber — the handle of a two-snap player drawer: drag it down
 * (full → compact) or up (compact → full), or tap to toggle. Looks like the
 * cards' existing grabber, with a 44px-high hit area.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { SnapDrawerState } from './useSnapDrawer';

export default function SnapDrawerGrabber({ drawer }: { drawer: SnapDrawerState }) {
  const t = useT(player);
  return (
    <div className="-mt-2 flex justify-center">
      <motion.button
        type="button"
        onPanStart={drawer.onPanStart}
        onPanEnd={drawer.onPanEnd}
        onClick={drawer.toggle}
        aria-expanded={!drawer.collapsed}
        aria-label={drawer.collapsed ? t('strength.drawer.expandAria') : t('strength.drawer.collapseAria')}
        className="flex h-7 w-24 items-center justify-center"
        style={{ touchAction: 'none' }}
        data-snap-drawer-grabber=""
      >
        <span className="block h-1.5 w-10 rounded-full bg-v2-pill-border" aria-hidden />
      </motion.button>
    </div>
  );
}
