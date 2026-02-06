'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Edit2, Trash2, Save, Loader2, Palette } from 'lucide-react';
import { ProductTag } from '@/types/product-roadmap.types';
import {
  createTag,
  updateTag,
  deleteTag,
} from '@/features/admin/services/product-roadmap.service';

interface TagManagerProps {
  tags: ProductTag[];
  onClose: () => void;
  onRefresh: () => void;
  adminInfo?: { adminId: string; adminName: string };
  onSuccess?: () => void;
}

// Preset colors for tags
const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#6B7280', // Gray
];

export default function TagManager({
  tags,
  onClose,
  onRefresh,
  adminInfo,
  onSuccess,
}: TagManagerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [editingTag, setEditingTag] = useState<ProductTag | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', color: '#3B82F6' });

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    setIsSaving(true);
    try {
      if (editingTag) {
        await updateTag(editingTag.id, formData, adminInfo);
      } else {
        await createTag(formData, adminInfo);
      }
      setFormData({ name: '', color: '#3B82F6' });
      setEditingTag(null);
      setShowNewForm(false);
      await onRefresh();
      onSuccess?.();
    } catch (error) {
      console.error('Error saving tag:', error);
      alert('שגיאה בשמירת תגית');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (tagId: string) => {
    if (!confirm('האם למחוק תגית זו?')) return;

    setIsSaving(true);
    try {
      await deleteTag(tagId, adminInfo);
      await onRefresh();
      onSuccess?.();
    } catch (error) {
      console.error('Error deleting tag:', error);
      alert('שגיאה במחיקת תגית');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (tag: ProductTag) => {
    setEditingTag(tag);
    setFormData({ name: tag.name, color: tag.color });
    setShowNewForm(true);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setFormData({ name: '', color: '#3B82F6' });
    setShowNewForm(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">ניהול תגיות</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* New Tag Button or Form */}
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-bold hover:border-cyan-400 hover:text-cyan-600 transition-colors"
            >
              <Plus size={18} />
              תגית חדשה
            </button>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  שם התגית
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="לדוגמה: ממשק כוח"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                  <Palette size={16} />
                  צבע
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                        formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  תצוגה מקדימה
                </label>
                <span
                  className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${formData.color}20`,
                    color: formData.color,
                  }}
                >
                  {formData.name || 'שם התגית'}
                </span>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                >
                  ביטול
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.name.trim() || isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {editingTag ? 'עדכן' : 'צור'}
                </button>
              </div>
            </div>
          )}

          {/* Tags List */}
          <div className="space-y-2">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
              >
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(tag)}
                    disabled={isSaving}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    disabled={isSaving}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {tags.length === 0 && !showNewForm && (
            <div className="text-center py-8 text-gray-500">
              <Palette size={32} className="mx-auto mb-2 opacity-50" />
              <p>אין תגיות עדיין</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
