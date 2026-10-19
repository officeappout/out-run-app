'use client';

import { useMotionValue, useTransform, useDragControls } from 'framer-motion';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import { PEEK_Y_PX } from '../utils/group-details-logic';

/** The group sheet's drag/peek motion values + the scroll-chain (swipe-to-close from the body). */
export function useGroupSheetMotion(isOpen: boolean, onClose: () => void) {
  const y = useMotionValue(0);
  // Opacity fades only as the user drags past the resting (85vh) anchor.
  const opacity = useTransform(y, [PEEK_Y_PX, PEEK_Y_PX + 220], [1, 0]);
  const dragControls = useDragControls();
  const { scrollRef } = useSheetScrollChain({ isOpen, y, onClose, snapBackY: PEEK_Y_PX });
  return { y, opacity, dragControls, scrollRef };
}
