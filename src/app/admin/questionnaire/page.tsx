"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { 
  getAllQuestionsWithAnswers, 
  createQuestion, 
  updateQuestion, 
  deleteQuestion,
  createAnswer,
  updateAnswer,
  deleteAnswer,
  getFirstQuestion,
  getLevels,
  getPrograms,
  type LevelDoc,
  type ProgramDoc
} from '@/features/admin/services/questionnaire.service';
import { OnboardingQuestion, OnboardingAnswer, QuestionWithAnswers, MultilingualText, AnswerResult } from '@/types/onboarding-questionnaire';
import { Plus, Edit2, Trash2, Save, X, ChevronRight, ChevronDown, Globe, Users, List, Workflow, MoreVertical, Activity, UserRoundDown, ArrowUp, Brain, ClipboardCheck, Target, Footprints, ArrowDownToLine, MoveUp, BrainCircuit, Upload } from 'lucide-react';
import ReactFlow, { 
  type Node, 
  type Edge, 
  type Connection,
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState,
  addEdge,
  useReactFlow,
  Panel,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

type AppLanguage = 'he' | 'en' | 'ru';

// Static nodeTypes and edgeTypes for ReactFlow (must be outside component to avoid warning #002)
// These are defined at module level to ensure they are created only once and maintain reference equality
const nodeTypes = Object.freeze({});
const edgeTypes = Object.freeze({});

/**
 * Helper: Get text from MultilingualText or string (backwards compatibility)
 */
function getTextValue(text: string | MultilingualText | undefined, lang: AppLanguage, gender: 'neutral' | 'female' = 'neutral'): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  const langText = text[lang];
  if (!langText) return '';
  if (gender === 'female' && langText.female) return langText.female;
  return langText.neutral || '';
}

/**
 * Helper: Set text value in MultilingualText format
 */
function setTextValue(
  currentText: string | MultilingualText | undefined,
  lang: AppLanguage,
  gender: 'neutral' | 'female',
  value: string
): MultilingualText {
  const text: MultilingualText = typeof currentText === 'string' 
    ? { he: { neutral: currentText } }
    : (currentText || {});
  
  if (!text[lang]) {
    text[lang] = { neutral: '' };
  }
  
  if (gender === 'female') {
    text[lang] = { ...text[lang], female: value };
  } else {
    text[lang] = { ...text[lang], neutral: value };
  }
  
  return text;
}

/**
 * Helper: Check which languages have content
 */
function getAvailableLanguages(text: string | MultilingualText | undefined): AppLanguage[] {
  if (!text) return [];
  if (typeof text === 'string') return ['he']; // Old format assumed Hebrew
  return Object.keys(text).filter((lang): lang is AppLanguage => {
    const langText = text[lang];
    return langText && (langText.neutral || langText.female);
  }) as AppLanguage[];
}

export default function QuestionnaireAdminPage() {
  const [questions, setQuestions] = useState<QuestionWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [showNewQuestionForm, setShowNewQuestionForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'flow'>('list');
  const [entryPointFilter, setEntryPointFilter] = useState<'all' | 'entry-points'>('all');
  const [isSaving, setIsSaving] = useState(false);
  
  // Form states
  const [questionForm, setQuestionForm] = useState<Partial<OnboardingQuestion>>({
    title: { he: { neutral: '' } },
    description: undefined,
    layoutType: 'large-card', // Default layout
    isFirstQuestion: false,
    // type and part are set automatically to 'choice' and 'assessment'
    // order is set automatically to 0
  });

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const data = await getAllQuestionsWithAnswers('assessment');
      setQuestions(data);
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('שגיאה בטעינת השאלות');
    } finally {
      setLoading(false);
    }
  };

  // Filter questions based on entry point filter
  const filteredQuestions = entryPointFilter === 'entry-points'
    ? questions.filter(q => q.isFirstQuestion)
    : questions;

  const handleSaveQuestion = async () => {
    if (isSaving) return; // Prevent double-clicks
    
    try {
      setIsSaving(true);
      
      // Validate: title must have at least one language with neutral text
      const titleText = typeof questionForm.title === 'string' 
        ? questionForm.title 
        : questionForm.title;
      if (!titleText || (typeof titleText === 'object' && Object.keys(titleText).length === 0)) {
        alert('יש להזין כותרת לפחות בשפה אחת');
        return;
      }

      // Ensure title and description are in MultilingualText format
      const title = typeof questionForm.title === 'string'
        ? { he: { neutral: questionForm.title } }
        : questionForm.title;
      const description = questionForm.description
        ? (typeof questionForm.description === 'string'
            ? { he: { neutral: questionForm.description } }
            : questionForm.description)
        : undefined;

      // Always set defaults for type, part, and order
      // Handle progressIcon and progressIconSvg - ensure mutual exclusivity and no undefined
      const dataToSave: Partial<OnboardingQuestion> = {
        ...questionForm,
        title,
        description,
        type: 'choice' as const, // Always 'choice'
        part: 'assessment' as const, // Always 'assessment'
        order: questionForm.order ?? 0, // Default to 0 if not set
      };
      
      // Handle progressIcon and progressIconSvg - ensure mutual exclusivity and no undefined
      if (questionForm.progressIconSvg) {
        // If SVG is uploaded, use it and clear dropdown selection
        dataToSave.progressIconSvg = questionForm.progressIconSvg;
        dataToSave.progressIcon = null;
      } else if (questionForm.progressIcon) {
        // If dropdown icon selected, use it and clear SVG
        dataToSave.progressIcon = questionForm.progressIcon;
        dataToSave.progressIconSvg = null;
      } else {
        // Neither selected - set both to null (not undefined)
        dataToSave.progressIcon = null;
        dataToSave.progressIconSvg = null;
      }

      if (editingQuestion) {
        // ✅ If marking as first question, unmark others
        if (questionForm.isFirstQuestion) {
          const firstQ = await getFirstQuestion('assessment');
          if (firstQ && firstQ.id !== editingQuestion) {
            await updateQuestion(firstQ.id, { isFirstQuestion: false });
          }
        }
        await updateQuestion(editingQuestion, dataToSave);
      } else {
        // ✅ Check if marking as first question - unset others
        if (questionForm.isFirstQuestion) {
          const firstQ = await getFirstQuestion('assessment');
          if (firstQ) {
            await updateQuestion(firstQ.id, { isFirstQuestion: false });
          }
        }
        
        await createQuestion(dataToSave as Omit<OnboardingQuestion, 'id' | 'createdAt' | 'updatedAt'>);
      }
      
      // ✅ Auto-refresh (triggers sync in both List and Flow views)
      await loadQuestions();
      setEditingQuestion(null);
      setShowNewQuestionForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving question:', error);
      alert('שגיאה בשמירת השאלה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את השאלה ואת כל התשובות שלה?')) return;
    
    try {
      await deleteQuestion(questionId, true);
      await loadQuestions();
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('שגיאה במחיקת השאלה');
    }
  };

  const handleStartEdit = (question: QuestionWithAnswers) => {
    setEditingQuestion(question.id);
    // Migrate title and description to MultilingualText format if needed
    const title = typeof question.title === 'string' 
      ? { he: { neutral: question.title } }
      : question.title;
    const description = question.description
      ? (typeof question.description === 'string'
          ? { he: { neutral: question.description } }
          : question.description)
      : undefined;
    
    setQuestionForm({
      title,
      description,
      layoutType: question.layoutType || 'large-card',
      isFirstQuestion: question.isFirstQuestion,
      color: question.color,
      progressIcon: question.progressIcon,
      progressIconSvg: question.progressIconSvg,
      // type, part, and order are not shown in form but preserved when saving
      type: question.type,
      part: question.part,
      order: question.order || 0,
    });
    setExpandedQuestion(question.id);
  };

  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setShowNewQuestionForm(false);
    resetForm();
  };

  const resetForm = () => {
    setQuestionForm({
      title: { he: { neutral: '' } },
      description: undefined,
      layoutType: 'large-card',
      isFirstQuestion: false,
      // type, part, and order are set automatically on save
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
          <h1 className="text-3xl font-black text-gray-900">ניהול שאלון Onboarding</h1>
          <p className="text-gray-500 mt-2">צור וערוך שאלות ותשובות עם לוגיקת הסתעפות</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Entry Point Filter */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setEntryPointFilter('all')}
              className={`px-4 py-2 rounded-md font-bold transition-all text-sm ${
                entryPointFilter === 'all'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              כל השאלות
            </button>
            <button
              onClick={() => setEntryPointFilter('entry-points')}
              className={`px-4 py-2 rounded-md font-bold transition-all text-sm ${
                entryPointFilter === 'entry-points'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              נקודות כניסה
            </button>
          </div>
          {/* View Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List size={18} />
              רשימה
            </button>
            <button
              onClick={() => setViewMode('flow')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold transition-all ${
                viewMode === 'flow'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Workflow size={18} />
              תרשים זרימה
            </button>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowNewQuestionForm(true);
              setEditingQuestion(null);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
          >
            <Plus size={20} />
            שאלה חדשה
          </button>
        </div>
      </div>

      {/* New Question Form */}
      {showNewQuestionForm && (
        <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
          <h3 className="text-xl font-bold mb-4">שאלה חדשה</h3>
          <QuestionForm
            form={questionForm}
            onChange={setQuestionForm}
            onSave={handleSaveQuestion}
            onCancel={handleCancelEdit}
            isSaving={isSaving}
          />
        </div>
      )}

      {/* View Content */}
      {viewMode === 'list' ? (
        <div className="space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {entryPointFilter === 'entry-points' 
                ? 'אין שאלות מסומנות כנקודות כניסה. סמן שאלה כ"שאלה ראשונה" כדי לראות אותה כאן.'
                : 'אין שאלות. התחל ביצירת שאלה ראשונה.'}
            </div>
          ) : (
            filteredQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                allQuestions={questions}
                isEditing={editingQuestion === question.id}
                isExpanded={expandedQuestion === question.id}
                onToggleExpand={() => setExpandedQuestion(
                  expandedQuestion === question.id ? null : question.id
                )}
                onStartEdit={() => handleStartEdit(question)}
                onCancelEdit={handleCancelEdit}
                onSave={handleSaveQuestion}
                onDelete={handleDeleteQuestion}
                onQuestionFormChange={setQuestionForm}
                questionForm={questionForm}
                onAnswerChange={loadQuestions}
              />
            ))
          )}
        </div>
      ) : (
        <ReactFlowProvider>
          <FlowView
            questions={filteredQuestions}
            onNodeClick={(questionId) => {
              const question = questions.find(q => q.id === questionId);
              if (question) {
                handleStartEdit(question);
              }
            }}
            onCreateQuestion={(position, sourceQuestionId) => {
              resetForm();
              setShowNewQuestionForm(true);
              setEditingQuestion(null);
              // Store position for later use if needed
              if (sourceQuestionId) {
                // Pre-fill nextQuestionId in form if creating from a node
              }
            }}
            onRefresh={loadQuestions}
            onDeleteQuestion={handleDeleteQuestion}
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}

