'use client';

import { 
  ExerciseFormData, 
  MechanicalType,
  MECHANICAL_TYPE_LABELS,
} from '../../../core/exercise.types';
import { Cog } from 'lucide-react';

interface TechnicalClassificationSectionProps {
  formData: ExerciseFormData;
  setFormData: React.Dispatch<React.SetStateAction<ExerciseFormData>> | ((data: ExerciseFormData | ((prev: ExerciseFormData) => ExerciseFormData)) => void);
  noContainer?: boolean; // When wrapped by CollapsibleSection, hide internal container
}

const MECHANICAL_TYPES: MechanicalType[] = ['straight_arm', 'bent_arm', 'hybrid', 'none'];

export default function TechnicalClassificationSection({
  formData,
  setFormData,
  noContainer = false,
}: TechnicalClassificationSectionProps) {
  
  const handleMechanicalTypeChange = (type: MechanicalType) => {
    setFormData((prev: ExerciseFormData) => ({
      ...prev,
      mechanicalType: type,
    }));
  };

  const getTypeBgColor = (type: MechanicalType, isSelected: boolean) => {
    if (!isSelected) return 'bg-gray-100 hover:bg-gray-200 border-transparent';
    switch (type) {
      case 'straight_arm':
        return 'bg-amber-100 border-amber-500 text-amber-700';
      case 'bent_arm':
        return 'bg-indigo-100 border-indigo-500 text-indigo-700';
      case 'hybrid':
        return 'bg-emerald-100 border-emerald-500 text-emerald-700';
      case 'none':
        return 'bg-gray-200 border-gray-400 text-gray-600';
    }
  };

  const getTypeIcon = (type: MechanicalType) => {
    // Simple visual representations for each type
    switch (type) {
      case 'straight_arm':
        // Straight line representing extended arm
        return (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
            <circle cx="20" cy="12" r="2" fill="currentColor" />
          </svg>
        );
      case 'bent_arm':
        // Bent angle representing flexed arm
        return (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 16 L12 8 L20 16" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="8" r="2" fill="currentColor" />
          </svg>
        );
      case 'hybrid':
        // Combined symbol
        return (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="4" y1="12" x2="11" y2="12" strokeLinecap="round" />
            <path d="M11 12 L16 7 L20 12" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="12" r="2" fill="currentColor" />
          </svg>
        );
      case 'none':
        // Dash/none symbol
        return (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="6" y1="12" x2="18" y2="12" strokeLinecap="round" strokeDasharray="4 3" />
          </svg>
        );
    }
  };

  const content = (
    <>
      {!noContainer && (
        <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
            <Cog className="text-white" size={18} />
          </div>
          סיווג טכני (Technical Classification)
        </h2>
      )}

      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
            סוג מכני (Mechanical Type)
          </label>
          <p className="text-xs text-gray-500 mb-4">
            סיווג קליסטניקס: יד ישרה (SA) מול יד כפופה (BA). משמש לאיזון אימונים.
          </p>
          
          {/* Segmented Control */}
          <div className="grid grid-cols-4 gap-3">
            {MECHANICAL_TYPES.map((type) => {
              const isSelected = formData.mechanicalType === type;
              const labels = MECHANICAL_TYPE_LABELS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleMechanicalTypeChange(type)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    getTypeBgColor(type, isSelected)
                  } ${isSelected ? 'shadow-md ring-2 ring-offset-1' : ''}`}
                  style={isSelected ? { 
                    '--tw-ring-color': type === 'straight_arm' ? '#f59e0b' : 
                                       type === 'bent_arm' ? '#6366f1' : 
                                       type === 'hybrid' ? '#10b981' : '#9ca3af' 
                  } as React.CSSProperties : undefined}
                >
                  {getTypeIcon(type)}
                  <span className="text-sm font-bold">{labels.he}</span>
                  <span className="text-xs opacity-75">({labels.abbr})</span>
                </button>
              );
            })}
          </div>

          {/* Helper text based on selection */}
          {formData.mechanicalType && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                {formData.mechanicalType === 'straight_arm' && (
                  <>
                    <span className="font-bold text-amber-700">יד ישרה (Straight Arm):</span>{' '}
                    תרגילים כמו פלאנש, פרונט לבר, בק לבר, L-sit. דורשים כוח סטטי עם זרועות ישרות.
                  </>
                )}
                {formData.mechanicalType === 'bent_arm' && (
                  <>
                    <span className="font-bold text-indigo-700">יד כפופה (Bent Arm):</span>{' '}
                    תרגילים כמו מתח, מקבילים, שכיבות סמיכה. תנועה דינמית עם כיפוף מרפקים.
                  </>
                )}
                {formData.mechanicalType === 'hybrid' && (
                  <>
                    <span className="font-bold text-emerald-700">היברידי (Hybrid):</span>{' '}
                    תרגילים כמו מאסל-אפ. משלבים גם יד ישרה וגם יד כפופה באותה תנועה.
                  </>
                )}
                {formData.mechanicalType === 'none' && (
                  <>
                    <span className="font-bold text-gray-600">ללא סיווג:</span>{' '}
                    תרגילים שאינם קליסטניקס (מוביליטי, קרדיו, רגליים, וכו').
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (noContainer) {
    return content;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {content}
    </div>
  );
}
