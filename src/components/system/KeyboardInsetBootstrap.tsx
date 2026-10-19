'use client';

/**
 * Mounts the app-wide keyboard inset controller once (see
 * src/hooks/useKeyboardInset.ts) — only while `enable_keyboard_insets_v1` is
 * on. Off = exactly today's behaviour: no listeners, no runtime
 * Keyboard.setResizeMode, --kb-inset stays 0 so the .kb-* utilities are inert.
 * Flags come from the shared cache (useFeatureFlags); if they load late the
 * controller simply mounts late. Renders nothing.
 */

import { useKeyboardInsetController } from '@/hooks/useKeyboardInset';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

export default function KeyboardInsetBootstrap() {
  const isSuperAdmin = useUserStore(
    (st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const enabled = useFeatureFlags(isSuperAdmin).flags.enableKeyboardInsetsV1;
  useKeyboardInsetController(enabled);
  return null;
}
