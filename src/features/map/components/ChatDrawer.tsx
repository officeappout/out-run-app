'use client';

import React, { useRef, useEffect } from 'react';
import { X, Send, Bot, User, Loader2 } from 'lucide-react';

export interface ChatMessage {
    role: 'coach' | 'user';
    text: string;
}

interface ChatDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    isLoading: boolean;
}

export default function ChatDrawer({ isOpen, onClose, messages, onSendMessage, isLoading }: ChatDrawerProps) {
    const [inputValue, setInputValue] = React.useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    if (!isOpen) return null;

    const handleSend = () => {
        if (!inputValue.trim() || isLoading) return;
        onSendMessage(inputValue);
        setInputValue('');
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[100] transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed bottom-0 left-0 right-0 z-[101] bg-white/90 backdrop-blur-xl rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col max-h-[80vh] animate-in slide-in-from-bottom duration-300">
                {/* Drag Handle */}
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3 shrink-0" />

                {/* Header */}
                <div className="px-6 pb-4 flex justify-between items-center border-b border-gray-100/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 p-0.5 shadow-lg">
                            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
                                <Bot size={20} className="text-purple-600" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-black text-gray-800">AI Coach</h2>
                            <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">Online & Motivated</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Messages Area */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[300px]"
                >
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                            dir="rtl"
                        >
                            <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-cyan-100 text-cyan-600' : 'bg-purple-100 text-purple-600'
                                    }`}>
                                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>
                                <div className={`p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm ${msg.role === 'user'
                                        ? 'bg-white text-gray-800 border border-gray-100 rounded-tr-none'
                                        : 'bg-gradient-to-br from-purple-600 to-violet-600 text-white rounded-tl-none'
                                    }`}>
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-end" dir="rtl">
                            <div className="bg-gray-100 text-gray-400 px-4 py-2 rounded-2xl rounded-tl-none flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                <span className="text-xs font-bold">המאמן חושב...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-6 pb-[env(safe-area-inset-bottom,24px)] bg-white/50 border-t border-gray-100/50">
                    <div className="relative flex items-center bg-white shadow-inner rounded-2xl px-4 py-3 border border-gray-100 focus-within:ring-2 focus-within:ring-purple-500/20 transition-all">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="תמשיך את השיחה..."
                            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 text-right font-bold placeholder:text-gray-300"
                            dir="rtl"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isLoading}
                            className={`p-2 rounded-xl transition-all ${inputValue.trim() && !isLoading
                                    ? 'bg-gradient-to-r from-cyan-400 to-purple-500 text-white shadow-lg'
                                    : 'bg-gray-100 text-gray-300'
                                }`}
                        >
                            <Send size={18} className="rotate-180" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
