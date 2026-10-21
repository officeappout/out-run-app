'use client';

/**
 * The signed-in user's demo viewer world, or null (everyone but the owner's
 * registered viewer accounts). Safe to call from many components: one
 * request per uid, cached (viewer-world.client.ts).
 */
import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user';
import { getDemoViewerWorld, peekDemoViewerWorld } from './viewer-world.client';
import type { DemoViewerWorld } from './viewer-world.types';

export function useDemoViewerWorld(): DemoViewerWorld | null {
  const uid = useUserStore((s) => s.profile?.id ?? null);
  const [world, setWorld] = useState<DemoViewerWorld | null>(() => (uid ? peekDemoViewerWorld(uid) ?? null : null));

  useEffect(() => {
    if (!uid) {
      setWorld(null);
      return;
    }
    let alive = true;
    void getDemoViewerWorld(uid).then((w) => {
      if (alive) setWorld(w);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  return world;
}
