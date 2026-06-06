'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, Crown, MoreVertical, Ban, Flag, X, Loader2 } from 'lucide-react';
import {
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { subscribeToMessages, sendMessage, markThreadAsRead } from '../services/chat.service';
import type { ChatMessage, ChatThread as ChatThreadType } from '../types/chat.types';

interface ChatThreadProps {
  thread: ChatThreadType;
  myUid: string;
  myName: string;
  /** UID of the group creator — when provided, their messages show a crown badge */
  createdByUid?: string;
}

/**
 * Report reason taxonomy — mirrors the `user`/`group` subset used by
 * `arena/ReportContentSheet` so the admin reports dashboard
 * (`/admin/authority/reports`) partitions identical `reason` values
 * regardless of where the report originated.
 */
const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'inappropriate', label: 'תוכן לא ראוי' },
  { id: 'harassment', label: 'הטרדה או אלימות' },
  { id: 'spam', label: 'ספאם / תוכן מסחרי' },
  { id: 'impersonation', label: 'התחזות' },
  { id: 'other', label: 'אחר' },
];

export default function ChatThread({ thread, myUid, myName, createdByUid }: ChatThreadProps) {
  const isGroupThread = thread.type === 'group';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Block & Report state ──
  // For a DM, the target is the single other participant. Group threads have
  // no single "other user", so blocking is hidden and reporting targets the
  // group itself.
  const otherUid = isGroupThread
    ? undefined
    : thread.participants.find((uid) => uid !== myUid);
  const otherName = otherUid ? thread.participantNames?.[otherUid] ?? 'משתמש' : '';
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  useEffect(() => {
    const unsub = subscribeToMessages(thread.id, setMessages);
    markThreadAsRead(thread.id, myUid).catch(() => {});
    return unsub;
  }, [thread.id, myUid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    setIsSending(true);
    try {
      await sendMessage(thread.id, myUid, myName, text);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Block: persist a one-directional block edge in `blocks`. Doc id is
  // `${blockerId}_${blockedId}` so the relationship is idempotent and the
  // Firestore rule can authorize on `blockerId == request.auth.uid`. ──
  async function handleBlock() {
    if (!otherUid || !myUid || isBlocking) return;
    setIsBlocking(true);
    try {
      await setDoc(doc(db, 'blocks', `${myUid}_${otherUid}`), {
        blockerId: myUid,
        blockedId: otherUid,
        blockedName: otherName,
        createdAt: serverTimestamp(),
      });
      setIsBlocked(true);
      setMenuOpen(false);
    } catch (err) {
      console.error('[ChatThread] block failed:', err);
    } finally {
      setIsBlocking(false);
    }
  }

  async function handleUnblock() {
    if (!otherUid || !myUid || isBlocking) return;
    setIsBlocking(true);
    try {
      await deleteDoc(doc(db, 'blocks', `${myUid}_${otherUid}`));
      setIsBlocked(false);
    } catch (err) {
      console.error('[ChatThread] unblock failed:', err);
    } finally {
      setIsBlocking(false);
    }
  }

  function openReport() {
    setMenuOpen(false);
    setReportReason(null);
    setReportSubmitted(false);
    setReportOpen(true);
  }

  // ── Report: write to the shared `reports` collection with the same shape
  // ReportContentSheet uses, so reports raised from a chat land in the same
  // admin queue. DM → targetType 'user', group → targetType 'group'. ──
  async function handleSubmitReport() {
    if (!reportReason || reportSubmitting) return;
    const targetId = isGroupThread ? thread.groupId ?? thread.id : otherUid;
    if (!targetId) return;
    setReportSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        targetId,
        targetType: isGroupThread ? 'group' : 'user',
        targetName: isGroupThread ? thread.groupName ?? 'קבוצה' : otherName,
        reporterId: myUid,
        reason: reportReason,
        status: 'pending',
        source: 'chat',
        chatId: thread.id,
        createdAt: serverTimestamp(),
      });
      setReportSubmitted(true);
    } catch (err) {
      console.error('[ChatThread] report submit failed:', err);
    } finally {
      setReportSubmitting(false);
    }
  }

  // Block applies to DMs only; reporting is available on every thread.
  const canBlock = !!otherUid;

  return (
    <div className="relative flex flex-col h-full" dir="rtl">
      {/* Overflow menu — block / report. Floats at the top-end (left in RTL)
          corner, inside the chat sheet's own stacking context so it never
          collides with the global z-index budget. */}
      <div className="absolute top-1.5 left-2 z-20">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="אפשרויות שיחה"
          className="w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center active:scale-95 transition-transform"
        >
          <MoreVertical className="w-4 h-4 text-gray-500" />
        </button>

        {menuOpen && (
          <>
            {/* Click-away catcher */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute top-9 left-0 z-20 w-44 rounded-2xl bg-white shadow-floating border border-gray-100 overflow-hidden">
              {canBlock &&
                (isBlocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleUnblock();
                      setMenuOpen(false);
                    }}
                    disabled={isBlocking}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-start"
                  >
                    <Ban className="w-4 h-4 text-gray-500" />
                    בטל חסימה
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBlock}
                    disabled={isBlocking}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 text-start"
                  >
                    {isBlocking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Ban className="w-4 h-4" />
                    )}
                    חסום משתמש
                  </button>
                ))}
              <button
                type="button"
                onClick={openReport}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 text-start"
              >
                <Flag className="w-4 h-4 text-red-500" />
                {isGroupThread ? 'דווח על הקבוצה' : 'דווח על המשתמש'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Report overlay — confined to this component (absolute inset-0) so it
          stacks above the messages without needing a new global z value. */}
      {reportOpen && (
        <div className="absolute inset-0 z-30 bg-white flex flex-col" dir="rtl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-black text-gray-900">
                {isGroupThread ? 'דיווח על הקבוצה' : `דיווח על ${otherName}`}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              aria-label="סגור"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {reportSubmitted ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-3">✅</div>
                <h4 className="text-lg font-black text-gray-900 mb-1">הדיווח נשלח</h4>
                <p className="text-sm text-gray-500">
                  תודה על שמירת הקהילה. נבדוק את הדיווח בהקדם.
                </p>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="mt-6 w-full py-3 rounded-xl text-sm font-bold text-gray-400"
                >
                  סגור
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">מה הסיבה לדיווח?</p>
                <div className="space-y-2 mb-6">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setReportReason(r.id)}
                      className={`w-full text-start px-4 py-3 rounded-2xl text-sm font-bold border transition-all ${
                        reportReason === r.id
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!reportReason || reportSubmitting}
                  onClick={handleSubmitReport}
                  className="w-full py-3.5 rounded-2xl text-sm font-black bg-red-500 text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  {reportSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'שלח דיווח'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pt-12 space-y-2">
        {messages.map((msg) => {
          const isMine = msg.senderUid === myUid;
          const isHighFive = msg.type === 'high_five';

          if (isHighFive) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                  🤘 {isMine ? 'שלחת ידיים' : `${msg.senderName} הרים ידיים`}
                </span>
              </div>
            );
          }

          const isAdmin = !!createdByUid && msg.senderUid === createdByUid;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
            >
              {/* Sender name — shown for group chats on others' messages */}
              {isGroupThread && !isMine && (
                <div className="flex items-center gap-1 mb-0.5 mr-1">
                  <span className="text-[10px] font-bold text-gray-500">{msg.senderName}</span>
                  {isAdmin && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 bg-amber-50 rounded-full px-1.5 py-0.5">
                      <Crown className="w-2.5 h-2.5" />
                      מנהל/ת
                    </span>
                  )}
                </div>
              )}
              <div
                className={`max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug shadow-sm ${
                  isMine
                    ? 'bg-cyan-500 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar — replaced by a notice once the user is blocked. */}
      {isBlocked ? (
        <div className="px-4 py-3 border-t border-gray-100 bg-white flex items-center justify-center gap-2 text-sm text-gray-500">
          <Ban className="w-4 h-4 text-gray-400" />
          חסמת משתמש זה. בטל את החסימה כדי לשלוח הודעות.
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-100 bg-white flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="כתוב הודעה..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none text-right placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
