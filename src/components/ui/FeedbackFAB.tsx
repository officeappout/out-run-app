'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Send, Loader2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';

interface FeedbackFABProps {
  /** Optional user ID for attaching to feedback submission */
  userId?: string;
  /** Called after successful submission (e.g. to log analytics) */
  onSubmit?: (type: FeedbackType, message: string) => Promise<void> | void;
  /** Position override — defaults to bottom-left (RTL friendly) */
  position?: 'bottom-left' | 'bottom-right';
}

type FeedbackType = 'feedback' | 'bug' | 'idea';

interface FeedbackOption {
  type: FeedbackType;
  label: string;
  emoji: string;
  placeholder: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    type: 'feedback',
    label: 'משוב כללי',
    emoji: '💬',
    placeholder: 'שתפו אותנו במחשבות שלכם...',
    color: 'text-[#5BC2F2]',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
  },
  {
    type: 'idea',
    label: 'רעיון לשיפור',
    emoji: '💡',
    placeholder: 'יש לכם רעיון? נשמח לשמוע!',
    color: 'text-amber-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    type: 'bug',
    label: 'דיווח על תקלה',
    emoji: '🐛',
    placeholder: 'תארו את הבעיה שנתקלתם בה...',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
];

const MAX_LENGTH = 500;

export default function FeedbackFAB({
  userId,
  onSubmit,
  position = 'bottom-left',
}: FeedbackFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<FeedbackType>('feedback');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const positionClass = position === 'bottom-left'
    ? 'left-4 bottom-20'
    : 'right-4 bottom-20';

  const panelAlignClass = position === 'bottom-left'
    ? 'left-0'
    : 'right-0';

  const selectedOption = FEEDBACK_OPTIONS.find(o => o.type === selectedType)!;

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowTypeDropdown(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  // Auto-focus textarea when panel opens
  useEffect(() => {
    if (isOpen && status === 'idle') {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen, status]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => {
      if (prev) {
        // reset on close
        setStatus('idle');
        setMessage('');
        setSelectedType('feedback');
        setShowTypeDropdown(false);
      }
      return !prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setStatus('idle');

    try {
      if (onSubmit) {
        await onSubmit(selectedType, trimmed);
      } else {
        // Default: log to console (replace with your Firebase call)
        console.info('[FeedbackFAB]', { type: selectedType, message: trimmed, userId });
        await new Promise(r => setTimeout(r, 800)); // simulate async
      }
      setStatus('success');
      setMessage('');
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
        setSelectedType('feedback');
      }, 2000);
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }, [message, loading, onSubmit, selectedType, userId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div
      dir="rtl"
      ref={panelRef}
      className={`fixed ${positionClass} z-50 flex flex-col items-start`}
    >
      {/* Floating Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className={`absolute bottom-14 ${panelAlignClass} w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-l from-slate-50 to-white">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#5BC2F2]/10 flex items-center justify-center">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[#5BC2F2]" />
                </div>
                <span className="text-sm font-black text-gray-800">שלחו לנו משוב</span>
              </div>
              <button
                onClick={handleToggle}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="סגור"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-col items-center justify-center gap-3 px-4 py-8"
                >
                  <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-green-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-gray-800">תודה רבה! 🙏</p>
                    <p className="text-xs text-gray-500 mt-1">המשוב שלכם נשלח בהצלחה</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-4 space-y-3"
                >
                  {/* Type Selector */}
                  <div className="relative">
                    <button
                      onClick={() => setShowTypeDropdown(p => !p)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all
                        ${selectedOption.bgColor} ${selectedOption.borderColor} ${selectedOption.color}`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{selectedOption.emoji}</span>
                        <span>{selectedOption.label}</span>
                      </span>
                      <motion.div
                        animate={{ rotate: showTypeDropdown ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {showTypeDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute top-full mt-1 right-0 left-0 z-10 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden"
                        >
                          {FEEDBACK_OPTIONS.map(opt => (
                            <button
                              key={opt.type}
                              onClick={() => {
                                setSelectedType(opt.type);
                                setShowTypeDropdown(false);
                                textareaRef.current?.focus();
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-right transition-colors
                                hover:${opt.bgColor} ${selectedType === opt.type ? opt.bgColor : ''}
                                ${selectedType === opt.type ? opt.color : 'text-gray-700'}`}
                            >
                              <span>{opt.emoji}</span>
                              <span>{opt.label}</span>
                              {selectedType === opt.type && (
                                <span className="mr-auto text-xs opacity-60">✓</span>
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Textarea */}
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={e => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                      onKeyDown={handleKeyDown}
                      placeholder={selectedOption.placeholder}
                      rows={4}
                      disabled={loading}
                      className="w-full resize-none text-sm text-gray-700 placeholder:text-gray-300 border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:border-[#5BC2F2] focus:outline-none transition-colors leading-relaxed disabled:opacity-60"
                    />
                    <span className={`absolute bottom-2 left-2 text-[10px] font-medium transition-colors
                      ${message.length > MAX_LENGTH * 0.9 ? 'text-red-400' : 'text-gray-300'}`}>
                      {message.length}/{MAX_LENGTH}
                    </span>
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {status === 'error' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 text-red-500 text-xs font-medium px-1"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>שליחה נכשלה, נסו שוב</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || loading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black text-white
                      bg-[#5BC2F2] disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm shadow-sky-200"
                  >
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                    <span>{loading ? 'שולח...' : 'שלח משוב'}</span>
                  </button>

                  <p className="text-[10px] text-gray-400 text-center">
                    Ctrl+Enter לשליחה מהירה
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button */}
      <motion.button
        onClick={handleToggle}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        aria-label={isOpen ? 'סגור משוב' : 'שלח משוב'}
        className={`relative w-11 h-11 rounded-2xl shadow-lg flex items-center justify-center transition-colors duration-200
          ${isOpen
            ? 'bg-gray-700 shadow-gray-400/30'
            : 'bg-[#5BC2F2] shadow-sky-300/40'
          }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="w-4.5 h-4.5 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MessageSquarePlus className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulse ring — shown when closed to draw attention */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-2xl animate-ping bg-[#5BC2F2]/30 pointer-events-none" />
        )}
      </motion.button>

      {/* Tooltip label */}
      <AnimatePresence>
        {!isOpen && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ delay: 0.6, duration: 0.2 }}
            className="absolute right-full mr-2 bottom-1.5 whitespace-nowrap text-[11px] font-bold text-white bg-gray-800/80 backdrop-blur-sm px-2 py-1 rounded-lg pointer-events-none"
          >
            משוב / דיווח
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}