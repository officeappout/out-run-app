'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Zap } from 'lucide-react';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { useUserStore } from '@/features/user';
import { XP_REWARDS } from '@/types/contribution.types';

interface QuickReportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
}

const ISSUE_TYPES = [
  { id: 'broken_equipment', label: 'ציוד פגום', icon: '🔧' },
  { id: 'no_lighting', label: 'תאורה לא עובדת', icon: '💡' },
  { id: 'no_water', label: 'חוסר מים', icon: '🚰' },
  { id: 'vandalism', label: 'ונדליזם', icon: '🚫' },
  { id: 'cleanliness', label: 'ניקיון', icon: '🧹' },
  { id: 'safety', label: 'בעיית בטיחות', icon: '⚠️' },
  { id: 'other', label: 'אחר', icon: '📝' },
];

export default function QuickReportSheet({ isOpen, onClose, userLocation }: QuickReportSheetProps) {
  const { profile } = useUserStore();
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!selectedIssue || !userLocation || !profile?.id) return;
    setSubmitting(true);
    try {
      await createContribution({
        userId: profile.id,
        type: 'report',
        status: 'pending',
        location: userLocation,
        issueType: selectedIssue,
        description: description.trim() || undefined,
      });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedIssue(null);
        setDescription('');
        onClose();
      }, 1800);
    } catch (err) {
      console.error('[QuickReport] Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [selectedIssue, description, userLocation, profile?.id, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative bg-white rounded-t-3xl shadow-2xl p-5"
        dir="rtl"
      >
        {/* Success overlay */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white rounded-t-3xl"
            >
              <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }} className="text-4xl mb-3">
                ⚡
              </motion.div>
              <p className="text-slate-900 text-lg font-bold mb-1">הדיווח נשלח!</p>
              <p className="text-[#00E5FF] text-sm font-bold">+{XP_REWARDS.report} XP</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-[#00E5FF]" />
            <h3 className="text-slate-900 text-base font-bold">דיווח מהיר</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform">
            <X size={16} />
          </button>
        </div>

        {/* Issue type chips */}
        <p className="text-slate-400 text-xs font-bold mb-2">מה הבעיה?</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {ISSUE_TYPES.map((issue) => (
            <button
              key={issue.id}
              onClick={() => setSelectedIssue(issue.id)}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all border ${
                selectedIssue === issue.id
                  ? 'bg-[#00E5FF] text-white border-[#00E5FF] shadow-md shadow-cyan-500/20'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              <span className="text-lg">{issue.icon}</span>
              <span>{issue.label}</span>
            </button>
          ))}
        </div>

        {/* Optional description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="פרטים נוספים (לא חובה)..."
          rows={2}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm placeholder:text-slate-400 outline-none focus:border-[#00E5FF] transition-colors resize-none mb-4"
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedIssue || submitting}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            selectedIssue && !submitting
              ? 'bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> שולח...</>
          ) : (
            'שלח דיווח ⚡'
          )}
        </button>
      </motion.div>
    </div>
  );
}