// Question Card Component
function QuestionCard({
  question,
  allQuestions,
  isEditing,
  isExpanded,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onQuestionFormChange,
  questionForm,
  onAnswerChange,
}: {
  question: QuestionWithAnswers;
  allQuestions: QuestionWithAnswers[];
  isEditing: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onQuestionFormChange: (form: Partial<OnboardingQuestion>) => void;
  questionForm: Partial<OnboardingQuestion>;
  onAnswerChange: () => void;
}) {
  const [editingAnswer, setEditingAnswer] = useState<string | null>(null);
  const [newAnswerForm, setNewAnswerForm] = useState<Partial<OnboardingAnswer>>({
    text: '',
    order: question.answers.length,
  });

  if (isEditing) {
    return (
      <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
        <QuestionForm
          form={questionForm}
          onChange={onQuestionFormChange}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {question.isFirstQuestion && (
              <span className="px-2 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded">
                שאלה ראשונה
              </span>
            )}
            <span className={`px-2 py-1 text-xs font-bold rounded ${
              question.part === 'assessment' 
                ? 'bg-purple-100 text-purple-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {question.part === 'assessment' ? 'הערכת כושר' : 'פרטים אישיים'}
            </span>
            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">
              {question.type === 'choice' ? 'בחירה' : 'קלט טקסט'}
            </span>
            {question.layoutType && (
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded">
                {question.layoutType === 'large-card' ? 'כרטיס גדול' : 'רשימה אופקית'}
              </span>
            )}
            {/* Language Indicators */}
            {(() => {
              const availableLangs = getAvailableLanguages(question.title);
              return availableLangs.length > 0 && (
                <div className="flex items-center gap-1">
                  {availableLangs.map((lang) => (
                    <span
                      key={lang}
                      className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded flex items-center gap-1"
                      title={lang === 'he' ? 'עברית' : lang === 'en' ? 'English' : 'Русский'}
                    >
                      <Globe size={10} />
                      {lang.toUpperCase()}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            {getTextValue(question.title, 'he', 'neutral') || '(ללא כותרת)'}
          </h3>
          {question.description && (
            <p className="text-gray-600 text-sm mb-3">
              {getTextValue(question.description, 'he', 'neutral')}
            </p>
          )}
          
          <div className="text-sm text-gray-500">
            {question.answers.length} תשובות
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleExpand}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
          <button
            onClick={onStartEdit}
            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={() => onDelete(question.id)}
            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Answers Section */}
      {isExpanded && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <AnswerManager
            questionId={question.id}
            answers={question.answers}
            allQuestions={allQuestions}
            onChanged={onAnswerChange}
          />
        </div>
      )}
    </div>
  );
}

// Question Form Component
function QuestionForm({
  form,
  onChange,
  onSave,
  onCancel,
  isSaving = false,
}: {
  form: Partial<OnboardingQuestion>;
  onChange: (form: Partial<OnboardingQuestion>) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}) {
  const isSavingProp = isSaving;
  const [activeLang, setActiveLang] = useState<AppLanguage>('he');
  const [showFemaleTitle, setShowFemaleTitle] = useState(false);
  const [showFemaleDescription, setShowFemaleDescription] = useState(false);
  const [customSvgPreview, setCustomSvgPreview] = useState<string | null>(null);

  // Initialize SVG preview from form
  useEffect(() => {
    if (form.progressIconSvg) {
      setCustomSvgPreview(form.progressIconSvg);
    } else {
      setCustomSvgPreview(null);
    }
  }, [form.progressIconSvg]);

  // Get current values for active language
  const titleNeutral = getTextValue(form.title, activeLang, 'neutral');
  const titleFemale = getTextValue(form.title, activeLang, 'female');
  const descriptionNeutral = getTextValue(form.description, activeLang, 'neutral');
  const descriptionFemale = getTextValue(form.description, activeLang, 'female');

  // Check if female versions exist when language changes
  useEffect(() => {
    const currentTitleFemale = getTextValue(form.title, activeLang, 'female');
    const currentDescFemale = getTextValue(form.description, activeLang, 'female');
    setShowFemaleTitle(!!currentTitleFemale);
    setShowFemaleDescription(!!currentDescFemale);
  }, [activeLang, form.title, form.description]);

  return (
    <div className="space-y-4">
      {/* Language Tabs */}
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-bold text-gray-700">כותרת השאלה *</label>
        <div className="flex gap-2 text-xs font-bold bg-gray-100 rounded-full p-1">
          {[
            { id: 'he' as AppLanguage, label: 'HE' },
            { id: 'en' as AppLanguage, label: 'EN' },
            { id: 'ru' as AppLanguage, label: 'RU' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setActiveLang(opt.id)}
              className={`px-3 py-1 rounded-full transition-all ${
                activeLang === opt.id
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title Inputs */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            כותרת (ניטרלי/גבר) *
          </label>
          <input
            type="text"
            value={titleNeutral}
            onChange={(e) => {
              const newTitle = setTextValue(form.title, activeLang, 'neutral', e.target.value);
              onChange({ ...form, title: newTitle });
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
            placeholder="לדוגמה: מה רמת הכושר הנוכחית שלך?"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={showFemaleTitle}
              onChange={(e) => {
                setShowFemaleTitle(e.target.checked);
                if (!e.target.checked) {
                  // Remove female version
                  const title = typeof form.title === 'string' 
                    ? { he: { neutral: form.title } }
                    : (form.title || {});
                  if (title[activeLang]) {
                    const { female, ...rest } = title[activeLang];
                    title[activeLang] = rest;
                  }
                  onChange({ ...form, title });
                }
              }}
              className="w-4 h-4 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
            />
            <span className="text-sm font-bold text-gray-700">הוסף גרסה נשית</span>
          </label>
          {showFemaleTitle && (
            <input
              type="text"
              value={titleFemale}
              onChange={(e) => {
                const newTitle = setTextValue(form.title, activeLang, 'female', e.target.value);
                onChange({ ...form, title: newTitle });
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
              placeholder="גרסה נשית (אופציונלי - אם ריק, ישתמש בגרסה הניטרלית)"
            />
          )}
        </div>
      </div>

      {/* Description Inputs */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">תיאור (אופציונלי)</label>
          <textarea
            value={descriptionNeutral}
            onChange={(e) => {
              const currentDesc = form.description || { he: { neutral: '' } };
              const newDescription = setTextValue(currentDesc, activeLang, 'neutral', e.target.value);
              onChange({ ...form, description: newDescription });
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
            rows={2}
            placeholder="הסבר נוסף או הנחיות..."
          />
        </div>

        <div>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={showFemaleDescription}
              onChange={(e) => {
                setShowFemaleDescription(e.target.checked);
                if (!e.target.checked && form.description) {
                  const desc = typeof form.description === 'string' 
                    ? { he: { neutral: form.description } }
                    : form.description;
                  if (desc[activeLang]) {
                    const { female, ...rest } = desc[activeLang];
                    desc[activeLang] = rest;
                  }
                  onChange({ ...form, description: desc });
                }
              }}
              className="w-4 h-4 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
            />
            <span className="text-sm font-bold text-gray-700">הוסף גרסה נשית</span>
          </label>
          {showFemaleDescription && (
            <textarea
              value={descriptionFemale}
              onChange={(e) => {
                const currentDesc = form.description || { he: { neutral: '' } };
                const newDescription = setTextValue(currentDesc, activeLang, 'female', e.target.value);
                onChange({ ...form, description: newDescription });
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
              rows={2}
              placeholder="גרסה נשית (אופציונלי - אם ריק, ישתמש בגרסה הניטרלית)"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-black mb-2 font-simpler">סגנון תצוגה (Layout)</label>
          <select
            value={form.layoutType || 'large-card'}
            onChange={(e) => onChange({ ...form, layoutType: e.target.value as 'large-card' | 'horizontal-list' })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black font-simpler"
          >
            <option value="large-card">כרטיס גדול (Large Card)</option>
            <option value="horizontal-list">רשימה אופקית (Horizontal List)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            בחר את סגנון התצוגה של השאלה והתשובות במסך ה-Onboarding
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-black mb-2 font-simpler">אייקון מתקדם (מופיע על פס ההתקדמות)</label>
          <div className="space-y-2">
            {/* Custom Icon Select with Visual Icons */}
            <div className="relative">
              <select
                value={form.progressIcon || ''}
                onChange={(e) => {
                  onChange({ ...form, progressIcon: e.target.value || undefined, progressIconSvg: e.target.value ? undefined : form.progressIconSvg });
                  setCustomSvgPreview(null);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black font-simpler appearance-none bg-white pr-10"
                disabled={!!form.progressIconSvg}
              >
                <option value="">ללא אייקון (ברירת מחדל)</option>
                <option value="running">דמות רצה (אירובי)</option>
                <option value="squat">דמות עושה סקוואט (רגליים)</option>
                <option value="pullup">דמות עושה מתח (גוף עליון)</option>
                <option value="brain">אייקון בינה מלאכותית (ניתוח)</option>
                <option value="target">אייקון מטרה (יעדים)</option>
              </select>
              {/* Icon Preview in Select */}
              {form.progressIcon && !form.progressIconSvg && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {(() => {
                    const IconMap: Record<string, React.ComponentType<any>> = {
                      'running': Footprints,
                      'squat': ArrowDownToLine,
                      'pullup': MoveUp,
                      'brain': BrainCircuit,
                      'target': Target,
                    };
                    const IconComponent = IconMap[form.progressIcon] || null;
                    return IconComponent ? (
                      <IconComponent size={18} strokeWidth={1.5} className="text-[#5BC2F2]" />
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            
            {/* Custom SVG Upload */}
            <div className="flex items-center gap-2">
              <label className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer text-black font-simpler text-sm flex items-center justify-center gap-2">
                <Upload size={16} />
                העלאת אייקון מותאם (SVG)
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const svgContent = event.target?.result as string;
                        setCustomSvgPreview(svgContent);
                        // Extract just the SVG content if it's wrapped in HTML
                        const svgMatch = svgContent.match(/<svg[^>]*>[\s\S]*<\/svg>/i);
                        const cleanedSvg = svgMatch ? svgMatch[0] : svgContent;
                        onChange({ 
                          ...form, 
                          progressIconSvg: cleanedSvg,
                          progressIcon: undefined // Clear dropdown selection when SVG is uploaded
                        });
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
              </label>
              {form.progressIconSvg && (
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...form, progressIconSvg: undefined });
                    setCustomSvgPreview(null);
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-simpler text-sm"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Preview */}
            {(form.progressIcon || form.progressIconSvg || customSvgPreview) && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 mb-2 font-simpler">תצוגה מקדימה:</p>
                <div className="flex items-center justify-center w-12 h-12 bg-white rounded-full border-2 border-[#5BC2F2]">
                  {form.progressIconSvg || customSvgPreview ? (
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: (form.progressIconSvg || customSvgPreview || '').replace(
                          /stroke-width="[^"]*"/g, 
                          'stroke-width="1.5"'
                        ).replace(
                          /stroke="[^"]*"/g, 
                          'stroke="#5BC2F2"'
                        )
                      }} 
                      className="w-6 h-6"
                      style={{ color: '#5BC2F2' }}
                    />
                  ) : form.progressIcon ? (
                    (() => {
                      const IconMap: Record<string, React.ComponentType<any>> = {
                        'running': Footprints,
                        'squat': ArrowDownToLine,
                        'pullup': MoveUp,
                        'brain': BrainCircuit,
                        'target': Target,
                      };
                      const IconComponent = IconMap[form.progressIcon] || Footprints;
                      return <IconComponent size={16} strokeWidth={1.5} className="text-[#5BC2F2]" />;
                    })()
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            אייקון שיופיע על פס ההתקדמות עבור שאלה זו
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">צבע בתרשים הזרימה</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[
            { name: 'סגול מקצועי', value: '#9333ea' },
            { name: 'כחול פעיל', value: '#3b82f6' },
            { name: 'ירוק אורח חיים', value: '#10b981' },
            { name: 'כתום אנרגטי', value: '#f97316' },
            { name: 'אדום דינמי', value: '#ef4444' },
            { name: 'צהוב חם', value: '#eab308' },
            { name: 'טורקיז רענן', value: '#14b8a6' },
            { name: 'ורוד עדין', value: '#ec4899' },
          ].map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => onChange({ ...form, color: color.value })}
              className={`px-3 py-2 rounded-lg border-2 font-bold text-xs transition-all ${
                form.color === color.value
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              style={{ backgroundColor: form.color === color.value ? color.value + '20' : undefined }}
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: color.value }}
                />
                <span>{color.name}</span>
              </div>
            </button>
          ))}
        </div>
        <input
          type="text"
          value={form.color || ''}
          onChange={(e) => onChange({ ...form, color: e.target.value || undefined })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-black placeholder-gray-400 font-simpler"
          placeholder="#9333ea (או השאר ריק לשימוש צבע ברירת מחדל)"
        />
        <p className="text-xs text-gray-500 mt-1">
          בחר צבע מותאם אישית לתיבת השאלה בתרשים הזרימה (אופציונלי)
        </p>
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isFirstQuestion || false}
            onChange={(e) => {
              // ✅ Warning if unchecking
              if (!e.target.checked && form.isFirstQuestion) {
                if (!confirm('האם אתה בטוח שברצונך לבטל את סימון "שאלה ראשונה"? המשתמש לא יוכל להתחיל את השאלון.')) {
                  return;
                }
              }
              onChange({ ...form, isFirstQuestion: e.target.checked });
            }}
            className="w-4 h-4 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
          />
          <span className="text-sm font-bold text-gray-700">
            שאלה ראשונה (Entry Point)
            {form.isFirstQuestion && (
              <span className="ml-2 text-xs text-cyan-600 font-normal">(מסומנת)</span>
            )}
          </span>
        </label>
        <p className="text-xs text-gray-500 mt-1">
          שאלות מסומנות כ"ראשונות" משמשות כנקודות כניסה שונות לשאלון (למשל: כוח, ריצה, וכו')
        </p>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onSave}
          disabled={!titleNeutral || titleNeutral.trim() === '' || isSavingProp}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-colors ${
            isSavingProp || !titleNeutral || titleNeutral.trim() === ''
              ? 'bg-cyan-400 text-white cursor-not-allowed opacity-50'
              : 'bg-cyan-500 text-white hover:bg-cyan-600'
          }`}
        >
          <Save size={18} />
          {isSavingProp ? 'שומר...' : 'שמור'}
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

// Answer Manager Component
function AnswerManager({
  questionId,
  answers,
  allQuestions,
  onChanged,
}: {
  questionId: string;
  answers: OnboardingAnswer[];
  allQuestions: QuestionWithAnswers[];
  onChanged: () => void;
}) {
  const [editingAnswer, setEditingAnswer] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [levels, setLevels] = useState<LevelDoc[]>([]);
  const [programs, setPrograms] = useState<ProgramDoc[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [answerForm, setAnswerForm] = useState<Partial<OnboardingAnswer>>({
    text: { he: { neutral: '' } },
    order: answers.length,
  });

  useEffect(() => {
    // Load levels/programs once per expanded question
    const loadMeta = async () => {
      setIsMetaLoading(true);
      try {
        const [lvls, progs] = await Promise.all([getLevels(), getPrograms()]);
        setLevels(lvls);
        setPrograms(progs);
      } catch (e) {
        console.error('Failed to load levels/programs:', e);
      } finally {
        setIsMetaLoading(false);
      }
    };
    loadMeta();
  }, []);

  // Helper to get program/level names for display
  const getProgramName = (programId: string | null | undefined): string => {
    if (!programId) return '';
    const program = programs.find(p => p.id === programId);
    return program?.name || programId;
  };

  const getLevelName = (levelId: string | null | undefined): string => {
    if (!levelId) return '';
    const level = levels.find(l => l.id === levelId);
    return level?.name || levelId;
  };

  const handleSaveAnswer = async () => {
    // ✅ Validation: Must have text in at least one language
    const textValue = typeof answerForm.text === 'string' 
      ? answerForm.text 
      : answerForm.text;
    if (!textValue || (typeof textValue === 'object' && Object.keys(textValue).length === 0)) {
      alert('יש להזין טקסט תשובה לפחות בשפה אחת');
      return;
    }

    // ✅ Determine answer type based on form state
    const hasNextQuestion = !!answerForm.nextQuestionId;
    const hasAssignedLevel = !!answerForm.assignedLevelId;
    const hasAssignedResults = !!(answerForm.assignedResults && answerForm.assignedResults.length > 0);
    
    // ✅ Validation based on type
    if (!hasNextQuestion && !hasAssignedLevel && !hasAssignedResults) {
      alert('יש לבחור: או "שאלה הבאה" או לפחות תוצאה אחת (תוכנית + רמה)');
      return;
    }

    if (hasNextQuestion && !answerForm.nextQuestionId) {
      alert('יש לבחור שאלה מהרשימה');
      return;
    }

    if (!hasNextQuestion && hasAssignedResults) {
      // Validate all results have BOTH programId and levelId
      const invalidResults = answerForm.assignedResults?.filter(r => !r.programId || !r.levelId);
      if (invalidResults && invalidResults.length > 0) {
        alert('יש למלא תוכנית ורמה עבור כל התוצאות. יש תוצאות חסרות מידע.');
        return;
      }
    }
    
    // Additional validation: ensure assignedResults entries are complete
    if (hasAssignedResults && answerForm.assignedResults) {
      const incompleteResults = answerForm.assignedResults.filter(r => !r.programId || !r.levelId);
      if (incompleteResults.length > 0) {
        alert(`יש ${incompleteResults.length} תוצאות לא שלמות. יש למלא תוכנית ורמה עבור כל התוצאות.`);
        return;
      }
    }

    try {
      // ✅ Build clean data object based on answer type
      let cleanData: Partial<Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>>;

      // Ensure text is in MultilingualText format
      const text = typeof answerForm.text === 'string' 
        ? { he: { neutral: answerForm.text.trim() } }
        : answerForm.text;

      if (hasNextQuestion) {
        // Type: Lead to Next Question
        cleanData = {
          questionId,
          text,
          imageUrl: answerForm.imageUrl || null,
          order: answerForm.order || answers.length,
          nextQuestionId: answerForm.nextQuestionId || null,
          // Keep level/program links even when leading to next question (optional links)
          assignedLevelId: answerForm.assignedLevelId || null,
          assignedProgramId: answerForm.assignedProgramId || null,
          assignedResults: undefined,
          masterProgramSubLevels: null,
          assignedLevel: null, // legacy
        };
      } else {
        // Type: Finish & Assign Result
        // Use assignedResults if available, otherwise fall back to legacy single assignment
        if (hasAssignedResults && answerForm.assignedResults) {
          cleanData = {
            questionId,
            text,
            imageUrl: answerForm.imageUrl || null,
            order: answerForm.order || answers.length,
            nextQuestionId: null,
            assignedResults: answerForm.assignedResults,
            // Clear legacy fields when using multiple results
            assignedLevelId: null,
            assignedProgramId: null,
            masterProgramSubLevels: null,
            assignedLevel: null,
          };
        } else {
          // Legacy: single assignment
          const selectedProgram = programs.find(p => p.id === answerForm.assignedProgramId);
          cleanData = {
            questionId,
            text,
            imageUrl: answerForm.imageUrl || null,
            order: answerForm.order || answers.length,
            nextQuestionId: null,
            assignedLevelId: answerForm.assignedLevelId || null,
            assignedProgramId: answerForm.assignedProgramId || null,
            // ✅ Save sub-levels only if Master Program
            masterProgramSubLevels: selectedProgram?.isMaster && answerForm.masterProgramSubLevels
              ? answerForm.masterProgramSubLevels
              : null,
            assignedLevel: null, // legacy
            assignedResults: undefined,
          };
        }
      }

      if (editingAnswer) {
        // ✅ For update, pass clean data (service will handle nulls correctly)
        await updateAnswer(editingAnswer, cleanData);
      } else {
        // ✅ For create, pass complete object with all fields (nulls are fine)
        await createAnswer(cleanData as Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>);
      }
      
      // ✅ Auto-refresh
      setEditingAnswer(null);
      setShowNewForm(false);
      setAnswerForm({ text: { he: { neutral: '' } }, order: answers.length });
      onChanged();
    } catch (error) {
      console.error('Error saving answer:', error);
      alert('שגיאה בשמירת התשובה');
    }
  };

  const handleDeleteAnswer = async (answerId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התשובה?')) return;
    try {
      await deleteAnswer(answerId);
      onChanged();
    } catch (error) {
      console.error('Error deleting answer:', error);
      alert('שגיאה במחיקת התשובה');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-gray-900">תשובות</h4>
        <button
          onClick={() => {
            setShowNewForm(true);
            setEditingAnswer(null);
            setAnswerForm({ text: { he: { neutral: '' } }, order: answers.length });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors text-sm"
        >
          <Plus size={16} />
          תשובה חדשה
        </button>
      </div>

      {/* New/Edit Answer Form */}
      {(showNewForm || editingAnswer) && (
        <div className="bg-gray-50 rounded-lg p-4 border-2 border-green-300">
          <AnswerForm
            form={answerForm}
            allQuestions={allQuestions}
            currentQuestionId={questionId}
            levels={levels}
            programs={programs}
            isMetaLoading={isMetaLoading}
            onChange={setAnswerForm}
            onSave={handleSaveAnswer}
            onCancel={() => {
              setShowNewForm(false);
              setEditingAnswer(null);
              setAnswerForm({ text: { he: { neutral: '' } }, order: answers.length });
            }}
          />
        </div>
      )}

      {/* Answers List */}
      <div className="space-y-2">
        {answers.map((answer, index) => (
          <div
            key={answer.id}
            className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-gray-500">#{index + 1}</span>
                <span className="text-sm font-bold text-gray-900">
                  {getTextValue(answer.text, 'he', 'neutral') || '(ללא טקסט)'}
                </span>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {answer.nextQuestionId ? (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    → שאלה הבאה: {(() => {
                      const nextQ = allQuestions.find(q => q.id === answer.nextQuestionId);
                      return nextQ ? getTextValue(nextQ.title, 'he', 'neutral') : answer.nextQuestionId;
                    })()}
                  </span>
                ) : (
                  <>
                    {/* Show assignedResults if available */}
                    {answer.assignedResults && answer.assignedResults.length > 0 ? (
                      answer.assignedResults.map((result, idx) => {
                        const programName = getProgramName(result.programId);
                        const levelName = getLevelName(result.levelId);
                        return (
                          <span key={idx} className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            {programName || 'ללא תוכנית'} | רמה: {levelName || 'ללא רמה'}
                          </span>
                        );
                      })
                    ) : (
                      // Legacy: show single assignment
                      <>
                        {answer.assignedLevel && (
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            רמה: {answer.assignedLevel}
                          </span>
                        )}
                        {answer.assignedProgramId && (
                          <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">
                            תוכנית: {getProgramName(answer.assignedProgramId)}
                          </span>
                        )}
                        {!answer.assignedLevel && !answer.assignedProgramId && !answer.assignedResults && (
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                            סיום זרימה
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Language Indicators for Answer */}
                {(() => {
                  const availableLangs = getAvailableLanguages(answer.text);
                  return availableLangs.length > 0 && (
                    <div className="flex items-center gap-1">
                      {availableLangs.map((lang) => (
                        <span
                          key={lang}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded flex items-center gap-1"
                          title={lang === 'he' ? 'עברית' : lang === 'en' ? 'English' : 'Русский'}
                        >
                          <Globe size={10} />
                          {lang.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingAnswer(answer.id);
                  setShowNewForm(false);
                  // ✅ Initialize form with correct state based on answer type
                  // Migrate text to MultilingualText format if needed
                  const text = typeof answer.text === 'string' 
                    ? { he: { neutral: answer.text } }
                    : answer.text;
                  setAnswerForm({
                    text,
                    imageUrl: answer.imageUrl,
                    nextQuestionId: answer.nextQuestionId || undefined,
                    assignedLevelId: answer.assignedLevelId || null,
                    assignedProgramId: answer.assignedProgramId || null,
                    assignedResults: answer.assignedResults || undefined,
                    masterProgramSubLevels: answer.masterProgramSubLevels || undefined,
                    assignedLevel: answer.assignedLevel ?? null, // legacy
                    order: answer.order,
                  });
                }}
                className="p-1.5 hover:bg-blue-50 text-blue-600 rounded transition-colors"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleDeleteAnswer(answer.id)}
                className="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        
        {answers.length === 0 && (
          <div className="text-center py-4 text-gray-500 text-sm">
            אין תשובות. הוסף תשובה ראשונה.
          </div>
        )}
      </div>
    </div>
  );
}

// Multiple Results Manager Component
function MultipleResultsManager({
  form,
  levels,
  programs,
  isMetaLoading,
  onChange,
}: {
  form: Partial<OnboardingAnswer>;
  levels: LevelDoc[];
  programs: ProgramDoc[];
  isMetaLoading: boolean;
  onChange: (form: Partial<OnboardingAnswer>) => void;
}) {
  // Initialize assignedResults from legacy fields or existing assignedResults
  const currentResults: AnswerResult[] = form.assignedResults || 
    (form.assignedLevelId && form.assignedProgramId 
      ? [{ programId: form.assignedProgramId, levelId: form.assignedLevelId, masterProgramSubLevels: form.masterProgramSubLevels }]
      : []);

  // Helper: Get levels for a specific program (filter by maxLevels if exists)
  const getLevelsForProgram = (programId: string | null | undefined): LevelDoc[] => {
    if (!programId) return levels;
    const program = programs.find(p => p.id === programId);
    if (!program) return levels;
    
    // If program has maxLevels, filter levels by order <= maxLevels
    if (program.maxLevels) {
      return levels.filter(lvl => (lvl.order || 0) <= program.maxLevels!);
    }
    return levels;
  };

  // Helper: Get program/level names for display
  const getProgramName = (programId: string | null | undefined): string => {
    if (!programId) return '';
    const program = programs.find(p => p.id === programId);
    return program?.name || programId;
  };

  const getLevelName = (levelId: string | null | undefined): string => {
    if (!levelId) return '';
    const level = levels.find(l => l.id === levelId);
    return level?.name || levelId;
  };

  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

  const addResult = () => {
    const newResult: AnswerResult = {
      programId: programs[0]?.id || '',
      levelId: levels[0]?.id || '',
    };
    const newIndex = currentResults.length;
    onChange({
      ...form,
      assignedResults: [...currentResults, newResult],
      // Clear legacy fields when using multiple results
      assignedLevelId: null,
      assignedProgramId: null,
      masterProgramSubLevels: undefined,
    });
    // Show success feedback
    setJustAddedIndex(newIndex);
    setTimeout(() => setJustAddedIndex(null), 2000);
  };

  const updateResult = (index: number, updates: Partial<AnswerResult>) => {
    const updated = [...currentResults];
    updated[index] = { ...updated[index], ...updates };
    // If program changed, reset levelId to first available level for that program
    if (updates.programId && updates.programId !== currentResults[index]?.programId) {
      const programLevels = getLevelsForProgram(updates.programId);
      updated[index].levelId = programLevels[0]?.id || '';
    }
    onChange({
      ...form,
      assignedResults: updated,
      // Clear legacy fields
      assignedLevelId: null,
      assignedProgramId: null,
      masterProgramSubLevels: undefined,
    });
  };

  const removeResult = (index: number) => {
    const updated = currentResults.filter((_, i) => i !== index);
    onChange({
      ...form,
      assignedResults: updated.length > 0 ? updated : undefined,
    });
  };

  return (
    <div className="space-y-3 relative z-10">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-bold text-gray-700">תוצאות שהוקצו *</label>
        <button
          type="button"
          onClick={addResult}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg font-bold hover:bg-purple-600 transition-colors text-xs"
        >
          <Plus size={14} />
          הוסף תוצאה
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        ניתן להקצות מספר תוכניות ורמות לתשובה אחת (למשל: Upper Body רמה 5 + Running רמה 1)
      </p>

      {/* Visual Confirmation: Show assigned programs and levels */}
      {currentResults.length > 0 && (
        <div className="mb-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">✓</span>
            <p className="text-sm font-bold text-green-800">הקצאות נוכחיות:</p>
          </div>
          <div className="space-y-2">
            {currentResults.map((result, idx) => {
              const programName = getProgramName(result.programId);
              const levelName = getLevelName(result.levelId);
              const isComplete = !!(programName && levelName);
              const isJustAdded = justAddedIndex === idx;
              return (
                <div 
                  key={idx} 
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    isJustAdded
                      ? 'bg-green-200 border-2 border-green-500 shadow-md animate-pulse'
                      : isComplete 
                        ? 'bg-green-100 border border-green-300' 
                        : 'bg-yellow-100 border border-yellow-300'
                  }`}
                >
                  <span className={`font-bold ${isComplete || isJustAdded ? 'text-green-700' : 'text-yellow-700'}`}>
                    {isJustAdded ? '✓ הוסף!' : isComplete ? '✓' : '⚠️'}
                  </span>
                  <span className={`text-sm font-bold ${isComplete || isJustAdded ? 'text-green-800' : 'text-yellow-800'}`}>
                    {isComplete 
                      ? `${programName} - ${levelName}`
                      : `תוצאה #${idx + 1} - חסר מידע (${!programName ? 'תוכנית' : ''}${!programName && !levelName ? ' + ' : ''}${!levelName ? 'רמה' : ''})`
                    }
                  </span>
                </div>
              );
            })}
          </div>
          {currentResults.every(r => r.programId && r.levelId) && (
            <p className="text-xs text-green-700 mt-2 font-semibold">
              ✓ כל התוצאות מוכנות לשמירה
            </p>
          )}
        </div>
      )}

      {currentResults.length === 0 ? (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-sm text-gray-500 mb-2">אין תוצאות שהוקצו</p>
          <button
            type="button"
            onClick={addResult}
            className="text-sm text-purple-600 font-bold hover:text-purple-700"
          >
            הוסף תוצאה ראשונה
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {currentResults.map((result, index) => {
            const selectedProgram = programs.find(p => p.id === result.programId);
            return (
              <div key={index} className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-purple-700">תוצאה #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeResult(index)}
                    className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">תוכנית *</label>
                    <select
                      value={result.programId || ''}
                      onChange={(e) => {
                        const programId = e.target.value;
                        const program = programs.find(p => p.id === programId);
                        updateResult(index, {
                          programId,
                          masterProgramSubLevels: program?.isMaster ? {
                            upper_body_level: 1,
                            lower_body_level: 1,
                            core_level: 1,
                          } : undefined,
                        });
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      <option value="">{isMetaLoading ? 'טוען...' : 'בחר תוכנית...'}</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.isMaster ? '(Master)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">רמה *</label>
                    <select
                      value={result.levelId || ''}
                      onChange={(e) => updateResult(index, { levelId: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      disabled={!result.programId}
                    >
                      <option value="">{isMetaLoading ? 'טוען...' : result.programId ? 'בחר רמה...' : 'בחר תוכנית קודם'}</option>
                      {getLevelsForProgram(result.programId).map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.name} (רמה {lvl.order || 0})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Master Program Sub-Levels */}
                {selectedProgram?.isMaster && (
                  <div className="mt-3 pt-3 border-t border-purple-200">
                    <p className="text-xs font-bold text-purple-700 mb-2">⚙️ Master Program: רמות תת-תחומים</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Upper Body</label>
                        <input
                          type="number"
                          min="1"
                          max="22"
                          value={result.masterProgramSubLevels?.upper_body_level || 1}
                          onChange={(e) => updateResult(index, {
                            masterProgramSubLevels: {
                              ...result.masterProgramSubLevels,
                              upper_body_level: parseInt(e.target.value) || 1,
                            },
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-black font-simpler"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Lower Body</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={result.masterProgramSubLevels?.lower_body_level || 1}
                          onChange={(e) => updateResult(index, {
                            masterProgramSubLevels: {
                              ...result.masterProgramSubLevels,
                              lower_body_level: parseInt(e.target.value) || 1,
                            },
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-black font-simpler"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Core</label>
                        <input
                          type="number"
                          min="1"
                          max="15"
                          value={result.masterProgramSubLevels?.core_level || 1}
                          onChange={(e) => updateResult(index, {
                            masterProgramSubLevels: {
                              ...result.masterProgramSubLevels,
                              core_level: parseInt(e.target.value) || 1,
                            },
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-black font-simpler"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Answer Form Component
function AnswerForm({
  form,
  allQuestions,
  currentQuestionId,
  levels,
  programs,
  isMetaLoading,
  onChange,
  onSave,
  onCancel,
}: {
  form: Partial<OnboardingAnswer>;
  allQuestions: QuestionWithAnswers[];
  currentQuestionId: string;
  levels: LevelDoc[];
  programs: ProgramDoc[];
  isMetaLoading: boolean;
  onChange: (form: Partial<OnboardingAnswer>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Filter out current question from next question options
  const availableQuestions = allQuestions.filter(q => q.id !== currentQuestionId);
  
  // ✅ Toggle state: "lead_to_next" or "finish_and_assign"
  // Determine type based on current form state - prioritize explicit toggle state
  const hasNextQuestion = !!form.nextQuestionId;
  const hasAssignedLevel = !!form.assignedLevelId;
  const hasAssignedResults = !!(form.assignedResults && form.assignedResults.length > 0);
  
  // Determine answer type: if nextQuestionId exists, it's lead_to_next; otherwise check for finish assignments
  const answerType: 'lead_to_next' | 'finish_and_assign' = hasNextQuestion 
    ? 'lead_to_next' 
    : (hasAssignedLevel || hasAssignedResults) 
      ? 'finish_and_assign' 
      : 'lead_to_next'; // Default to lead_to_next for new answers
  
  const [activeLang, setActiveLang] = useState<AppLanguage>('he');
  const [showFemaleText, setShowFemaleText] = useState(false);

  // Get current values for active language
  const textNeutral = getTextValue(form.text, activeLang, 'neutral');
  const textFemale = getTextValue(form.text, activeLang, 'female');

  // Check if female version exists when language changes
  useEffect(() => {
    const currentTextFemale = getTextValue(form.text, activeLang, 'female');
    setShowFemaleText(!!currentTextFemale);
  }, [activeLang, form.text]);

  // ✅ Validation: Must have text in at least one language AND either nextQuestionId OR assignedResults
  const hasValidText = textNeutral && textNeutral.trim() !== '';
  
  // For finish_and_assign: require at least one complete assignedResult (both programId and levelId)
  const hasValidAssignedResults = hasAssignedResults && form.assignedResults?.every(
    result => result.programId && result.levelId
  ) || false;
  
  // Validation logic based on answer type
  // For finish_and_assign: nextQuestionId requirement is DISABLED
  const isValid = hasValidText && (
    answerType === 'lead_to_next' 
      ? !!form.nextQuestionId  // For lead_to_next: must have nextQuestionId
      : hasValidAssignedResults || (form.assignedLevelId && form.assignedProgramId)  // For finish_and_assign: must have valid assignedResults or legacy fields (NO nextQuestionId required)
  );

  const handleTypeChange = (type: 'lead_to_next' | 'finish_and_assign') => {
    if (type === 'lead_to_next') {
      // Switching to "Lead to Next Question"
      // Keep assignedLevelId and assignedProgramId as optional links
      onChange({ 
        ...form, 
        nextQuestionId: availableQuestions.length > 0 ? (form.nextQuestionId || availableQuestions[0].id) : undefined,
        // Clear finish-specific fields but keep level/program links
        assignedResults: undefined,
        assignedLevel: null,
      });
    } else {
      // Switching to "Finish & Assign Result"
      // Initialize with empty assignedResults if no legacy fields exist
      const hasLegacy = form.assignedLevelId || form.assignedProgramId;
      onChange({ 
        ...form, 
        // Clear next question
        nextQuestionId: undefined,
        // Initialize assignedResults if not already set and no legacy fields
        assignedResults: form.assignedResults || (hasLegacy ? undefined : []),
        assignedLevel: null,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Language Tabs */}
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-bold text-gray-700">טקסט התשובה *</label>
        <div className="flex gap-2 text-xs font-bold bg-gray-100 rounded-full p-1">
          {[
            { id: 'he' as AppLanguage, label: 'HE' },
            { id: 'en' as AppLanguage, label: 'EN' },
            { id: 'ru' as AppLanguage, label: 'RU' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setActiveLang(opt.id)}
              className={`px-3 py-1 rounded-full transition-all ${
                activeLang === opt.id
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text Inputs */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            טקסט (ניטרלי/גבר) *
          </label>
          <input
            type="text"
            value={textNeutral}
            onChange={(e) => {
              const newText = setTextValue(form.text, activeLang, 'neutral', e.target.value);
              onChange({ ...form, text: newText });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-black placeholder-gray-400 font-simpler"
            placeholder="לדוגמה: מתחיל (רמה 1)"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={showFemaleText}
              onChange={(e) => {
                setShowFemaleText(e.target.checked);
                if (!e.target.checked) {
                  // Remove female version
                  const text = typeof form.text === 'string' 
                    ? { he: { neutral: form.text } }
                    : (form.text || {});
                  if (text[activeLang]) {
                    const { female, ...rest } = text[activeLang];
                    text[activeLang] = rest;
                  }
                  onChange({ ...form, text });
                }
              }}
              className="w-4 h-4 text-green-500 border-gray-300 rounded focus:ring-green-500"
            />
            <span className="text-sm font-bold text-gray-700">הוסף גרסה נשית</span>
          </label>
          {showFemaleText && (
            <input
              type="text"
              value={textFemale}
              onChange={(e) => {
                const newText = setTextValue(form.text, activeLang, 'female', e.target.value);
                onChange({ ...form, text: newText });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-black placeholder-gray-400 font-simpler"
              placeholder="גרסה נשית (אופציונלי - אם ריק, ישתמש בגרסה הניטרלית)"
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">קישור תמונה (אופציונלי)</label>
        <input
          type="url"
          value={form.imageUrl || ''}
          onChange={(e) => onChange({ ...form, imageUrl: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm text-black placeholder-gray-400 font-simpler"
          placeholder="https://example.com/image.jpg"
        />
        <p className="text-xs text-gray-500 mt-1">
          קישור לתמונה שתוצג בכרטיס התשובה (מומלץ: 400x300px לפחות)
        </p>
      </div>

      {/* Link to Level and Program (always available, optional) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2 font-simpler">קישור לרמה (אופציונלי)</label>
          <select
            value={form.assignedLevelId || ''}
            onChange={(e) => onChange({ 
              ...form, 
              assignedLevelId: e.target.value || null 
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-black font-simpler"
            disabled={isMetaLoading}
          >
            <option value="">בחר רמה...</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name || `רמה ${level.order || level.id}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2 font-simpler">קישור לתוכנית (אופציונלי)</label>
          <select
            value={form.assignedProgramId || ''}
            onChange={(e) => onChange({ 
              ...form, 
              assignedProgramId: e.target.value || null 
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-black font-simpler"
            disabled={isMetaLoading}
          >
            <option value="">בחר תוכנית...</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name || program.id}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Widget Trigger - NEW FIELD */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <label className="block text-sm font-bold text-blue-900 mb-1">
          ⚡ השפעה על הדאשבורד (Widget Trigger)
        </label>
        <select
          value={form.widgetTrigger || 'DEFAULT'}
          onChange={(e) =>
            onChange({
              ...form,
              widgetTrigger: e.target.value as any,
            })
          }
          className="w-full p-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
        >
          <option value="DEFAULT">ברירת מחדל (Health/Steps)</option>
          <option value="PERFORMANCE">מצב כוח (Split/Strength)</option>
          <option value="RUNNING">מצב ריצה (KM/Cardio)</option>
        </select>
        <p className="text-xs text-blue-600 mt-1">
          בחירה כאן תשנה את הווידג'טים שמוצגים למשתמש בדף הבית.
        </p>
      </div>
      {isMetaLoading && (
        <p className="text-xs text-gray-500 mt-1">טוען רמות ותוכניות...</p>
      )}

      {/* ✅ Toggle: Lead to Next Question OR Finish & Assign */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">סוג תוצאה *</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('lead_to_next')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 font-bold transition-all text-sm ${
              answerType === 'lead_to_next'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
            }`}
          >
            → מוביל לשאלה הבאה
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('finish_and_assign')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 font-bold transition-all text-sm ${
              answerType === 'finish_and_assign'
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300'
            }`}
          >
            ✓ סיום והקצאת רמה
          </button>
        </div>
      </div>

      {/* Conditional Fields based on toggle */}
      {answerType === 'lead_to_next' && (
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">שאלה הבאה *</label>
          <select
            value={form.nextQuestionId || ''}
            onChange={(e) => onChange({ 
              ...form, 
              nextQuestionId: e.target.value || undefined,
              // Clear finish-specific fields but keep level/program links
              assignedResults: undefined,
              assignedLevel: null,
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            <option value="">בחר שאלה...</option>
            {availableQuestions.map((q) => (
              <option key={q.id} value={q.id}>
                {getTextValue(q.title, 'he', 'neutral') || q.id}
              </option>
            ))}
          </select>
          {availableQuestions.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">אין שאלות זמינות. צור שאלה אחרת קודם.</p>
          )}
        </div>
      )}
      
      {answerType === 'finish_and_assign' && (
        <div className="relative z-10">
          <MultipleResultsManager
            form={form}
            levels={levels}
            programs={programs}
            isMetaLoading={isMetaLoading}
            onChange={onChange}
          />
        </div>
      )}

      {/* ✅ Validation Error Message - Only show for lead_to_next type */}
      {!isValid && textNeutral && answerType === 'lead_to_next' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-bold text-red-700">
            ⚠️ יש לבחור שאלה מהרשימה "שאלה הבאה"
          </p>
        </div>
      )}
      
      {/* ✅ Validation Error Message - Only show for finish_and_assign type */}
      {!isValid && textNeutral && answerType === 'finish_and_assign' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-bold text-red-700">
            ⚠️ יש להקצות לפחות תוצאה אחת (תוכנית + רמה) עבור "סיום והקצאת רמה"
          </p>
        </div>
      )}
      
      {answerType === 'lead_to_next' && availableQuestions.length === 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs font-bold text-yellow-700">
            ℹ️ אין שאלות זמינות. צור שאלה אחרת קודם כדי להשתמש בתכונה זו.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={
            !hasValidText || (
              answerType === 'lead_to_next' 
                ? !form.nextQuestionId
                : !(form.assignedResults && form.assignedResults.length > 0) && !(form.assignedLevelId && form.assignedProgramId)
            )
          }
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <Save size={16} />
          שמור
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors text-sm"
        >
          <X size={16} />
          ביטול
        </button>
      </div>
    </div>
  );
}

// Flow View Component
function FlowView({
  questions,
  onNodeClick,
  onCreateQuestion,
  onRefresh,
  onDeleteQuestion,
}: {
  questions: QuestionWithAnswers[];
  onNodeClick: (questionId: string) => void;
  onCreateQuestion: (position: { x: number; y: number }, sourceQuestionId?: string) => void;
  onRefresh: () => Promise<void>;
  onDeleteQuestion: (questionId: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [draggedTemplate, setDraggedTemplate] = useState(false);
  const [answerSelectionModal, setAnswerSelectionModal] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [answerEditModal, setAnswerEditModal] = useState<{ answerId: string; questionId: string } | null>(null);
  const [answerAddModal, setAnswerAddModal] = useState<string | null>(null); // questionId
  const [questionEditModal, setQuestionEditModal] = useState<string | null>(null); // questionId for edit modal
  const [programs, setPrograms] = useState<ProgramDoc[]>([]);
  const [levels, setLevels] = useState<LevelDoc[]>([]);
  const { screenToFlowPosition } = useReactFlow();

  // Load programs and levels for flowchart display
  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [progs, lvls] = await Promise.all([getPrograms(), getLevels()]);
        setPrograms(progs);
        setLevels(lvls);
      } catch (e) {
        console.error('Failed to load programs/levels for flowchart:', e);
      }
    };
    loadMeta();
  }, []);

  useEffect(() => {
    if (questions.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Helper: Get all finish answers (answers with assignedResults or assignedProgramId)
    const getFinishAnswers = (question: QuestionWithAnswers) => {
      return question.answers.filter(answer => 
        (answer.assignedResults && answer.assignedResults.length > 0) || 
        answer.assignedProgramId || 
        answer.assignedLevelId
      );
    };

    // Helper: Get program/level names
    const getProgramName = (programId: string | null | undefined): string => {
      if (!programId) return '';
      const program = programs.find(p => p.id === programId);
      return program?.name || programId;
    };

    const getLevelName = (levelId: string | null | undefined): string => {
      if (!levelId) return '';
      const level = levels.find(l => l.id === levelId);
      return level?.name || levelId;
    };

    // Create nodes
    const flowNodes: Node[] = questions.map((question) => {
      const title = getTextValue(question.title, 'he', 'neutral') || question.id;
      // Use custom color if set, otherwise default based on part
      const nodeColor = question.color || (question.part === 'assessment' 
        ? '#9333ea' // Purple for assessment
        : '#3b82f6'); // Blue for personal
      
      // Check if this question has any finish answers
      const finishAnswers = getFinishAnswers(question);
      const hasFinishAnswers = finishAnswers.length > 0;
      
      // Collect program/level assignments from finish answers
      const finishAssignments: Array<{ programName: string; levelName: string }> = [];
      let hasMissingAssignments = false;
      
      finishAnswers.forEach(answer => {
        if (answer.assignedResults && answer.assignedResults.length > 0) {
          // Get program/level names from assignedResults
          answer.assignedResults.forEach(result => {
            const programName = getProgramName(result.programId);
            const levelName = getLevelName(result.levelId);
            if (programName && levelName) {
              finishAssignments.push({ programName, levelName });
            } else {
              hasMissingAssignments = true;
            }
          });
        } else if (answer.assignedProgramId && answer.assignedLevelId) {
          // Legacy: single program
          const programName = getProgramName(answer.assignedProgramId);
          const levelName = getLevelName(answer.assignedLevelId);
          if (programName && levelName) {
            finishAssignments.push({ programName, levelName });
          } else {
            hasMissingAssignments = true;
          }
        } else if (answer.assignedProgramId || answer.assignedLevelId) {
          // Has partial assignment
          hasMissingAssignments = true;
        }
      });
      
      return {
        id: question.id,
        type: 'default',
        position: { x: 0, y: 0 }, // Will be calculated by dagre
        data: {
          label: (
            <div 
              className="p-3 rounded-lg border-2 shadow-md cursor-pointer hover:shadow-lg transition-shadow relative group"
              style={{ 
                backgroundColor: nodeColor,
                borderColor: nodeColor,
                color: 'white',
                minWidth: '200px',
                maxWidth: '250px',
              }}
            >
              <div className="font-bold text-sm mb-1">{title}</div>
              <div className="text-xs opacity-80">ID: {question.id.slice(0, 8)}</div>
              {question.isFirstQuestion && (
                <div className="text-xs mt-1 bg-white/20 px-2 py-0.5 rounded inline-block">
                  שאלה ראשונה
                </div>
              )}
              {hasFinishAnswers && (
                <div className={`text-xs mt-2 px-2 py-1 rounded border border-white/30 ${
                  hasMissingAssignments ? 'bg-yellow-500/80' : 'bg-red-500/80'
                }`}>
                  <div className="font-bold mb-0.5">
                    {hasMissingAssignments ? '⚠️ חסר הקצאת תוכנית' : '✓ סיום זרימה'}
                  </div>
                  {finishAssignments.length > 0 && (
                    <div className="text-[10px] opacity-90 space-y-0.5">
                      {finishAssignments.slice(0, 2).map((assignment, idx) => (
                        <div key={idx}>
                          {assignment.programName} - {assignment.levelName}
                        </div>
                      ))}
                      {finishAssignments.length > 2 && (
                        <div>+{finishAssignments.length - 2} נוספות</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Add Question Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.closest('.react-flow__node')?.getBoundingClientRect();
                  if (rect) {
                    setContextMenu({
                      x: rect.left, // RTL: use left instead of right
                      y: rect.top,
                      nodeId: question.id,
                    });
                  }
                }}
                className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/30 rounded-full p-1"
                title="הוסף שאלה חדשה"
              >
                <Plus size={14} />
              </button>
            </div>
          ),
        },
        style: {
          width: 250,
          height: 'auto',
        },
      };
    });

    // Create edges from answers' nextQuestionId and finish nodes for assignedResults
    const flowEdges: Edge[] = [];
    const finishNodes: Node[] = [];
    let finishNodeCounter = 0;

    questions.forEach((question) => {
      question.answers.forEach((answer) => {
        if (answer.nextQuestionId) {
          const answerText = getTextValue(answer.text, 'he', 'neutral') || '→';
          flowEdges.push({
            id: `${question.id}-${answer.nextQuestionId}-${answer.id}`,
            source: question.id,
            target: answer.nextQuestionId,
            type: 'smoothstep',
            animated: true,
            style: { 
              stroke: '#6b7280', 
              strokeWidth: 2,
              cursor: 'pointer',
            },
            label: (
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-gray-200 hover:border-cyan-500 transition-colors group">
                <span className="text-xs font-bold text-gray-700">{answerText}</span>
                <Edit2 size={10} className="text-gray-400 group-hover:text-cyan-600 transition-colors" />
              </div>
            ),
            labelStyle: { fill: 'transparent', fontWeight: 600, fontSize: 12 },
            labelBgStyle: { fill: 'transparent' },
            labelBgPadding: [0, 0],
            labelBgBorderRadius: 0,
            markerEnd: {
              type: 'arrowclosed',
              color: '#6b7280',
            },
            data: { answerId: answer.id, questionId: question.id },
          });
        } else if (answer.assignedResults && answer.assignedResults.length > 0) {
          // Create finish nodes for each assigned result
          answer.assignedResults.forEach((result) => {
            const programName = getProgramName(result.programId);
            const levelName = getLevelName(result.levelId);
            if (programName && levelName) {
              const finishNodeId = `finish-${question.id}-${answer.id}-${finishNodeCounter++}`;
              finishNodes.push({
                id: finishNodeId,
                type: 'default',
                position: { x: 0, y: 0 },
                data: {
                  label: (
                    <div 
                      className="p-3 rounded-lg border-2 shadow-md bg-green-500 border-green-600 text-white"
                      style={{ minWidth: '180px', maxWidth: '200px' }}
                    >
                      <div className="font-bold text-sm mb-1">✓ סיום</div>
                      <div className="text-xs font-semibold">{programName}</div>
                      <div className="text-xs opacity-90">רמה: {levelName}</div>
                    </div>
                  ),
                },
                style: {
                  width: 200,
                  height: 'auto',
                },
              });
              flowEdges.push({
                id: `${question.id}-${finishNodeId}-${answer.id}`,
                source: question.id,
                target: finishNodeId,
                type: 'smoothstep',
                animated: true,
                style: { 
                  stroke: '#10b981', 
                  strokeWidth: 2,
                  cursor: 'pointer',
                },
                label: (
                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-green-200 hover:border-green-500 transition-colors group">
                    <span className="text-xs font-bold text-gray-700">{getTextValue(answer.text, 'he', 'neutral') || '→'}</span>
                    <Edit2 size={10} className="text-gray-400 group-hover:text-green-600 transition-colors" />
                  </div>
                ),
                labelStyle: { fill: 'transparent' },
                labelBgStyle: { fill: 'transparent' },
                labelBgPadding: [0, 0],
                labelBgBorderRadius: 0,
                markerEnd: {
                  type: 'arrowclosed',
                  color: '#10b981',
                },
                data: { answerId: answer.id, questionId: question.id },
              });
            }
          });
        } else if (answer.assignedProgramId && answer.assignedLevelId) {
          // Legacy: single assignment - create finish node
          const programName = getProgramName(answer.assignedProgramId);
          const levelName = getLevelName(answer.assignedLevelId);
          if (programName && levelName) {
            const finishNodeId = `finish-${question.id}-${answer.id}-${finishNodeCounter++}`;
            finishNodes.push({
              id: finishNodeId,
              type: 'default',
              position: { x: 0, y: 0 },
              data: {
                label: (
                  <div 
                    className="p-3 rounded-lg border-2 shadow-md bg-green-500 border-green-600 text-white"
                    style={{ minWidth: '180px', maxWidth: '200px' }}
                  >
                    <div className="font-bold text-sm mb-1">✓ סיום</div>
                    <div className="text-xs font-semibold">{programName}</div>
                    <div className="text-xs opacity-90">רמה: {levelName}</div>
                  </div>
                ),
              },
              style: {
                width: 200,
                height: 'auto',
              },
            });
            flowEdges.push({
              id: `${question.id}-${finishNodeId}-${answer.id}`,
              source: question.id,
              target: finishNodeId,
              type: 'smoothstep',
              animated: true,
              style: { 
                stroke: '#10b981', 
                strokeWidth: 2,
                cursor: 'pointer',
              },
              label: (
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-green-200 hover:border-green-500 transition-colors group">
                  <span className="text-xs font-bold text-gray-700">{getTextValue(answer.text, 'he', 'neutral') || '→'}</span>
                  <Edit2 size={10} className="text-gray-400 group-hover:text-green-600 transition-colors" />
                </div>
              ),
              labelStyle: { fill: 'transparent' },
              labelBgStyle: { fill: 'transparent' },
              labelBgPadding: [0, 0],
              labelBgBorderRadius: 0,
              markerEnd: {
                type: 'arrowclosed',
                color: '#10b981',
              },
              data: { answerId: answer.id, questionId: question.id },
            });
          }
        }
      });
    });

    // Combine question nodes and finish nodes
    const allNodes = [...flowNodes, ...finishNodes];

    // Use dagre to calculate positions
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ 
      rankdir: 'TB', // Top to bottom
      nodesep: 50,
      ranksep: 100,
      marginx: 50,
      marginy: 50,
    });

    allNodes.forEach((node) => {
      g.setNode(node.id, { width: node.style?.width || 250, height: 100 });
    });

    flowEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    // Update node positions
    const positionedNodes = allNodes.map((node) => {
      const nodeWithPosition = g.node(node.id);
      const nodeWidth = node.style?.width || 250;
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (nodeWidth / 2), // Center the node
          y: nodeWithPosition.y - 50, // Center the node (height/2)
        },
      };
    });

    setNodes(positionedNodes);
    setEdges(flowEdges);
  }, [questions, programs, levels, setNodes, setEdges]);

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border border-gray-200">
        אין שאלות. התחל ביצירת שאלה ראשונה כדי לראות את תרשים הזרימה.
      </div>
    );
  }

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Don't trigger if clicking the + button
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    onNodeClick(node.id);
  }, [onNodeClick]);

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      
      // Check if edge already exists
      const existingEdge = edges.find(
        e => e.source === params.source && e.target === params.target
      );
      
      if (existingEdge) {
        alert('קישור זה כבר קיים');
        return;
      }

      // Find source question to check if it has answers
      const sourceQuestion = questions.find(q => q.id === params.source);
      if (!sourceQuestion || sourceQuestion.answers.length === 0) {
        alert('השאלה המקורית צריכה להכיל לפחות תשובה אחת כדי ליצור קישור');
        return;
      }

      // Show answer selection modal
      setAnswerSelectionModal({
        sourceId: params.source,
        targetId: params.target,
      });
    },
    [edges, questions]
  );

  const handleAnswerSelected = useCallback(
    async (answerId: string) => {
      if (!answerSelectionModal) return;

      try {
        // Update the answer's nextQuestionId
        await updateAnswer(answerId, {
          nextQuestionId: answerSelectionModal.targetId,
        });
        
        // Refresh questions to sync
        await onRefresh();
        setAnswerSelectionModal(null);
        alert('קישור נוצר בהצלחה!');
      } catch (error) {
        console.error('Error updating answer:', error);
        alert('שגיאה ביצירת הקישור');
        setAnswerSelectionModal(null);
      }
    },
    [answerSelectionModal, onRefresh]
  );

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: '',
    });
  }, [screenToFlowPosition]);

  const handleCreateQuestionFromContext = useCallback((sourceQuestionId?: string) => {
    if (contextMenu) {
      const position = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
      onCreateQuestion(position, sourceQuestionId || contextMenu.nodeId);
      setContextMenu(null);
    }
  }, [contextMenu, onCreateQuestion, screenToFlowPosition]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setDraggedTemplate(true);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTemplate(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedTemplate) return;

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onCreateQuestion(position);
      setDraggedTemplate(false);
    },
    [draggedTemplate, onCreateQuestion, screenToFlowPosition]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm relative" style={{ height: '800px' }}>
      {/* Question Template Drag Source */}
      <Panel position="top-left" className="m-4">
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="bg-cyan-500 text-white px-4 py-2 rounded-lg cursor-move hover:bg-cyan-600 transition-colors shadow-md flex items-center gap-2 font-bold"
        >
          <Plus size={18} />
          גרור לשאלה חדשה
        </div>
      </Panel>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={(event, edge) => {
          event.stopPropagation();
          const answerId = (edge.data as any)?.answerId;
          const questionId = (edge.data as any)?.questionId;
          if (answerId && questionId) {
            setAnswerEditModal({ answerId, questionId });
          }
        }}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handleContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        connectionLineStyle={{ stroke: '#9333ea', strokeWidth: 2 }}
        connectionLineType="smoothstep"
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            const question = questions.find(q => q.id === node.id);
            if (!question) return '#6b7280';
            // Use custom color if set, otherwise default based on part
            return question.color || (question.part === 'assessment' ? '#9333ea' : '#3b82f6');
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2 min-w-[200px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleCreateQuestionFromContext(contextMenu.nodeId || undefined)}
            className="w-full text-right px-4 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-700"
          >
            <Plus size={16} />
            {contextMenu.nodeId ? 'הוסף שאלה חדשה מהשאלה הזו' : 'הוסף שאלה חדשה כאן'}
          </button>
          {contextMenu.nodeId && (
            <>
              <button
                onClick={() => {
                  setAnswerAddModal(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-right px-4 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-700"
              >
                <Plus size={16} />
                הוסף תשובה חדשה
              </button>
              <button
                onClick={() => {
                  setQuestionEditModal(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full text-right px-4 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-700"
              >
                <Edit2 size={16} />
                ערוך שאלה
              </button>
              <button
                onClick={() => {
                  if (contextMenu.nodeId) {
                    onDeleteQuestion(contextMenu.nodeId);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-right px-4 py-2 hover:bg-red-50 flex items-center gap-2 font-bold text-red-600"
              >
                <Trash2 size={16} />
                מחק שאלה
              </button>
            </>
          )}
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-right px-4 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-500"
          >
            <X size={16} />
            ביטול
          </button>
        </div>
      )}

      {/* Answer Selection Modal */}
      {answerSelectionModal && (() => {
        const sourceQuestion = questions.find(q => q.id === answerSelectionModal.sourceId);
        if (!sourceQuestion) return null;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAnswerSelectionModal(null)}>
            <div 
              className="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4">בחר תשובה לקישור</h3>
              <p className="text-gray-600 mb-4">
                איזו תשובה בשאלה "{getTextValue(sourceQuestion.title, 'he', 'neutral')}" תוביל לשאלה הבאה?
              </p>
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {sourceQuestion.answers.map((answer, idx) => (
                  <button
                    key={answer.id}
                    onClick={() => handleAnswerSelected(answer.id)}
                    className="w-full text-right px-4 py-3 bg-gray-50 hover:bg-cyan-50 border border-gray-200 hover:border-cyan-500 rounded-lg transition-colors font-bold"
                  >
                    {idx + 1}. {getTextValue(answer.text, 'he', 'neutral') || `תשובה ${answer.order || 0}`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setAnswerSelectionModal(null)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        );
      })()}

      {/* Answer Edit Modal */}
      {answerEditModal && (() => {
        const question = questions.find(q => q.id === answerEditModal.questionId);
        const answer = question?.answers.find(a => a.id === answerEditModal.answerId);
        if (!question || !answer) return null;

        return (
          <AnswerEditModal
            question={question}
            answer={answer}
            allQuestions={questions}
            onSave={async () => {
              await onRefresh();
              setAnswerEditModal(null);
            }}
            onCancel={() => setAnswerEditModal(null)}
            onDelete={async () => {
              await onRefresh();
              setAnswerEditModal(null);
            }}
          />
        );
      })()}

      {/* Answer Add Modal */}
      {answerAddModal && (() => {
        const question = questions.find(q => q.id === answerAddModal);
        if (!question) return null;

        return (
          <AnswerAddModal
            questionId={question.id}
            allQuestions={questions}
            onSave={async () => {
              await onRefresh();
              setAnswerAddModal(null);
            }}
            onCancel={() => setAnswerAddModal(null)}
          />
        );
      })()}

      {/* Question Edit Modal */}
      {questionEditModal && (() => {
        const question = questions.find(q => q.id === questionEditModal);
        if (!question) return null;

        return (
          <QuestionEditModal
            question={question}
            allQuestions={questions}
            onSave={async () => {
              await onRefresh();
              setQuestionEditModal(null);
            }}
            onCancel={() => setQuestionEditModal(null)}
          />
        );
      })()}
    </div>
  );
}

// Question Edit Modal Component (for FlowView)
function QuestionEditModal({
  question,
  allQuestions,
  onSave,
  onCancel,
}: {
  question: QuestionWithAnswers;
  allQuestions: QuestionWithAnswers[];
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [questionForm, setQuestionForm] = useState<Partial<OnboardingQuestion>>({
    title: typeof question.title === 'string' ? { he: { neutral: question.title } } : question.title,
    description: question.description
      ? (typeof question.description === 'string'
          ? { he: { neutral: question.description } }
          : question.description)
      : undefined,
    layoutType: question.layoutType || 'large-card',
    isFirstQuestion: question.isFirstQuestion,
    color: question.color,
    progressIcon: question.progressIcon,
    type: question.type,
    part: question.part,
    order: question.order || 0,
  });

  const handleSave = async () => {
    try {
      const titleText = typeof questionForm.title === 'string' 
        ? questionForm.title 
        : questionForm.title;
      if (!titleText || (typeof titleText === 'object' && Object.keys(titleText).length === 0)) {
        alert('יש להזין כותרת לפחות בשפה אחת');
        return;
      }

      const title = typeof questionForm.title === 'string'
        ? { he: { neutral: questionForm.title } }
        : questionForm.title;
      const description = questionForm.description
        ? (typeof questionForm.description === 'string'
            ? { he: { neutral: questionForm.description } }
            : questionForm.description)
        : undefined;

      const dataToSave = {
        ...questionForm,
        title,
        description,
        type: 'choice' as const,
        part: 'assessment' as const,
        order: questionForm.order ?? 0,
      };

      await updateQuestion(question.id, dataToSave);
      await onSave();
    } catch (error) {
      console.error('Error saving question:', error);
      alert('שגיאה בשמירת השאלה');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div 
        className="bg-white rounded-2xl p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">ערוך שאלה</h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <QuestionForm
          form={questionForm}
          onChange={setQuestionForm}
          onSave={handleSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

// Answer Edit Modal Component (for FlowView)
function AnswerEditModal({
  question,
  answer,
  allQuestions,
  onSave,
  onCancel,
  onDelete,
}: {
  question: QuestionWithAnswers;
  answer: OnboardingAnswer;
  allQuestions: QuestionWithAnswers[];
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const [levels, setLevels] = useState<LevelDoc[]>([]);
  const [programs, setPrograms] = useState<ProgramDoc[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [answerForm, setAnswerForm] = useState<Partial<OnboardingAnswer>>({
    text: typeof answer.text === 'string' ? { he: { neutral: answer.text } } : answer.text,
    imageUrl: answer.imageUrl,
    nextQuestionId: answer.nextQuestionId || undefined,
    assignedLevelId: answer.assignedLevelId || null,
    assignedProgramId: answer.assignedProgramId || null,
    assignedResults: answer.assignedResults || undefined,
    masterProgramSubLevels: answer.masterProgramSubLevels || undefined,
    assignedLevel: answer.assignedLevel ?? null,
    order: answer.order,
  });

  useEffect(() => {
    const loadMeta = async () => {
      setIsMetaLoading(true);
      try {
        const [lvls, progs] = await Promise.all([getLevels(), getPrograms()]);
        setLevels(lvls);
        setPrograms(progs);
      } catch (e) {
        console.error('Failed to load levels/programs:', e);
      } finally {
        setIsMetaLoading(false);
      }
    };
    loadMeta();
  }, []);

  const handleSave = async () => {
    const textValue = typeof answerForm.text === 'string' 
      ? answerForm.text 
      : answerForm.text;
    if (!textValue || (typeof textValue === 'object' && Object.keys(textValue).length === 0)) {
      alert('יש להזין טקסט תשובה לפחות בשפה אחת');
      return;
    }

    const hasNextQuestion = !!answerForm.nextQuestionId;
    const hasAssignedLevel = !!answerForm.assignedLevelId;
    const hasAssignedResults = !!(answerForm.assignedResults && answerForm.assignedResults.length > 0);
    
    if (!hasNextQuestion && !hasAssignedLevel && !hasAssignedResults) {
      alert('יש לבחור: או "שאלה הבאה" או לפחות תוצאה אחת (תוכנית + רמה)');
      return;
    }

    try {
      const text = typeof answerForm.text === 'string' 
        ? { he: { neutral: answerForm.text.trim() } }
        : answerForm.text;

      let cleanData: Partial<Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>>;

      if (hasNextQuestion) {
        cleanData = {
          questionId: question.id,
          text,
          imageUrl: answerForm.imageUrl || null,
          order: answerForm.order || answer.order,
          nextQuestionId: answerForm.nextQuestionId || null,
          // Keep level/program links even when leading to next question (optional links)
          assignedLevelId: answerForm.assignedLevelId || null,
          assignedProgramId: answerForm.assignedProgramId || null,
          assignedResults: undefined,
          masterProgramSubLevels: null,
          assignedLevel: null,
        };
      } else {
        // Use assignedResults if available, otherwise fall back to legacy
        if (hasAssignedResults && answerForm.assignedResults) {
          cleanData = {
            questionId: question.id,
            text,
            imageUrl: answerForm.imageUrl || null,
            order: answerForm.order || answer.order,
            nextQuestionId: null,
            assignedResults: answerForm.assignedResults,
            assignedLevelId: null,
            assignedProgramId: null,
            masterProgramSubLevels: null,
            assignedLevel: null,
          };
        } else {
          const selectedProgram = programs.find(p => p.id === answerForm.assignedProgramId);
          cleanData = {
            questionId: question.id,
            text,
            imageUrl: answerForm.imageUrl || null,
            order: answerForm.order || answer.order,
            nextQuestionId: null,
            assignedLevelId: answerForm.assignedLevelId || null,
            assignedProgramId: answerForm.assignedProgramId || null,
            masterProgramSubLevels: selectedProgram?.isMaster && answerForm.masterProgramSubLevels
              ? answerForm.masterProgramSubLevels
              : null,
            assignedLevel: null,
            assignedResults: undefined,
          };
        }
      }

      await updateAnswer(answer.id, cleanData);
      await onSave();
    } catch (error) {
      console.error('Error saving answer:', error);
      alert('שגיאה בשמירת התשובה');
    }
  };

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התשובה?')) return;
    try {
      await deleteAnswer(answer.id);
      await onDelete();
    } catch (error) {
      console.error('Error deleting answer:', error);
      alert('שגיאה במחיקת התשובה');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div 
        className="bg-white rounded-2xl p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">ערוך תשובה</h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <AnswerForm
          form={answerForm}
          allQuestions={allQuestions}
          currentQuestionId={question.id}
          levels={levels}
          programs={programs}
          isMetaLoading={isMetaLoading}
          onChange={setAnswerForm}
          onSave={handleSave}
          onCancel={onCancel}
        />
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-colors"
          >
            <Trash2 size={16} className="inline mr-2" />
            מחק תשובה
          </button>
        </div>
      </div>
    </div>
  );
}

// Answer Add Modal Component (for FlowView)
function AnswerAddModal({
  questionId,
  allQuestions,
  onSave,
  onCancel,
}: {
  questionId: string;
  allQuestions: QuestionWithAnswers[];
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [levels, setLevels] = useState<LevelDoc[]>([]);
  const [programs, setPrograms] = useState<ProgramDoc[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const question = allQuestions.find(q => q.id === questionId);
  const [answerForm, setAnswerForm] = useState<Partial<OnboardingAnswer>>({
    text: { he: { neutral: '' } },
    order: question?.answers.length || 0,
  });

  useEffect(() => {
    const loadMeta = async () => {
      setIsMetaLoading(true);
      try {
        const [lvls, progs] = await Promise.all([getLevels(), getPrograms()]);
        setLevels(lvls);
        setPrograms(progs);
      } catch (e) {
        console.error('Failed to load levels/programs:', e);
      } finally {
        setIsMetaLoading(false);
      }
    };
    loadMeta();
  }, []);

  const handleSave = async () => {
    const textValue = typeof answerForm.text === 'string' 
      ? answerForm.text 
      : answerForm.text;
    if (!textValue || (typeof textValue === 'object' && Object.keys(textValue).length === 0)) {
      alert('יש להזין טקסט תשובה לפחות בשפה אחת');
      return;
    }

    const hasNextQuestion = !!answerForm.nextQuestionId;
    const hasAssignedLevel = !!answerForm.assignedLevelId;
    const hasAssignedResults = !!(answerForm.assignedResults && answerForm.assignedResults.length > 0);
    
    if (!hasNextQuestion && !hasAssignedLevel && !hasAssignedResults) {
      alert('יש לבחור: או "שאלה הבאה" או לפחות תוצאה אחת (תוכנית + רמה)');
      return;
    }

    try {
      const text = typeof answerForm.text === 'string' 
        ? { he: { neutral: answerForm.text.trim() } }
        : answerForm.text;

      let cleanData: Partial<Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>>;

      if (hasNextQuestion) {
        cleanData = {
          questionId,
          text,
          imageUrl: answerForm.imageUrl || null,
          order: answerForm.order || (question?.answers.length || 0),
          nextQuestionId: answerForm.nextQuestionId || null,
          // Keep level/program links even when leading to next question (optional links)
          assignedLevelId: answerForm.assignedLevelId || null,
          assignedProgramId: answerForm.assignedProgramId || null,
          assignedResults: undefined,
          masterProgramSubLevels: null,
          assignedLevel: null,
        };
      } else {
        // Use assignedResults if available, otherwise fall back to legacy
        if (hasAssignedResults && answerForm.assignedResults) {
          cleanData = {
            questionId,
            text,
            imageUrl: answerForm.imageUrl || null,
            order: answerForm.order || (question?.answers.length || 0),
            nextQuestionId: null,
            assignedResults: answerForm.assignedResults,
            assignedLevelId: null,
            assignedProgramId: null,
            masterProgramSubLevels: null,
            assignedLevel: null,
          };
        } else {
          const selectedProgram = programs.find(p => p.id === answerForm.assignedProgramId);
          cleanData = {
            questionId,
            text,
            imageUrl: answerForm.imageUrl || null,
            order: answerForm.order || (question?.answers.length || 0),
            nextQuestionId: null,
            assignedLevelId: answerForm.assignedLevelId || null,
            assignedProgramId: answerForm.assignedProgramId || null,
            masterProgramSubLevels: selectedProgram?.isMaster && answerForm.masterProgramSubLevels
              ? answerForm.masterProgramSubLevels
              : null,
            assignedLevel: null,
            assignedResults: undefined,
          };
        }
      }

      await createAnswer(cleanData as Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>);
      await onSave();
    } catch (error) {
      console.error('Error creating answer:', error);
      alert('שגיאה ביצירת התשובה');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div 
        className="bg-white rounded-2xl p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">הוסף תשובה חדשה</h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <AnswerForm
          form={answerForm}
          allQuestions={allQuestions}
          currentQuestionId={questionId}
          levels={levels}
          programs={programs}
          isMetaLoading={isMetaLoading}
          onChange={setAnswerForm}
          onSave={handleSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
