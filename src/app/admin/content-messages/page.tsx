"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import {
  getTimeContexts,
  getFocusDescriptions,
  TimeContextService,
  FocusDescriptionService,
  type TimeContext,
  type FocusDescription,
} from '@/features/workout-engine/services/contentService';
import { Plus, Edit2, Trash2, Save, X, Clock, Target } from 'lucide-react';

type TabType = 'time' | 'focus';

export default function ContentMessagesAdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('time');
  const [timeContexts, setTimeContexts] = useState<TimeContext[]>([]);
  const [focusDescriptions, setFocusDescriptions] = useState<FocusDescription[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Time Context state
  const [editingTimeContext, setEditingTimeContext] = useState<string | null>(null);
  const [showNewTimeForm, setShowNewTimeForm] = useState(false);
  const [timeForm, setTimeForm] = useState<Partial<TimeContext>>({
    hourStart: 0,
    hourEnd: 23,
    greeting: '',
  });

  // Focus Description state
  const [editingFocus, setEditingFocus] = useState<string | null>(null);
  const [showNewFocusForm, setShowNewFocusForm] = useState(false);
  const [focusForm, setFocusForm] = useState<Partial<FocusDescription>>({
    focus: '',
    phrase: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [timeData, focusData] = await Promise.all([
        getTimeContexts(),
        getFocusDescriptions(),
      ]);
      setTimeContexts(timeData);
      setFocusDescriptions(focusData);
    } catch (error) {
      console.error('Error loading content messages:', error);
      alert('שגיאה בטעינת ההודעות');
    } finally {
      setLoading(false);
    }
  };

  // Time Context handlers
  const handleSaveTimeContext = async () => {
    try {
      if (editingTimeContext) {
        await TimeContextService.update(editingTimeContext, timeForm);
      } else {
        await TimeContextService.create(timeForm as Omit<TimeContext, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadData();
      setEditingTimeContext(null);
      setShowNewTimeForm(false);
      resetTimeForm();
    } catch (error) {
      console.error('Error saving time context:', error);
      alert('שגיאה בשמירת הקשר זמן');
    }
  };

  const handleDeleteTimeContext = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הקשר הזמן הזה?')) return;
    
    try {
      await TimeContextService.delete(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting time context:', error);
      alert('שגיאה במחיקת הקשר זמן');
    }
  };

  const handleStartEditTime = (context: TimeContext) => {
    setEditingTimeContext(context.id);
    setTimeForm({
      hourStart: context.hourStart,
      hourEnd: context.hourEnd,
      greeting: context.greeting,
    });
    setShowNewTimeForm(false);
  };

  const resetTimeForm = () => {
    setTimeForm({
      hourStart: 0,
      hourEnd: 23,
      greeting: '',
    });
  };

  // Focus Description handlers
  const handleSaveFocusDescription = async () => {
    try {
      if (editingFocus) {
        await FocusDescriptionService.update(editingFocus, focusForm);
      } else {
        await FocusDescriptionService.create(focusForm as Omit<FocusDescription, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadData();
      setEditingFocus(null);
      setShowNewFocusForm(false);
      resetFocusForm();
    } catch (error) {
      console.error('Error saving focus description:', error);
      alert('שגיאה בשמירת תיאור מוקד');
    }
  };

  const handleDeleteFocusDescription = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את תיאור המוקד הזה?')) return;
    
    try {
      await FocusDescriptionService.delete(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting focus description:', error);
      alert('שגיאה במחיקת תיאור מוקד');
    }
  };

  const handleStartEditFocus = (focus: FocusDescription) => {
    setEditingFocus(focus.id);
    setFocusForm({
      focus: focus.focus,
      phrase: focus.phrase,
    });
    setShowNewFocusForm(false);
  };

  const resetFocusForm = () => {
    setFocusForm({
      focus: '',
      phrase: '',
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
          <h1 className="text-3xl font-black text-gray-900">ניהול הודעות תוכן</h1>
          <p className="text-gray-500 mt-2">נהל הקשרי זמן ותיאורי מוקד לאימונים דינמיים</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('time')}
          className={`px-6 py-3 font-bold transition-colors ${
            activeTab === 'time'
              ? 'border-b-2 border-cyan-500 text-cyan-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock size={18} className="inline ml-2" />
          הקשרי זמן
        </button>
        <button
          onClick={() => setActiveTab('focus')}
          className={`px-6 py-3 font-bold transition-colors ${
            activeTab === 'focus'
              ? 'border-b-2 border-cyan-500 text-cyan-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Target size={18} className="inline ml-2" />
          תיאורי מוקד
        </button>
      </div>

      {/* Time Contexts Tab */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => {
                resetTimeForm();
                setShowNewTimeForm(true);
                setEditingTimeContext(null);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={20} />
              הקשר זמן חדש
            </button>
          </div>

          {/* New Time Context Form */}
          {showNewTimeForm && (
            <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">הקשר זמן חדש</h3>
              <TimeContextForm
                form={timeForm}
                onChange={setTimeForm}
                onSave={handleSaveTimeContext}
                onCancel={() => {
                  setShowNewTimeForm(false);
                  resetTimeForm();
                }}
              />
            </div>
          )}

          {/* Time Contexts List */}
          <div className="space-y-4">
            {timeContexts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                אין הקשרי זמן. התחל ביצירת הקשר זמן ראשון.
              </div>
            ) : (
              timeContexts.map((context) => (
                <div
                  key={context.id}
                  className={`bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow ${
                    editingTimeContext === context.id ? 'border-2 border-cyan-500' : 'border-gray-200'
                  }`}
                >
                  {editingTimeContext === context.id ? (
                    <TimeContextForm
                      form={timeForm}
                      onChange={setTimeForm}
                      onSave={handleSaveTimeContext}
                      onCancel={() => {
                        setEditingTimeContext(null);
                        resetTimeForm();
                      }}
                    />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded">
                            {context.hourStart}:00 - {context.hourEnd}:00
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">{context.greeting}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEditTime(context)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteTimeContext(context.id)}
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
      )}

      {/* Focus Descriptions Tab */}
      {activeTab === 'focus' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => {
                resetFocusForm();
                setShowNewFocusForm(true);
                setEditingFocus(null);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
            >
              <Plus size={20} />
              תיאור מוקד חדש
            </button>
          </div>

          {/* New Focus Description Form */}
          {showNewFocusForm && (
            <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">תיאור מוקד חדש</h3>
              <FocusDescriptionForm
                form={focusForm}
                onChange={setFocusForm}
                onSave={handleSaveFocusDescription}
                onCancel={() => {
                  setShowNewFocusForm(false);
                  resetFocusForm();
                }}
              />
            </div>
          )}

          {/* Focus Descriptions List */}
          <div className="space-y-4">
            {focusDescriptions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                אין תיאורי מוקד. התחל ביצירת תיאור מוקד ראשון.
              </div>
            ) : (
              focusDescriptions.map((focus) => (
                <div
                  key={focus.id}
                  className={`bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow ${
                    editingFocus === focus.id ? 'border-2 border-cyan-500' : 'border-gray-200'
                  }`}
                >
                  {editingFocus === focus.id ? (
                    <FocusDescriptionForm
                      form={focusForm}
                      onChange={setFocusForm}
                      onSave={handleSaveFocusDescription}
                      onCancel={() => {
                        setEditingFocus(null);
                        resetFocusForm();
                      }}
                    />
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                            {focus.focus}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">{focus.phrase}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEditFocus(focus)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteFocusDescription(focus.id)}
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
      )}
    </div>
  );
}

// Time Context Form Component
function TimeContextForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: Partial<TimeContext>;
  onChange: (form: Partial<TimeContext>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">ברכה *</label>
        <input
          type="text"
          value={form.greeting || ''}
          onChange={(e) => onChange({ ...form, greeting: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="לדוגמה: בוקר טוב, צהריים טובים, ערב טוב"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">שעת התחלה (0-23) *</label>
          <input
            type="number"
            min="0"
            max="23"
            value={form.hourStart ?? 0}
            onChange={(e) => onChange({ ...form, hourStart: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">שעת סיום (0-23) *</label>
          <input
            type="number"
            min="0"
            max="23"
            value={form.hourEnd ?? 23}
            onChange={(e) => onChange({ ...form, hourEnd: parseInt(e.target.value) || 23 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onSave}
          disabled={!form.greeting || form.hourStart === undefined || form.hourEnd === undefined}
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

// Focus Description Form Component
function FocusDescriptionForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: Partial<FocusDescription>;
  onChange: (form: Partial<FocusDescription>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const focusOptions = ['abs', 'upper_body', 'lower_body', 'cardio', 'recovery', 'full_body', 'core'];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">מוקד אימון *</label>
        <select
          value={form.focus || ''}
          onChange={(e) => onChange({ ...form, focus: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          <option value="">בחר מוקד...</option>
          {focusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          אפשרויות: abs, upper_body, lower_body, cardio, recovery, full_body, core
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">ביטוי תיאור *</label>
        <input
          type="text"
          value={form.phrase || ''}
          onChange={(e) => onChange({ ...form, phrase: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="לדוגמה: ממוקד בטן, לחיזוק פלג גוף עליון"
        />
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onSave}
          disabled={!form.focus || !form.phrase}
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
