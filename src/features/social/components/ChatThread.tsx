'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { subscribeToMessages, sendMessage, markThreadAsRead } from '../services/chat.service';
import type { ChatMessage, ChatThread as ChatThreadType } from '../types/chat.types';

interface ChatThreadProps {
  thread: ChatThreadType;
  myUid: string;
  myName: string;
}

export default function ChatThread({ thread, myUid, myName }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
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

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? 'justify-start' : 'justify-end'}`}
            >
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

      {/* Input bar */}
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
    </div>
  );
}
