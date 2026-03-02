'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Plus, Edit2, Trash2, Save, X, Loader2, ToggleLeft, ToggleRight,
  CheckCircle, AlertTriangle,
} from 'lucide-react';
import {
  getAllMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
} from '@/features/arena/services/message-templates.service';
import type {
  MessageTemplate,
  MessageCategory,
  PsychologyTag,
} from '@/types/message-template.types';
import {
  CATEGORY_LABELS,
  PSYCHOLOGY_TAG_LABELS,
  ALL_PSYCHOLOGY_TAGS,
} from '@/types/message-template.types';

const CATEGORY_COLORS: Record<MessageCategory, string> = {
  city_pressure: 'bg-amber-100 text-amber-700 border-amber-200',
  school_outreach: 'bg-purple-100 text-purple-700 border-purple-200',
};

const TAG_COLORS: Record<PsychologyTag, string> = {
  Health: 'bg-green-50 text-green-700',
  Competition: 'bg-red-50 text-red-700',
  Innovation: 'bg-blue-50 text-blue-700',
  Community: 'bg-cyan-50 text-cyan-700',
  Kids: 'bg-pink-50 text-pink-700',
  Pride: 'bg-yellow-50 text-yellow-700',
};

interface FormData {
  category: MessageCategory;
  psychologyTag: PsychologyTag;
  textMale: string;
  textFemale: string;
  isActive: boolean;
}

const INITIAL_FORM: FormData = {
  category: 'city_pressure',
  psychologyTag: 'Health',
  textMale: '',
  textFemale: '',
  isActive: true,
};

function TemplateFormModal({
  isOpen,
  onClose,
  onSave,
  initial,
  isEditing,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
  initial?: MessageTemplate;
  isEditing: boolean;
}) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && initial) {
      setForm({
        category: initial.category,
        psychologyTag: initial.psychologyTag,
        textMale: initial.textMale,
        textFemale: initial.textFemale,
        isActive: initial.isActive,
      });
    } else if (isOpen) {
      setForm(INITIAL_FORM);
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing ? 'עריכת מסר' : 'הוספת מסר חדש'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Category */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">קטגוריה</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(CATEGORY_LABELS) as [MessageCategory, string][]).map(
                ([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm({ ...form, category: val })}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${
                      form.category === val
                        ? 'bg-cyan-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {val === 'city_pressure' ? '🏛️' : '🏫'} {label}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Psychology Tag */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">תגית פסיכולוגית</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PSYCHOLOGY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setForm({ ...form, psychologyTag: tag })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    form.psychologyTag === tag
                      ? 'ring-2 ring-cyan-400 border-cyan-400'
                      : 'border-gray-200'
                  } ${TAG_COLORS[tag]}`}
                >
                  {PSYCHOLOGY_TAG_LABELS[tag]}
                </button>
              ))}
            </div>
          </div>

          {/* Male text */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              טקסט — זכר
            </label>
            <textarea
              value={form.textMale}
              onChange={(e) => setForm({ ...form, textMale: e.target.value })}
              rows={3}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black bg-white text-sm"
              placeholder="היי ${contactPerson}, אני אווטיר ב-Out ומתאמן ב..."
            />
            <p className="text-[10px] text-gray-400 mt-1">
              משתנים: {'${contactPerson}'}, {'${cityName}'}, {'${schoolName}'}
            </p>
          </div>

          {/* Female text */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              טקסט — נקבה
            </label>
            <textarea
              value={form.textFemale}
              onChange={(e) => setForm({ ...form, textFemale: e.target.value })}
              rows={3}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black bg-white text-sm"
              placeholder="היי ${contactPerson}, אני אווטירית ב-Out ומתאמנת ב..."
            />
          </div>

          {/* Active */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <span className="text-sm font-medium text-gray-700">מסר פעיל</span>
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`p-1.5 rounded-lg transition-colors ${
                form.isActive ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              {form.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
            </button>
          </div>

          {/* Preview */}
          {form.textMale && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 mb-2">תצוגה מקדימה (זכר):</p>
              <p className="text-sm text-gray-800 leading-relaxed">
                {form.textMale
                  .replace('${contactPerson}', 'יוסי ממחלקת ספורט')
                  .replace('${cityName}', 'תל אביב')
                  .replace('${schoolName}', 'בית ספר הרצוג')}
              </p>
              <p className="text-xs text-cyan-600 mt-1">https://appout.co.il/</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border rounded-xl font-bold text-gray-700 hover:bg-gray-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || !form.textMale || !form.textFemale}
              className="flex-1 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEditing ? 'עדכון' : 'הוספה'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function PressureMessagesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MessageCategory | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getAllMessageTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filtered =
    filter === 'all' ? templates : templates.filter((t) => t.category === filter);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = async (data: FormData) => {
    await createMessageTemplate(data);
    showToast('success', 'מסר נוצר בהצלחה');
    loadTemplates();
  };

  const handleUpdate = async (data: FormData) => {
    if (!editing) return;
    await updateMessageTemplate(editing.id, data);
    showToast('success', 'מסר עודכן');
    setEditing(null);
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק את המסר?')) return;
    await deleteMessageTemplate(id);
    showToast('success', 'מסר נמחק');
    loadTemplates();
  };

  const handleToggle = async (t: MessageTemplate) => {
    await updateMessageTemplate(t.id, { isActive: !t.isActive });
    loadTemplates();
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">ניהול מסרי לחץ</h1>
            <p className="text-sm text-gray-500">מסרים דינמיים למנוע הלחץ העירוני ופנייה לבתי ספר</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="px-5 py-2.5 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-5 h-5" />
          מסר חדש
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'city_pressure', 'school_outreach'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filter === f
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all'
              ? `הכל (${templates.length})`
              : `${CATEGORY_LABELS[f]} (${templates.filter((t) => t.category === f).length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-1">אין מסרים</h3>
          <p className="text-sm text-gray-500 mb-4">
            צור מסר ראשון כדי שהמנוע הדינמי ישתמש בו
          </p>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="px-5 py-2.5 bg-cyan-500 text-white rounded-xl font-bold"
          >
            צור מסר
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence>
            {filtered.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`bg-white rounded-xl border shadow-sm p-5 ${!t.isActive ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full border ${CATEGORY_COLORS[t.category]}`}>
                        {CATEGORY_LABELS[t.category]}
                      </span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${TAG_COLORS[t.psychologyTag]}`}>
                        {PSYCHOLOGY_TAG_LABELS[t.psychologyTag]}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-900">
                        <span className="font-bold text-blue-600 text-xs ml-1">♂</span>
                        {t.textMale.length > 100 ? t.textMale.slice(0, 100) + '...' : t.textMale}
                      </p>
                      <p className="text-sm text-gray-900">
                        <span className="font-bold text-pink-600 text-xs ml-1">♀</span>
                        {t.textFemale.length > 100 ? t.textFemale.slice(0, 100) + '...' : t.textFemale}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggle(t)}
                      className={`p-2 rounded-lg transition-colors ${t.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                      {t.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button
                      onClick={() => { setEditing(t); setModalOpen(true); }}
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <TemplateFormModal
            isOpen={modalOpen}
            onClose={() => { setModalOpen(false); setEditing(null); }}
            onSave={editing ? handleUpdate : handleCreate}
            initial={editing ?? undefined}
            isEditing={!!editing}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 font-medium z-50 ${
              toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
