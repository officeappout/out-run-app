'use client';

/**
 * VideoUploadSection — global Exercise-level video slots (Phase 5 + 5.5 i18n).
 *
 * Per-language design (Option B unified document):
 *   previewVideo  → { he: ExternalVideo | undefined, en: ExternalVideo | undefined }
 *   fullTutorial  → { he: ExternalVideo | undefined, en: ExternalVideo | undefined }
 *
 * The preview loop is typically identical for all languages (silent body-weight
 * footage) so HE and EN may share the same Bunny ID — but separate slots are
 * provided for cases where re-encoded/captioned previews are needed.
 *
 * The full tutorial ALWAYS differs per language (Hebrew original audio vs
 * English AI voiceover), hence the separate EN upload slot.
 */

import BunnyVideoUploader from './BunnyVideoUploader';
import type {
  ExerciseFormData,
  ExternalVideo,
  ExerciseLang,
} from '../../../core/exercise.types';
import { getLocalizedText } from '../../../core/exercise.types';

interface VideoUploadSectionProps {
  formData: ExerciseFormData;
  setFormData: (
    next: ExerciseFormData | ((prev: ExerciseFormData) => ExerciseFormData),
  ) => void;
  noContainer?: boolean;
}

const LANGS: { id: ExerciseLang; label: string; flag: string }[] = [
  { id: 'he', label: 'עברית', flag: '🇮🇱' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
];

export default function VideoUploadSection({
  formData,
  setFormData,
  noContainer,
}: VideoUploadSectionProps) {
  const exerciseName = getLocalizedText(formData.name) || 'exercise';

  const updateVideoSlot = (
    field: 'previewVideo' | 'fullTutorial',
    lang: ExerciseLang,
    next: ExternalVideo | undefined,
  ) => {
    setFormData((prev) => {
      const prevMedia = prev.media ?? {};
      const prevField = (prevMedia[field] ?? {}) as Partial<Record<ExerciseLang, ExternalVideo>>;
      const nextField: Partial<Record<ExerciseLang, ExternalVideo>> = { ...prevField };
      if (next) {
        nextField[lang] = next;
      } else {
        delete nextField[lang];
      }

      // Update supportedLangs based on which lang now has a fullTutorial
      let supportedLangs = [...(prev.supportedLangs ?? [])];
      if (field === 'fullTutorial') {
        const tutorialMap = field === 'fullTutorial' ? nextField : (prevMedia.fullTutorial ?? {}) as Partial<Record<ExerciseLang, ExternalVideo>>;
        supportedLangs = (Object.keys(tutorialMap) as ExerciseLang[]).filter(
          (l) => !!tutorialMap[l],
        );
      }

      return {
        ...prev,
        supportedLangs,
        media: { ...prevMedia, [field]: Object.keys(nextField).length > 0 ? nextField : undefined },
      };
    });
  };

  const getSlotValue = (
    field: 'previewVideo' | 'fullTutorial',
    lang: ExerciseLang,
  ): ExternalVideo | undefined => {
    const map = formData.media?.[field] as Partial<Record<ExerciseLang, ExternalVideo>> | undefined;
    return map?.[lang];
  };

  const body = (
    <div className="space-y-5">
      {/* Preview Video — per language */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-gray-700">Preview Video (לולאה קצרה)</span>
          <span className="text-[10px] text-gray-400">5-15 שניות, ללא קול</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {LANGS.map(({ id, label, flag }) => (
            <BunnyVideoUploader
              key={id}
              label={`${flag} ${label}`}
              helperText={id === 'he' ? 'גרסת הבסיס' : 'גרסת האנגלית (אופציונלי)'}
              value={getSlotValue('previewVideo', id)}
              onChange={(next) => updateVideoSlot('previewVideo', id, next)}
              uploadTitle={`${exerciseName} — preview — ${id}`}
            />
          ))}
        </div>
      </div>

      {/* Full Tutorial — per language */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-gray-700">Full Tutorial (מדריך מלא)</span>
          <span className="text-[10px] text-gray-400">כל שפה = סרטון שונה (שמע שונה)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {LANGS.map(({ id, label, flag }) => (
            <BunnyVideoUploader
              key={id}
              label={`${flag} ${label}`}
              helperText={
                id === 'he'
                  ? 'הקלטה מקורית בעברית'
                  : 'דיבוב AI באנגלית — יסומן ב-supportedLangs'
              }
              value={getSlotValue('fullTutorial', id)}
              onChange={(next) => updateVideoSlot('fullTutorial', id, next)}
              uploadTitle={`${exerciseName} — tutorial — ${id}`}
            />
          ))}
        </div>
        {/* supportedLangs status badge */}
        {(formData.supportedLangs ?? []).length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {(formData.supportedLangs ?? []).map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold"
              >
                {l === 'he' ? '🇮🇱' : '🇺🇸'} {l.toUpperCase()} ✓
              </span>
            ))}
            <span className="text-[10px] text-gray-400 self-center">
              שפות עם tutorial מוכן
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (noContainer) return body;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
      <header>
        <h3 className="text-sm font-bold text-gray-900">סרטוני ספרייה (Bunny.net)</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          כל שפה מקבלת סרטון משלה. העלה HE תמיד; EN רק כשהדיבוב מוכן.
        </p>
      </header>
      {body}
    </div>
  );
}
