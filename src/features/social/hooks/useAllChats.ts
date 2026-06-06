'use client';

import { useEffect, useState } from 'react';
import { subscribeToAllChats } from '../services/chat.service';
import type { ChatThread } from '../types/chat.types';

/**
 * Admin-only real-time subscription to EVERY chat thread on the platform,
 * sorted by lastMessageAt DESC. Only subscribes when `enabled` is true so
 * regular users never open this firehose listener.
 */
export function useAllChats(enabled: boolean) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setThreads([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToAllChats((data) => {
      setThreads(data);
      setIsLoading(false);
    });

    return unsub;
  }, [enabled]);

  return { threads, isLoading };
}
