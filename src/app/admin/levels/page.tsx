"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { 
  getAllLevels, 
  createLevel, 
  updateLevel, 
  deleteLevel 
} from '@/features/content/programs';
import { Level } from '@/features/content/programs';
import { Plus, Edit2, Trash2, Save, X, Signal } from 'lucide-react';

export default function LevelsAdminPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLevel, setEditingLevel] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  
  const [levelForm, setLevelForm] = useState<Partial<Level>>({
    name: '',
    order: 1,
    description: '',
  });

  useEffect(() => {
    loadLevels();
  }, []);

  const loadLevels = async () => {
    setLoading(true);
    try {
      const data = await getAllLevels();
      setLevels(data);
    } catch (error) {
      console.error('Error loading levels:', error);
      alert('שגיאה בטעינת הרמות');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLevel = async () => {
    try {
      if (editingLevel) {
        await updateLevel(editingLevel, levelForm);
      } else {
        await createLevel(levelForm as Omit<Level, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadLevels();
      setEditingLevel(null);
      setShowNewForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving level:', error);
      alert('שגיאה בשמירת הרמה');
    }
  };

  const handleDeleteLevel = async (levelId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הרמה?')) return;
    
    try {
      await deleteLevel(levelId);
      await loadLevels();
    } catch (error) {
      console.error('Error deleting level:', error);
      alert('שגיאה במחיקת הרמה');
    }
  };

  const handleStartEdit = (level: Level) => {
    setEditingLevel(level.id);
    setLevelForm({
      name: level.name,
      order: level.order,
      description: level.description || '',
    });
    setShowNewForm(false);
  };

  const handleCancelEdit = () => {
    setEditingLevel(null);
    setShowNewForm(false);
    resetForm();
  };

  const resetForm = () => {
    setLevelForm({
      name: '',
      order: 1,
      description: '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900">ניהול רמות</h1>
          <p className="text-gray-500 mt-2">צור וערוך רמות כושר (Beginner, Intermediate, Advanced, etc.)</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowNewForm(true);
            setEditingLevel(null);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
        >
          <Plus size={20} />
          רמה חדשה
        </button>
      </div>

      {/* New Level Form */}
      {showNewForm && (
        <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
          <h3 className="text-xl font-bold mb-4">רמה חדשה</h3>
          <LevelForm
            form={levelForm}
            onChange={setLevelForm}
            onSave={handleSaveLevel}
            onCancel={handleCancelEdit}
          />
        </div>
      )}

      {/* Levels List */}
      <div className="space-y-4">
        {levels.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            אין רמות. התחל ביצירת רמה ראשונה.
          </div>
        ) : (
          levels.map((level) => (
            <div
              key={level.id}
              className={`bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow ${
                editingLevel === level.id ? 'border-2 border-cyan-500' : 'border-gray-200'
              }`}
            >
              {editingLevel === level.id ? (
                <LevelForm
                  form={levelForm}
                  onChange={setLevelForm}
                  onSave={handleSaveLevel}
                  onCancel={handleCancelEdit}
                />
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-cyan-100 text-cyan-700 text-sm font-bold rounded">
                        סדר: {level.order}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{level.name}</h3>
                    {level.description && (
                      <p className="text-gray-600 text-sm mb-3">{level.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEdit(level)}
                      className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteLevel(level.id)}
                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Level Form Component
function LevelForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: Partial<Level>;
  onChange: (form: Partial<Level>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">שם הרמה *</label>
        <input
          type="text"
          value={form.name || ''}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="לדוגמה: מתחיל (Beginner)"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">סדר *</label>
          <input
            type="number"
            min="1"
            max="10"
            value={form.order || 1}
            onChange={(e) => onChange({ ...form, order: parseInt(e.target.value) || 1 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">מספר נמוך יותר = מופיע ראשון</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">תיאור (אופציונלי)</label>
        <textarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          rows={3}
          placeholder="תיאור קצר של הרמה..."
        />
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onSave}
          disabled={!form.name}
          className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={18} />
          שמור
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
        >
          <X size={18} />
          ביטול
        </button>
      </div>
    </div>
  );
}
