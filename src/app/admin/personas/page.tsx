'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getAllPersonas,
  createPersona,
  updatePersona,
  deletePersona,
} from '@/features/content/personas';
import { Persona, PersonaFormData } from '@/features/content/personas';
import { Plus, Edit2, Trash2, Save, X, Sparkles, Check } from 'lucide-react';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { safeRenderText } from '@/utils/render-helpers';

// Lifestyle tag labels
const LIFESTYLE_TAG_LABELS: Record<string, string> = {
  student: 'סטודנט',
  parent: 'הורה',
  office_worker: 'עובד משרד',
  remote_worker: 'עובד מהבית',
  athlete: 'ספורטאי',
  senior: 'גיל הזהב',
};

export default function PersonasAdminPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPersona, setEditingPersona] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [activeLang, setActiveLang] = useState<'he' | 'en' | 'es'>('he');
  
  const [personaForm, setPersonaForm] = useState<Partial<PersonaFormData>>({
    name: { he: '', en: '', es: '' },
    description: { he: '', en: '', es: '' },
    imageUrl: '',
    linkedLifestyleTags: [],
    themeColor: '#3B82F6',
  });

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    setLoading(true);
    try {
      const data = await getAllPersonas();
      setPersonas(data);
    } catch (error) {
      console.error('Error loading personas:', error);
      alert('שגיאה בטעינת הפרסונות');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePersona = async () => {
    try {
      if (editingPersona) {
        await updatePersona(editingPersona, personaForm as Partial<PersonaFormData>);
      } else {
        await createPersona(personaForm as PersonaFormData);
      }
      await loadPersonas();
      setEditingPersona(null);
      setShowNewForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving persona:', error);
      alert('שגיאה בשמירת הפרסונה');
    }
  };

  const handleDeletePersona = async (personaId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הפרסונה הזו?')) return;
    
    try {
      await deletePersona(personaId);
      await loadPersonas();
    } catch (error) {
      console.error('Error deleting persona:', error);
      alert('שגיאה במחיקת הפרסונה');
    }
  };

  const handleStartEdit = (persona: Persona) => {
    setEditingPersona(persona.id);
    setPersonaForm({
      name: persona.name,
      description: persona.description,
      imageUrl: persona.imageUrl,
      linkedLifestyleTags: persona.linkedLifestyleTags,
      themeColor: persona.themeColor,
    });
    setShowNewForm(false);
  };

  const resetForm = () => {
    setPersonaForm({
      name: { he: '', en: '', es: '' },
      description: { he: '', en: '', es: '' },
      imageUrl: '',
      linkedLifestyleTags: [],
      themeColor: '#3B82F6',
    });
  };

  const toggleLifestyleTag = (tag: string) => {
    const currentTags = personaForm.linkedLifestyleTags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    setPersonaForm({ ...personaForm, linkedLifestyleTags: newTags });
  };

  if (loading && personas.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900">ניהול פרסונות (למורים)</h1>
          <p className="text-gray-500 mt-2">צור וערוך דמויות למורים למשתמשים</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowNewForm(true);
            setEditingPersona(null);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors shadow-lg"
        >
          <Plus size={20} />
          פרסונה חדשה
        </button>
      </div>

      {/* New/Edit Form */}
      {(showNewForm || editingPersona) && (
        <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
          <h3 className="text-xl font-bold mb-4">
            {editingPersona ? 'עריכת פרסונה' : 'פרסונה חדשה'}
          </h3>
          
          {/* Language Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200">
            {(['he', 'en', 'es'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`px-4 py-2 font-bold text-sm transition-colors ${
                  activeLang === lang
                    ? 'border-b-2 border-cyan-500 text-cyan-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">שם הפרסונה ({activeLang.toUpperCase()})</label>
              <input
                type="text"
                value={personaForm.name?.[activeLang] || ''}
                onChange={(e) =>
                  setPersonaForm({
                    ...personaForm,
                    name: {
                      ...personaForm.name,
                      [activeLang]: e.target.value,
                    },
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="לדוגמה: הלמור המשרדי"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">תיאור ({activeLang.toUpperCase()})</label>
              <textarea
                value={personaForm.description?.[activeLang] || ''}
                onChange={(e) =>
                  setPersonaForm({
                    ...personaForm,
                    description: {
                      ...personaForm.description,
                      [activeLang]: e.target.value,
                    },
                  })
                }
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="תיאור הפרסונה..."
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">קישור לתמונה</label>
              <input
                type="url"
                value={personaForm.imageUrl || ''}
                onChange={(e) => setPersonaForm({ ...personaForm, imageUrl: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="https://example.com/lemur.png"
              />
              {personaForm.imageUrl && (
                <div className="mt-2 w-32 h-32 rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={personaForm.imageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            {/* Theme Color */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">צבע נושא</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={personaForm.themeColor || '#3B82F6'}
                  onChange={(e) => setPersonaForm({ ...personaForm, themeColor: e.target.value })}
                  className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={personaForm.themeColor || '#3B82F6'}
                  onChange={(e) => setPersonaForm({ ...personaForm, themeColor: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono text-sm"
                  placeholder="#3B82F6"
                />
              </div>
            </div>

            {/* Lifestyle Tags */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">תגיות אורח חיים מקושרות</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(LIFESTYLE_TAG_LABELS).map(([tagId, tagLabel]) => (
                  <button
                    key={tagId}
                    type="button"
                    onClick={() => toggleLifestyleTag(tagId)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      (personaForm.linkedLifestyleTags || []).includes(tagId)
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {(personaForm.linkedLifestyleTags || []).includes(tagId) && <Check size={16} />}
                    <span className="font-bold text-sm">{tagLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <button
                onClick={handleSavePersona}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
              >
                <Save size={18} />
                שמור
              </button>
              <button
                onClick={() => {
                  setShowNewForm(false);
                  setEditingPersona(null);
                  resetForm();
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
              >
                <X size={18} />
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personas List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {personas.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
              <Sparkles size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">לא נמצאו פרסונות</h3>
            <p className="text-gray-500 mt-2">
              {showNewForm ? '' : 'התחל על ידי הוספת הפרסונה הראשונה למערכת'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {personas.map((persona) => (
              <div
                key={persona.id}
                className="border-2 border-gray-200 rounded-2xl p-6 hover:border-cyan-500 transition-all hover:shadow-lg"
                style={{
                  borderColor: editingPersona === persona.id ? persona.themeColor : undefined,
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {getLocalizedText(persona.name, 'he')}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {getLocalizedText(persona.description, 'he')}
                    </p>
                  </div>
                  {persona.imageUrl && (
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0">
                      <img
                        src={persona.imageUrl}
                        alt={getLocalizedText(persona.name, 'he')}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Lifestyle Tags */}
                {persona.linkedLifestyleTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {persona.linkedLifestyleTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full"
                      >
                        {LIFESTYLE_TAG_LABELS[tag] || tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Theme Color Preview */}
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-gray-300"
                    style={{ backgroundColor: persona.themeColor }}
                  />
                  <span className="text-xs font-mono text-gray-600">{persona.themeColor}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartEdit(persona)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold hover:bg-blue-100 transition-colors"
                  >
                    <Edit2 size={16} />
                    ערוך
                  </button>
                  <button
                    onClick={() => handleDeletePersona(persona.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="מחק"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
