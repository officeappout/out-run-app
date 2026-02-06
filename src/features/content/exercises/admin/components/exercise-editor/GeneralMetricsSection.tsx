'use client';

import { 
  ExerciseFormData, 
  NoiseLevel, 
  SweatLevel, 
  InjuryShieldArea,
  NOISE_LEVEL_LABELS,
  SWEAT_LEVEL_LABELS,
  INJURY_SHIELD_LABELS,
} from '../../../core/exercise.types';
import { Volume2, VolumeX, Droplets, Shield, X } from 'lucide-react';

interface GeneralMetricsSectionProps {
  formData: ExerciseFormData;
  setFormData: React.Dispatch<React.SetStateAction<ExerciseFormData>> | ((data: ExerciseFormData | ((prev: ExerciseFormData) => ExerciseFormData)) => void);
  noContainer?: boolean; // When wrapped by CollapsibleSection, hide internal container
}

const NOISE_LEVELS: NoiseLevel[] = [1, 2, 3];
const SWEAT_LEVELS: SweatLevel[] = [1, 2, 3];
const INJURY_AREAS: InjuryShieldArea[] = [
  'wrist',
  'elbow',
  'shoulder',
  'lower_back',
  'neck',
  'knees',
  'ankles',
  'hips',
];

export default function GeneralMetricsSection({
  formData,
  setFormData,
  noContainer = false,
}: GeneralMetricsSectionProps) {
  
  const handleNoiseLevelChange = (level: NoiseLevel) => {
    setFormData((prev: ExerciseFormData) => ({
      ...prev,
      noiseLevel: level,
    }));
  };

  const handleSweatLevelChange = (level: SweatLevel) => {
    setFormData((prev: ExerciseFormData) => ({
      ...prev,
      sweatLevel: level,
    }));
  };

  const toggleInjuryArea = (area: InjuryShieldArea) => {
    setFormData((prev: ExerciseFormData) => {
      const currentAreas = prev.injuryShield || [];
      const newAreas = currentAreas.includes(area)
        ? currentAreas.filter((a) => a !== area)
        : [...currentAreas, area];
      return {
        ...prev,
        injuryShield: newAreas,
      };
    });
  };

  const removeInjuryArea = (area: InjuryShieldArea) => {
    setFormData((prev: ExerciseFormData) => ({
      ...prev,
      injuryShield: (prev.injuryShield || []).filter((a) => a !== area),
    }));
  };

  const getNoiseIcon = (level: NoiseLevel) => {
    switch (level) {
      case 1:
        return <VolumeX size={18} />;
      case 2:
        return <Volume2 size={18} />;
      case 3:
        return <Volume2 size={18} className="text-orange-500" />;
    }
  };

  const getNoiseBgColor = (level: NoiseLevel, isSelected: boolean) => {
    if (!isSelected) return 'bg-gray-100 hover:bg-gray-200';
    switch (level) {
      case 1:
        return 'bg-green-100 border-green-500 text-green-700';
      case 2:
        return 'bg-yellow-100 border-yellow-500 text-yellow-700';
      case 3:
        return 'bg-orange-100 border-orange-500 text-orange-700';
    }
  };

  const getSweatBgColor = (level: SweatLevel, isSelected: boolean) => {
    if (!isSelected) return 'bg-gray-100 hover:bg-gray-200';
    switch (level) {
      case 1:
        return 'bg-blue-100 border-blue-500 text-blue-700';
      case 2:
        return 'bg-cyan-100 border-cyan-500 text-cyan-700';
      case 3:
        return 'bg-red-100 border-red-500 text-red-700';
    }
  };

  const content = (
    <>
      {!noContainer && (
        <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Shield className="text-white" size={18} />
          </div>
          מדדים כלליים (General Metrics)
        </h2>
      )}

      <div className="space-y-6">
        {/* Noise Level */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
            <Volume2 size={16} className="text-gray-500" />
            רמת רעש (Noise Level)
          </label>
          <div className="flex gap-3">
            {NOISE_LEVELS.map((level) => {
              const isSelected = formData.noiseLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleNoiseLevelChange(level)}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    getNoiseBgColor(level, isSelected)
                  } ${isSelected ? 'shadow-md' : 'border-transparent'}`}
                >
                  {getNoiseIcon(level)}
                  <span className="text-sm font-bold">{level}</span>
                  <span className="text-xs opacity-75">
                    {NOISE_LEVEL_LABELS[level].he}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            1 = שקט (מתאים לדירה), 2 = בינוני, 3 = רועש (קפיצות)
          </p>
        </div>

        {/* Sweat Level */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
            <Droplets size={16} className="text-gray-500" />
            רמת מאמץ/זיעה (Sweat Level)
          </label>
          <div className="flex gap-3">
            {SWEAT_LEVELS.map((level) => {
              const isSelected = formData.sweatLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleSweatLevelChange(level)}
                  className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    getSweatBgColor(level, isSelected)
                  } ${isSelected ? 'shadow-md' : 'border-transparent'}`}
                >
                  <Droplets size={18} className={level === 3 ? 'text-red-500' : ''} />
                  <span className="text-sm font-bold">{level}</span>
                  <span className="text-xs opacity-75">
                    {SWEAT_LEVEL_LABELS[level].he}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            1 = נמוך/ללא זיעה, 2 = בינוני, 3 = גבוה/אינטנסיבי
          </p>
        </div>

        {/* Injury Shield */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
            <Shield size={16} className="text-gray-500" />
            אזורים רגישים (Injury Shield)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            סמן את אזורי הגוף שהתרגיל עלול להעמיס עליהם. תרגילים אלה יסוננו למשתמשים עם פציעות באזורים אלו.
          </p>
          
          {/* Selected Areas as Tags */}
          {formData.injuryShield && formData.injuryShield.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {formData.injuryShield.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium"
                >
                  {INJURY_SHIELD_LABELS[area].he}
                  <button
                    type="button"
                    onClick={() => removeInjuryArea(area)}
                    className="hover:bg-red-200 rounded-full p-0.5 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* All Areas Grid */}
          <div className="grid grid-cols-4 gap-2">
            {INJURY_AREAS.map((area) => {
              const isSelected = formData.injuryShield?.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleInjuryArea(area)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-red-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {INJURY_SHIELD_LABELS[area].he}
                </button>
              );
            })}
          </div>
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
