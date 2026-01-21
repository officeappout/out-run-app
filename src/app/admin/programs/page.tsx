"use client";

import React, { useState, useEffect } from 'react';
import { 
  getAllPrograms, 
  createProgram, 
  updateProgram, 
  deleteProgram 
} from '@/features/admin/services/program.service';
import { Program } from '@/types/workout';
import { Plus, Edit2, Trash2, Save, X, ClipboardList } from 'lucide-react';

export default function ProgramsAdminPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  
  const [programForm, setProgramForm] = useState<Partial<Program>>({
    name: '',
    description: '',
    maxLevels: 5,
    isMaster: false,
    imageUrl: '',
    subPrograms: [],
  });

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    setLoading(true);
    try {
      const data = await getAllPrograms();
      setPrograms(data);
    } catch (error) {
      console.error('Error loading programs:', error);
      alert('שגיאה בטעינת התוכניות');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgram = async () => {
    try {
      if (editingProgram) {
        await updateProgram(editingProgram, programForm);
      } else {
        await createProgram(programForm as Omit<Program, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadPrograms();
      setEditingProgram(null);
      setShowNewForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving program:', error);
      alert('שגיאה בשמירת התוכנית');
    }
  };

  const handleDeleteProgram = async (programId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התוכנית?')) return;
    
    try {
      await deleteProgram(programId);
      await loadPrograms();
    } catch (error) {
      console.error('Error deleting program:', error);
      alert('שגיאה במחיקת התוכנית');
    }
  };

  const handleStartEdit = (program: Program) => {
    setEditingProgram(program.id);
    setProgramForm({
      name: program.name,
      description: program.description || '',
      maxLevels: program.maxLevels || 5,
      isMaster: program.isMaster || false,
      imageUrl: program.imageUrl || '',
      subPrograms: program.subPrograms || [],
    });
    setShowNewForm(false);
  };

  const handleCancelEdit = () => {
    setEditingProgram(null);
    setShowNewForm(false);
    resetForm();
  };

  const resetForm = () => {
    setProgramForm({
      name: '',
      description: '',
      maxLevels: 5,
      isMaster: false,
      imageUrl: '',
      subPrograms: [],
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
          <h1 className="text-3xl font-black text-gray-900">ניהול תוכניות</h1>
          <p className="text-gray-500 mt-2">צור וערוך תוכניות אימון (Full Body, Upper Body, Lower Body, etc.)</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowNewForm(true);
            setEditingProgram(null);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
        >
          <Plus size={20} />
          תוכנית חדשה
        </button>
      </div>

      {/* New Program Form */}
      {showNewForm && (
        <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
          <h3 className="text-xl font-bold mb-4">תוכנית חדשה</h3>
          <ProgramForm
            form={programForm}
            onChange={setProgramForm}
            onSave={handleSaveProgram}
            onCancel={handleCancelEdit}
            allPrograms={programs}
          />
        </div>
      )}

      {/* Programs List */}
      <div className="space-y-4">
        {programs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            אין תוכניות. התחל ביצירת תוכנית ראשונה.
          </div>
        ) : (
          programs.map((program) => (
            <div
              key={program.id}
              className={`bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow ${
                editingProgram === program.id ? 'border-2 border-cyan-500' : 'border-gray-200'
              }`}
            >
              {editingProgram === program.id ? (
                <ProgramForm
                  form={programForm}
                  onChange={setProgramForm}
                  onSave={handleSaveProgram}
                  onCancel={handleCancelEdit}
                  allPrograms={programs.filter(p => p.id !== program.id)}
                />
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {program.isMaster && (
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                          Master Program
                        </span>
                      )}
                      {program.maxLevels && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">
                          עד רמה {program.maxLevels}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{program.name}</h3>
                    {program.description && (
                      <p className="text-gray-600 text-sm mb-3">{program.description}</p>
                    )}
                    {program.imageUrl && (
                      <div className="mt-2">
                        <img 
                          src={program.imageUrl} 
                          alt={program.name}
                          className="w-32 h-20 object-cover rounded-lg"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEdit(program)}
                      className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteProgram(program.id)}
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

// Program Form Component
function ProgramForm({
  form,
  onChange,
  onSave,
  onCancel,
  allPrograms,
}: {
  form: Partial<Program>;
  onChange: (form: Partial<Program>) => void;
  onSave: () => void;
  onCancel: () => void;
  allPrograms: Program[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">שם התוכנית *</label>
        <input
          type="text"
          value={form.name || ''}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="לדוגמה: Full Body, Upper Body"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">תיאור (אופציונלי)</label>
        <textarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          rows={3}
          placeholder="תיאור התוכנית..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">רמות מקסימליות</label>
          <input
            type="number"
            min="1"
            max="25"
            value={form.maxLevels || 5}
            onChange={(e) => onChange({ ...form, maxLevels: parseInt(e.target.value) || 5 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">קישור תמונה (אופציונלי)</label>
          <input
            type="url"
            value={form.imageUrl || ''}
            onChange={(e) => onChange({ ...form, imageUrl: e.target.value || undefined })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isMaster || false}
            onChange={(e) => onChange({ ...form, isMaster: e.target.checked })}
            className="w-4 h-4 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
          />
          <span className="text-sm font-bold text-gray-700">
            Master Program (תוכנית ראשית)
          </span>
        </label>
      </div>

      {form.isMaster && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-xs font-bold text-purple-700 mb-2">
            ℹ️ Master Programs (כמו "Full Body") עוקבים אחר רמות נפרדות לכל תת-תחום ברקע
          </p>
          <p className="text-xs text-purple-600">
            למתחילים (רמה 1-5) תוצג רק רמה גלובלית מאוחדת, אך המערכת תעקוב אחר Upper Body, Lower Body ו-Core בנפרד.
          </p>
        </div>
      )}

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
