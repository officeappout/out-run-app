'use client';

/**
 * Mounts the app-wide keyboard inset controller once (see
 * src/hooks/useKeyboardInset.ts). Renders nothing.
 */

import { useKeyboardInsetController } from '@/hooks/useKeyboardInset';

export default function KeyboardInsetBootstrap() {
  useKeyboardInsetController();
  return null;
}
