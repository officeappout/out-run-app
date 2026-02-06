'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2, Tag } from 'lucide-react';
import {
  ProductTask,
  ProductTag,
  TaskStatus,
  TaskPriority,
  TaskSource,
  UserFeedback,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_SOURCE_LABELS,
} from '@/types/product-roadmap.types';
import { AdminUser } from '@/features/admin/services/admin-management.service';

interface RoadmapTaskFormProps {
  task: ProductTask | null;
  tags: ProductTag[];
  admins: AdminUser[];
  feedbackToConvert: UserFeedback | null;
  onSave: (data: Partial<ProductTask>) => Promise<void>;
  onClose: () => void;
}

export default function RoadmapTaskForm({
  task,
  tags,
  admins,
  feedbackToConvert,
  onSave,
  onClose,
}: RoadmapTaskFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ProductTask>>({
    title: '',
    description: '',
    source: 'admin',
    priority: 'medium',
    status: 'backlog',
    tags: [],
    assignedTo: undefined,
    assignedToName: undefined,
    dueDate: undefined,
    estimatedHours: undefined,
  });

  // Initialize form with task data or feedback
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description,
        source: task.source,
        priority: task.priority,
        status: task.status,
        tags: task.tags,
        assignedTo: task.assignedTo,
        assignedToName: task.assignedToName,
        dueDate: task.dueDate,
        estimatedHours: task.estimatedHours,
      });
    } else if (feedbackToConvert) {
      setFormData({
        title: `משוב: ${feedbackToConvert.content.slice(0, 50)}${feedbackToConvert.content.length > 50 ? '...' : ''}`,
        description: feedbackToConvert.content,
        source: 'user',
        priority: 'medium',
        status: 'backlog',
        tags: [],
        feedbackId: feedbackToConvert.id,
      });
    }
  }, [task, feedbackToConvert]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[TaskForm] handleSubmit called with formData:', formData);
    
    if (!formData.title?.trim()) {
      console.log('[TaskForm] Title is empty, returning');
      return;
    }

    setIsSaving(true);
    try {
      console.log('[TaskForm] Calling onSave...');
      await onSave(formData);
      console.log('[TaskForm] onSave completed successfully');
    } catch (error) {
      console.error('[TaskForm] Error saving task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTagToggle = (tagName: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.includes(tagName)
        ? prev.tags.filter(t => t !== tagName)
        : [...(prev.tags || []), tagName],
    }));
  };

  const handleAssigneeChange = (adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    setFormData(prev => ({
      ...prev,
      assignedTo: adminId || undefined,
      assignedToName: admin?.name || undefined,
    }));
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
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {task ? 'עריכת משימה' : feedbackToConvert ? 'המרת משוב למשימה' : 'משימה חדשה'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              כותרת *
            </label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="מה צריך לעשות?"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              תיאור
            </label>
            <textarea
              value={formData.description || ''}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="פרטים נוספים על המשימה..."
            />
          </div>

          {/* Row: Source, Priority, Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                מקור
              </label>
              <select
                value={formData.source || 'admin'}
                onChange={e => setFormData(prev => ({ ...prev, source: e.target.value as TaskSource }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {Object.entries(TASK_SOURCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                עדיפות
              </label>
              <select
                value={formData.priority || 'medium'}
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                סטטוס
              </label>
              <select
                value={formData.status || 'backlog'}
                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as TaskStatus }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Assignee, Due Date, Estimated Hours */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                אחראי
              </label>
              <select
                value={formData.assignedTo || ''}
                onChange={e => handleAssigneeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">בחר אחראי</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                תאריך יעד
              </label>
              <input
                type="date"
                value={formData.dueDate ? new Date(formData.dueDate).toISOString().split('T')[0] : ''}
                onChange={e => setFormData(prev => ({ 
                  ...prev, 
                  dueDate: e.target.value ? new Date(e.target.value) : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                הערכת שעות
              </label>
              <input
                type="number"
                value={formData.estimatedHours || ''}
                onChange={e => setFormData(prev => ({ 
                  ...prev, 
                  estimatedHours: e.target.value ? parseInt(e.target.value) : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
              <Tag size={16} />
              תגיות
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => {
                const isSelected = formData.tags?.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleTagToggle(tag.name)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      isSelected ? 'ring-2 ring-offset-1' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: `${tag.color}${isSelected ? '30' : '15'}`,
                      color: tag.color,
                      ...(isSelected ? { ringColor: tag.color } : {}),
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback Info */}
          {feedbackToConvert && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-bold text-blue-700 mb-1">משוב מקורי:</p>
              <p className="text-sm text-blue-600">{feedbackToConvert.content}</p>
              {feedbackToConvert.userName && (
                <p className="text-xs text-blue-500 mt-2">מאת: {feedbackToConvert.userName}</p>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
          >
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.title?.trim() || isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            {task ? 'עדכן' : 'צור משימה'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
