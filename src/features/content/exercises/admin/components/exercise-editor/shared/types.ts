/**
 * Shared Types for Exercise Editor Components
 */
import { ExerciseFormData, AppLanguage } from '../../../core/exercise.types';
import { Program } from '../../../../programs/core/program.types';

export interface ExerciseEditorSectionProps {
  formData: ExerciseFormData;
  setFormData: React.Dispatch<React.SetStateAction<ExerciseFormData>>;
  activeLang: AppLanguage;
  setActiveLang: (lang: AppLanguage) => void;
  programs?: Program[];
}
