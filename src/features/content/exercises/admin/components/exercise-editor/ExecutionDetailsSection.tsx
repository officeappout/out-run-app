'use client';

import { useState } from 'react';
import { 
  ExerciseFormData, 
  AppLanguage,
} from '../../../core/exercise.types';
import { ChevronDown, ChevronUp, FileText, BookOpen } from 'lucide-react';

interface ExecutionDetailsSectionProps {
  formData: ExerciseFormData;
  setFormData: React.Dispatch<React.SetStateAction<ExerciseFormData>> | ((data: ExerciseFormData | ((prev: ExerciseFormData) => ExerciseFormData)) => void);
  activeLang: AppLanguage;
  setActiveLang: (lang: AppLanguage) => void;
}

export default function ExecutionDetailsSection({
  formData,
  setFormData,
  activeLang,
  setActiveLang,
}: ExecutionDetailsSectionProps) {
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(false);

  const hasContent = Boolean(
    formData.content?.instructions?.he || 
    formData.content?.instructions?.en || 
    formData.content?.instructions?.es ||
    formData.content?.description?.he ||
    formData.content?.description?.en ||
    formData.content?.description?.es
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
          <BookOpen className="text-white" size={18} />
        </div>
        תיאור והוראות כלליות (General Description)
      </h2>
      
      <p className="text-xs text-gray-500 mb-4">
        תיאור כללי והוראות ברמת התרגיל. הדגשים הספציפיים לכל שיטת ביצוע נמצאים בכרטיס שיטת הביצוע.
      </p>

      {/* Collapsible Instructions Section */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsInstructionsExpanded(!isInstructionsExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-gray-500" />
            <span className="text-sm font-bold text-gray-700">
              תיאור והוראות מורחבות
            </span>
            {hasContent && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                יש תוכן
              </span>
            )}
          </div>
          {isInstructionsExpanded ? (
            <ChevronUp size={20} className="text-gray-500" />
          ) : (
            <ChevronDown size={20} className="text-gray-500" />
          )}
        </button>
        
        {isInstructionsExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-200">
            {/* Language Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-700">
                שפה ({activeLang.toUpperCase()})
              </label>
              <div className="flex gap-1 text-xs font-bold bg-gray-100 rounded-full p-1">
                {[
                  { id: 'he' as AppLanguage, label: 'HE' },
                  { id: 'en' as AppLanguage, label: 'EN' },
                  { id: 'es' as AppLanguage, label: 'ES' },
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

            {/* Short Description */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                תיאור קצר (Short Description)
              </label>
              <textarea
                value={formData.content?.description?.[activeLang] || ''}
                onChange={(e) =>
                  setFormData((prev: ExerciseFormData) => ({
                    ...prev,
                    content: {
                      ...prev.content,
                      description: {
                        he: prev.content?.description?.he || '',
                        en: prev.content?.description?.en || '',
                        es: prev.content?.description?.es,
                        [activeLang]: e.target.value,
                      },
                    },
                  }))
                }
                rows={2}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none text-sm"
                placeholder={
                  activeLang === 'he'
                    ? 'תיאור קצר של התרגיל...'
                    : activeLang === 'en'
                    ? 'Short description of the exercise...'
                    : 'Descripción corta del ejercicio...'
                }
              />
            </div>
            
            {/* Detailed Instructions */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                הוראות מפורטות (Detailed Instructions)
              </label>
              <textarea
                value={formData.content?.instructions?.[activeLang] || ''}
                onChange={(e) =>
                  setFormData((prev: ExerciseFormData) => ({
                    ...prev,
                    content: {
                      ...prev.content,
                      instructions: {
                        he: prev.content?.instructions?.he || '',
                        en: prev.content?.instructions?.en || '',
                        es: prev.content?.instructions?.es,
                        [activeLang]: e.target.value,
                      },
                    },
                  }))
                }
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-y text-sm"
                placeholder={
                  activeLang === 'he'
                    ? 'הוראות מפורטות לביצוע התרגיל...\n\nדוגמה:\n1. עמדו ברוחב כתפיים\n2. שמרו על גב ישר\n3. רדו עד 90 מעלות...'
                    : activeLang === 'en'
                    ? 'Detailed instructions for exercise execution...\n\nExample:\n1. Stand shoulder-width apart\n2. Keep back straight\n3. Lower until 90 degrees...'
                    : 'Instrucciones detalladas para la ejecución del ejercicio...'
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
