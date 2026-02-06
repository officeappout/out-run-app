'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  ArrowRight, 
  User, 
  Calendar, 
  CheckCircle, 
  MessageSquare,
  Loader2,
  Plus,
  Mail
} from 'lucide-react';
import { UserFeedback } from '@/types/product-roadmap.types';
import { createFeedback } from '@/features/admin/services/product-roadmap.service';

interface FeedbackPanelProps {
  feedback: UserFeedback[];
  onClose: () => void;
  onConvert: (feedback: UserFeedback) => void;
  onRefresh: () => void;
}

export default function FeedbackPanel({
  feedback,
  onClose,
  onConvert,
  onRefresh,
}: FeedbackPanelProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newFeedback, setNewFeedback] = useState({
    content: '',
    userName: '',
    userEmail: '',
    category: '',
  });

  const unconverted = feedback.filter(f => !f.isConverted);
  const converted = feedback.filter(f => f.isConverted);

  const formatDate = (date: Date | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleCreateFeedback = async () => {
    if (!newFeedback.content.trim()) return;

    setIsSaving(true);
    try {
      await createFeedback(newFeedback);
      setNewFeedback({ content: '', userName: '', userEmail: '', category: '' });
      setShowNewForm(false);
      await onRefresh();
    } catch (error) {
      console.error('Error creating feedback:', error);
      alert('שגיאה ביצירת משוב');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Panel (Left Side Drawer in RTL = visually on the right) */}
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">משוב משתמשים</h2>
            <p className="text-sm text-gray-500 mt-1">
              {unconverted.length} ממתינים להמרה
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Add Feedback Button */}
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-bold hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <Plus size={18} />
              הוסף משוב ידני
            </button>
          ) : (
            <div className="bg-blue-50 rounded-xl p-4 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  תוכן המשוב *
                </label>
                <textarea
                  value={newFeedback.content}
                  onChange={e => setNewFeedback(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="מה המשתמש ביקש או הציע?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    שם
                  </label>
                  <input
                    type="text"
                    value={newFeedback.userName}
                    onChange={e => setNewFeedback(prev => ({ ...prev, userName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="אופציונלי"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    אימייל
                  </label>
                  <input
                    type="email"
                    value={newFeedback.userEmail}
                    onChange={e => setNewFeedback(prev => ({ ...prev, userEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="אופציונלי"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowNewForm(false);
                    setNewFeedback({ content: '', userName: '', userEmail: '', category: '' });
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                >
                  ביטול
                </button>
                <button
                  onClick={handleCreateFeedback}
                  disabled={!newFeedback.content.trim() || isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  הוסף
                </button>
              </div>
            </div>
          )}

          {/* Unconverted Feedback */}
          {unconverted.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-700">ממתינים להמרה ({unconverted.length})</h3>
              {unconverted.map(fb => (
                <div
                  key={fb.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                >
                  <p className="text-gray-800 mb-3">{fb.content}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {fb.userName && (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {fb.userName}
                        </span>
                      )}
                      {fb.userEmail && (
                        <span className="flex items-center gap-1">
                          <Mail size={12} />
                          {fb.userEmail}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(fb.createdAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => onConvert(fb)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm font-bold"
                    >
                      <ArrowRight size={14} />
                      המר למשימה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Converted Feedback */}
          {converted.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-500">הומרו למשימות ({converted.length})</h3>
              {converted.map(fb => (
                <div
                  key={fb.id}
                  className="bg-gray-50 border border-gray-100 rounded-xl p-4 opacity-60"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-green-500 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-600 text-sm line-clamp-2">{fb.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {fb.userName && (
                          <span className="flex items-center gap-1">
                            <User size={10} />
                            {fb.userName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {formatDate(fb.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {feedback.length === 0 && !showNewForm && (
            <div className="text-center py-12 text-gray-500">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין משוב עדיין</p>
              <p className="text-sm mt-1">משוב ממשתמשים יופיע כאן</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
