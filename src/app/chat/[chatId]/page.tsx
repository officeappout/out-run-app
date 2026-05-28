'use client';

/**
 * /chat/[chatId] — Deep-link landing route for the Social Engagement Engine.
 *
 * Social Engagement Engine triggers (`Future_Partner_Plan`,
 * `Social_Matchmaking`) ship a `deepLink: '/chat/<chatId>'` payload. The
 * native push handler (`src/lib/native/push.ts`) navigates the web view here
 * when the user taps the notification.
 *
 * The global <ChatInbox /> overlay lives in `ClientLayout.tsx` and is
 * driven by `useChatStore`. Rather than mounting a second inbox locally,
 * this route:
 *   1. Reads `chatId` from `params`.
 *   2. Loads the chat doc from Firestore (defensively — a missing doc
 *      surfaces a friendly error, never a stack trace).
 *   3. Pushes the resolved thread into `useChatStore.activeThread` and
 *      flips `isOpen`, which lets the existing global overlay paint the
 *      conversation on top of `/home`.
 *   4. Replaces the URL with `/home` so back-navigation returns to a
 *      meaningful screen instead of an empty `/chat/<id>` shell.
 *
 * Chat ID convention (see `chat.service.ts`):
 *   • DM:    `[uid1, uid2].sort().join('_')`
 *   • Group: `group_<groupId>`
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Loader2, MessageCircle, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useChatStore } from '@/features/social/store/useChatStore';
import type { ChatThread } from '@/features/social/types/chat.types';

type PageStatus = 'loading' | 'ready' | 'not-found' | 'error';

function tsToDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date();
}

export default function ChatDeepLinkPage({
  params,
}: {
  params: { chatId: string };
}) {
  const router = useRouter();
  const chatId = params?.chatId ?? '';
  const [status, setStatus] = useState<PageStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    if (!chatId) {
      setStatus('not-found');
      return;
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'chats', chatId));
        if (cancelled) return;

        if (!snap.exists()) {
          setStatus('not-found');
          return;
        }

        const data = snap.data();
        const thread: ChatThread = {
          id: snap.id,
          participants: (data.participants as string[]) ?? [],
          participantNames:
            (data.participantNames as Record<string, string>) ?? {},
          lastMessage: (data.lastMessage as string) ?? '',
          lastMessageAt: tsToDate(data.lastMessageAt),
          lastSenderId: (data.lastSenderId as string) ?? '',
          unreadCount:
            (data.unreadCount as Record<string, number>) ?? {},
          createdAt: tsToDate(data.createdAt),
          type: (data.type as 'dm' | 'group') ?? 'dm',
          groupId: (data.groupId as string | undefined) ?? undefined,
          groupName: (data.groupName as string | undefined) ?? undefined,
        };

        // Hand the resolved thread to the global chat store so the
        // ClientLayout-mounted <ChatInbox /> paints it on top of /home.
        useChatStore.setState({ activeThread: thread, isOpen: true });
        setStatus('ready');

        // Replace the URL so a back-tap doesn't return the user to an
        // empty deep-link shell. The chat sheet remains open via state.
        router.replace('/home');
      } catch (err) {
        if (cancelled) return;
        console.error('[chat-deeplink] Failed to resolve thread:', err);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, router]);

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center shadow-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
            <p className="text-sm font-medium text-slate-600">
              פותח את הצ׳אט שלך…
            </p>
          </>
        )}

        {status === 'ready' && (
          <>
            <MessageCircle className="h-8 w-8 text-emerald-500" aria-hidden />
            <p className="text-sm font-medium text-slate-700">
              מעביר אותך לשיחה…
            </p>
          </>
        )}

        {(status === 'not-found' || status === 'error') && (
          <>
            <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
            <p className="text-sm font-semibold text-slate-700">
              {status === 'not-found'
                ? 'השיחה לא נמצאה'
                : 'תקלה זמנית בטעינת השיחה'}
            </p>
            <button
              type="button"
              onClick={() => router.replace('/home')}
              className="mt-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
            >
              חזרה לדף הבית
            </button>
          </>
        )}
      </div>
    </div>
  );
}
