'use client';

/**
 * NativeBootstrap — invisible client component mounted in the root layout.
 *
 * Calls `initNativeShell()` exactly once after the app shell hydrates.
 * Has no visible output. SSR-safe: the import is dynamic via the client
 * boundary, and the init function is itself a no-op outside Capacitor.
 */

import { useEffect } from 'react';

import { initNativeShell } from '@/lib/native/init';

export default function NativeBootstrap() {
  useEffect(() => {
    void initNativeShell();
  }, []);
  return null;
}
