'use client';

import React, { useEffect, useState } from 'react';
import { X, Sparkles, Send, Loader2, Bot } from 'lucide-react';

interface Message {
    id: string;
    text: string;
    sender: 'ai' | 'user';
    timestamp: number;
}

interface AIChatOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    onSendMessage: (message: string) => Promise<{ message: string }>;
    initialMessage?: string;
}

export default function AIChatOverlay({ isOpen, onClose, onSendMessage, initialMessage }: AIChatOverlayProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && messages.length === 0 && initialMessage) {
            setMessages([
                {
                    id: '1',
                    text: initialMessage,
                    sender: 'ai',
                    timestamp: Date.now(),
                },
            ]);
        }
    }, [isOpen, initialMessage, messages.length]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: inputValue,
            sender: 'user',
            timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await onSendMessage(userMsg.text);
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: response.message,
                sender: 'ai',
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, aiMsg]);
        } catch (error) {
            console.error("Chat Error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col h-[70vh] sm:h-[600px] animate-in slide-in-from-bottom-10 duration-500">

                {/* Header */}
                <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-2xl backdrop-blur-md">
                            <Bot size={24} />
                        </div>
                        <div>
                            <h2 className="font-black text-xl leading-tight">AI Coach</h2>
                            <div className="flex items-center gap-1.5 opacity-80 text-xs">
                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                                <span>מחובר עכשיו</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 flex flex-col-reverse">
                    <div className="space-y-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}
                            >
                                <div
                                    className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium shadow-sm ${msg.sender === 'user'
                                            ? 'bg-white text-gray-800 border border-gray-100 rounded-tr-none'
                                            : 'bg-violet-600 text-white rounded-tl-none'
                                        }`}
                                    dir="rtl"
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-end">
                                <div className="bg-violet-100 text-violet-600 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs font-bold">המאמן חושב...</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input */}
                <div className="p-6 bg-white border-t border-gray-100 shrink-0">
                    <div className="relative flex items-center bg-gray-100 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="שאל את המאמן..."
                            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 text-right font-medium placeholder:text-gray-400"
                            dir="rtl"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isLoading}
                            className={`p-2 rounded-xl transition-all ${inputValue.trim() && !isLoading
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                                    : 'text-gray-400'
                                }`}
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="rotate-180" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
