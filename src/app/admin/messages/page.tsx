'use client';

/**
 * Smart Messages Admin Panel
 * 
 * Manage contextual messages that appear throughout the app:
 * - Post-workout celebrations
 * - Re-engagement prompts
 * - Personal record notifications
 * - And more...
 * 
 * Changes reflect instantly in the app via Firestore real-time updates.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Save,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Filter,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  messageService,
  MESSAGE_TYPE_LABELS,
  type SmartMessage,
  type SmartMessageInput,
  type MessageType,
} from '@/features/messages';
import { 
  USER_LIFESTYLES, 
  MESSAGE_VARIABLES,
  replaceMessageVariables,
} from '@/core/constants';

// ============================================================================
// TYPES
// ============================================================================

interface MessageFormData {
  type: MessageType;
  text: string;
  subText: string;
  priority: number;
  isActive: boolean;
  targetPersona: string;
  minStreak: number | '';
  maxStreak: number | '';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INITIAL_FORM_DATA: MessageFormData = {
  type: 'post_workout',
      text: '',
  subText: '',
  priority: 5,
  isActive: true,
  targetPersona: '',
  minStreak: '',
  maxStreak: '',
};

const MESSAGE_TYPE_COLORS: Record<MessageType, string> = {
  post_workout: 'bg-green-100 text-green-700 border-green-200',
  partial_workout: 'bg-amber-100 text-amber-700 border-amber-200',
  re_engagement: 'bg-blue-100 text-blue-700 border-blue-200',
  pr_record: 'bg-purple-100 text-purple-700 border-purple-200',
  streak_milestone: 'bg-orange-100 text-orange-700 border-orange-200',
  level_up: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  first_workout: 'bg-pink-100 text-pink-700 border-pink-200',
  default: 'bg-gray-100 text-gray-700 border-gray-200',
};

const MESSAGE_TYPE_ICONS: Record<MessageType, string> = {
  post_workout: '🎉',
  partial_workout: '💪',
  re_engagement: '👋',
  pr_record: '🏆',
  streak_milestone: '🔥',
  level_up: '⬆️',
  first_workout: '🌟',
  default: '💬',
};

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Message Card Component
 */
function MessageCard({
  message,
  onEdit,
  onDelete,
  onToggle,
}: {
  message: SmartMessage;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const typeColor = MESSAGE_TYPE_COLORS[message.type];
  const typeIcon = MESSAGE_TYPE_ICONS[message.type];
  
    return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`
        bg-white rounded-xl border shadow-sm p-4
        ${!message.isActive ? 'opacity-50' : ''}
        hover:shadow-md transition-shadow
      `}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Type Badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full border ${typeColor}`}>
              {typeIcon} {MESSAGE_TYPE_LABELS[message.type]}
            </span>
            <span className="text-xs text-gray-400">
              עדיפות: {message.priority}
            </span>
      </div>

          {/* Text */}
          <h3 className="font-bold text-gray-900 text-lg mb-1 truncate">
            {message.text}
          </h3>
          {message.subText && (
            <p className="text-gray-500 text-sm truncate">
              {message.subText}
            </p>
          )}
          
          {/* Constraints */}
          {(message.targetPersona || message.minStreak || message.maxStreak) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {message.targetPersona && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  פרסונה: {message.targetPersona}
                          </span>
                        )}
              {message.minStreak && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  רצף מינימום: {message.minStreak}
                          </span>
                        )}
              {message.maxStreak && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  רצף מקסימום: {message.maxStreak}
                          </span>
                        )}
                      </div>
            )}
          </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
            <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              message.isActive 
                ? 'text-green-600 hover:bg-green-50' 
                : 'text-gray-400 hover:bg-gray-50'
            }`}
            title={message.isActive ? 'פעיל - לחץ לכיבוי' : 'כבוי - לחץ להפעלה'}
          >
            {message.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            
            <button
            onClick={onEdit}
            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
            title="עריכה"
          >
            <Edit2 className="w-4 h-4" />
            </button>
          
                        <button
            onClick={onDelete}
            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            title="מחיקה"
          >
            <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
    </motion.div>
  );
}

/**
 * Message Form Modal
 */
function MessageFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEditing,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MessageFormData) => Promise<void>;
  initialData?: SmartMessage;
  isEditing: boolean;
}) {
  const [formData, setFormData] = useState<MessageFormData>(INITIAL_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);
  
  // Reset form when opening/closing
  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        type: initialData.type,
        text: initialData.text,
        subText: initialData.subText || '',
        priority: initialData.priority,
        isActive: initialData.isActive,
        targetPersona: initialData.targetPersona || '',
        minStreak: initialData.minStreak || '',
        maxStreak: initialData.maxStreak || '',
      });
    } else if (isOpen) {
      setFormData(INITIAL_FORM_DATA);
    }
  }, [isOpen, initialData]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing ? 'עריכת הודעה' : 'הוספת הודעה חדשה'}
          </h2>
                        <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
                        </button>
                      </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סוג הודעה
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as MessageType })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {MESSAGE_TYPE_ICONS[value as MessageType]} {label}
                </option>
              ))}
            </select>
          </div>

          {/* Main Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              טקסט ראשי *
            </label>
            <input
              type="text"
              value={formData.text}
              onChange={(e) => setFormData({ ...formData, text: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="כל הכבוד!"
              required
              />
            </div>
          
          {/* Sub Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              טקסט משני
            </label>
            <input
              type="text"
              value={formData.subText}
              onChange={(e) => setFormData({ ...formData, subText: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="סיימת את האימון בהצלחה"
            />
                        </div>
          
          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              עדיפות (1-10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>נמוכה (1)</span>
              <span className="font-bold text-primary">{formData.priority}</span>
              <span>גבוהה (10)</span>
                      </div>
                      </div>
          
          {/* Dynamic Variables Helper */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-700 mb-2">משתנים דינמיים:</p>
            <div className="flex flex-wrap gap-2">
              {MESSAGE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setFormData({ ...formData, text: formData.text + v.key })}
                  className="text-xs bg-white px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors"
                  title={v.description}
                >
                  <span className="font-mono">{v.key}</span>
                  <span className="text-blue-400 mr-1">({v.example})</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-blue-500 mt-2">
              לחץ על משתנה כדי להוסיף אותו לטקסט. הוא יוחלף אוטומטית בערך האמיתי.
            </p>
          </div>
          
          {/* Advanced Options */}
          <details className="bg-gray-50 rounded-lg p-3">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">
              אפשרויות מתקדמות
            </summary>
            <div className="mt-3 space-y-3">
              {/* Target Persona */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  פרסונת יעד
                </label>
                <select
                  value={formData.targetPersona}
                  onChange={(e) => setFormData({ ...formData, targetPersona: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">כל המשתמשים</option>
                  {USER_LIFESTYLES.map((lifestyle) => (
                    <option key={lifestyle.id} value={lifestyle.id}>
                      {lifestyle.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  הודעה תוצג רק למשתמשים עם סגנון חיים תואם, או &quot;כללי&quot;
                </p>
              </div>

              {/* Streak Range */}
              <div className="grid grid-cols-2 gap-3">
      <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    רצף מינימום
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minStreak}
                    onChange={(e) => setFormData({ ...formData, minStreak: e.target.value ? parseInt(e.target.value) : '' })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="0"
                  />
      </div>
      <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    רצף מקסימום
                  </label>
          <input
                    type="number"
                    min="0"
                    value={formData.maxStreak}
                    onChange={(e) => setFormData({ ...formData, maxStreak: e.target.value ? parseInt(e.target.value) : '' })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="∞"
                  />
        </div>
          </div>
            </div>
          </details>
          
          {/* Live Preview */}
          {formData.text && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">תצוגה מקדימה:</p>
                {formData.targetPersona && (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {USER_LIFESTYLES.find(l => l.id === formData.targetPersona)?.label || formData.targetPersona}
                  </span>
                )}
              </div>
              <div className={`p-4 rounded-xl bg-gradient-to-br ${
                formData.type === 'post_workout' ? 'from-green-500/10 to-emerald-500/5' :
                formData.type === 'partial_workout' ? 'from-amber-500/10 to-orange-500/5' :
                formData.type === 're_engagement' ? 'from-blue-500/10 to-cyan-500/5' :
                formData.type === 'pr_record' ? 'from-yellow-500/10 to-amber-500/5' :
                formData.type === 'streak_milestone' ? 'from-orange-500/10 to-red-500/5' :
                formData.type === 'level_up' ? 'from-purple-500/10 to-pink-500/5' :
                formData.type === 'first_workout' ? 'from-cyan-500/10 to-blue-500/5' :
                'from-primary/10 to-cyan-500/5'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl">
                    {MESSAGE_TYPE_ICONS[formData.type]}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      {replaceMessageVariables(formData.text, { name: 'יוסי', streak: 5, level: 7, program: 'פלג גוף עליון' })}
                    </h3>
                    {formData.subText && (
                      <p className="text-sm text-gray-500">
                        {replaceMessageVariables(formData.subText, { name: 'יוסי', streak: 5, level: 7, program: 'פלג גוף עליון' })}
                      </p>
        )}
      </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">הודעה פעילה</span>
        <button
              type="button"
              onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                formData.isActive ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  formData.isActive ? 'right-1' : 'right-7'
                }`}
              />
        </button>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-2">
        <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
            <button
              type="submit"
              disabled={isSaving || !formData.text}
              className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {isEditing ? 'עדכון' : 'הוספה'}
        </button>
      </div>
        </form>
      </motion.div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function MessagesAdminPage() {
  const [messages, setMessages] = useState<SmartMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<MessageType | 'all'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<SmartMessage | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Subscribe to messages (use localStorage for instant sync + Firestore for persistence)
  useEffect(() => {
    // First, load from localStorage for instant display
    const localMessages = messageService.getMessagesFromLocal();
    if (localMessages.length > 0) {
      setMessages(localMessages);
      setIsLoading(false);
    }
    
    // Then subscribe to Firestore for updates
    const unsubscribe = messageService.subscribeToAllMessages((msgs) => {
      setMessages(msgs);
      setIsLoading(false);
    });
    
    // Also subscribe to local changes
    const localUnsubscribe = messageService.subscribeToLocalMessages((msgs) => {
      setMessages(msgs);
    });
    
    return () => {
      unsubscribe();
      localUnsubscribe();
    };
  }, []);
  
  // Filter messages
  const filteredMessages = filter === 'all' 
    ? messages 
    : messages.filter(m => m.type === filter);
  
  // Group by type for display
  const groupedMessages = filteredMessages.reduce((acc, msg) => {
    if (!acc[msg.type]) acc[msg.type] = [];
    acc[msg.type].push(msg);
    return acc;
  }, {} as Record<MessageType, SmartMessage[]>);
  
  // Show notification
  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };
  
  // Handlers
  const handleCreate = async (data: MessageFormData) => {
    const input: SmartMessageInput = {
      type: data.type,
      text: data.text,
      subText: data.subText || undefined,
      priority: data.priority,
      isActive: data.isActive,
      targetPersona: data.targetPersona || undefined,
      minStreak: typeof data.minStreak === 'number' ? data.minStreak : undefined,
      maxStreak: typeof data.maxStreak === 'number' ? data.maxStreak : undefined,
    };
    
    const result = await messageService.createMessage(input);
    if (result) {
      showNotification('success', 'ההודעה נוצרה בהצלחה');
    } else {
      showNotification('error', 'שגיאה ביצירת ההודעה');
    }
  };
  
  const handleUpdate = async (data: MessageFormData) => {
    if (!editingMessage) return;
    
    const updates: Partial<SmartMessageInput> = {
      type: data.type,
      text: data.text,
      subText: data.subText || undefined,
      priority: data.priority,
      isActive: data.isActive,
      targetPersona: data.targetPersona || undefined,
      minStreak: typeof data.minStreak === 'number' ? data.minStreak : undefined,
      maxStreak: typeof data.maxStreak === 'number' ? data.maxStreak : undefined,
    };
    
    const success = await messageService.updateMessage(editingMessage.id, updates);
    if (success) {
      showNotification('success', 'ההודעה עודכנה בהצלחה');
    } else {
      showNotification('error', 'שגיאה בעדכון ההודעה');
    }
    setEditingMessage(null);
  };
  
  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק את ההודעה?')) return;
    
    const success = await messageService.deleteMessage(id);
    if (success) {
      showNotification('success', 'ההודעה נמחקה');
    } else {
      showNotification('error', 'שגיאה במחיקת ההודעה');
    }
  };
  
  const handleToggle = async (id: string) => {
    const success = await messageService.toggleMessageActive(id);
    if (!success) {
      showNotification('error', 'שגיאה בשינוי סטטוס ההודעה');
    }
  };
  
  const handleSeedDefaults = async () => {
    if (!confirm('האם להוסיף הודעות ברירת מחדל?')) return;
    
    const count = await messageService.seedDefaultMessages();
    showNotification('success', `נוספו ${count} הודעות ברירת מחדל`);
  };
  
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
      <div>
                <h1 className="text-xl font-bold text-gray-900">הודעות חכמות</h1>
                <p className="text-sm text-gray-500">ניהול הודעות קונטקסטואליות</p>
              </div>
      </div>

            <div className="flex items-center gap-2">
          <button
                onClick={handleSeedDefaults}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
          >
                <Zap className="w-4 h-4" />
                ברירות מחדל
          </button>
              
                <button
                onClick={() => {
                  setEditingMessage(null);
                  setIsModalOpen(true);
                }}
                className="px-4 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                הודעה חדשה
                </button>
              </div>
      </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
        <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                filter === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              הכל ({messages.length})
        </button>
            {Object.entries(MESSAGE_TYPE_LABELS).map(([type, label]) => {
              const count = messages.filter(m => m.type === type).length;
              return (
        <button
                  key={type}
                  onClick={() => setFilter(type as MessageType)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    filter === type
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {MESSAGE_TYPE_ICONS[type as MessageType]} {label} ({count})
        </button>
              );
            })}
      </div>
    </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">אין הודעות</h3>
            <p className="text-gray-500 mb-4">
              {filter === 'all' 
                ? 'עדיין לא נוצרו הודעות. לחץ על "הודעה חדשה" להתחיל.'
                : `אין הודעות מסוג "${MESSAGE_TYPE_LABELS[filter as MessageType]}".`
              }
            </p>
          <button
              onClick={() => {
                setEditingMessage(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors"
            >
              צור הודעה ראשונה
          </button>
        </div>
        ) : (
          <div className="space-y-6">
            {filter === 'all' ? (
              // Grouped view
              Object.entries(groupedMessages).map(([type, msgs]) => (
                <div key={type}>
                  <h2 className="text-sm font-bold text-gray-500 mb-3 flex items-center gap-2">
                    <span>{MESSAGE_TYPE_ICONS[type as MessageType]}</span>
                    <span>{MESSAGE_TYPE_LABELS[type as MessageType]}</span>
                    <span className="text-gray-400">({msgs.length})</span>
                  </h2>
          <div className="space-y-2">
                    <AnimatePresence>
                      {msgs.map((msg) => (
                        <MessageCard
                          key={msg.id}
                          message={msg}
                          onEdit={() => {
                            setEditingMessage(msg);
                            setIsModalOpen(true);
                          }}
                          onDelete={() => handleDelete(msg.id)}
                          onToggle={() => handleToggle(msg.id)}
                        />
                      ))}
                    </AnimatePresence>
              </div>
                </div>
              ))
            ) : (
              // Flat view for single type
              <div className="space-y-2">
                <AnimatePresence>
                  {filteredMessages.map((msg) => (
                    <MessageCard
                      key={msg.id}
                      message={msg}
                      onEdit={() => {
                        setEditingMessage(msg);
                        setIsModalOpen(true);
                      }}
                      onDelete={() => handleDelete(msg.id)}
                      onToggle={() => handleToggle(msg.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <MessageFormModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setEditingMessage(null);
            }}
            onSave={editingMessage ? handleUpdate : handleCreate}
            initialData={editingMessage || undefined}
            isEditing={!!editingMessage}
          />
        )}
      </AnimatePresence>
      
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`
              fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg
              flex items-center gap-2 font-medium z-50
              ${notification.type === 'success' 
                ? 'bg-green-500 text-white' 
                : 'bg-red-500 text-white'
              }
            `}
          >
            {notification.type === 'success' 
              ? <CheckCircle className="w-5 h-5" />
              : <AlertTriangle className="w-5 h-5" />
            }
            {notification.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
