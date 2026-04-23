'use client';

/**
 * BunnyVideoUploader — single upload slot for a `previewVideo` or `fullTutorial`.
 *
 * Renders a thumbnail preview when a video already exists, or a "choose file"
 * affordance when empty. Wraps `useBunnyUploader` for the actual TUS flow.
 */

import { useRef } from 'react';
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Video as VideoIcon } from 'lucide-react';
import { useBunnyUploader } from '../../hooks/useBunnyUploader';
import {
  buildBunnyEmbedUrl,
  buildBunnyThumbnailUrl,
  isBunnyConfigured,
} from '@/lib/bunny/bunny.config';
import type { ExternalVideo } from '../../../core/exercise.types';

interface BunnyVideoUploaderProps {
  label: string;
  helperText?: string;
  value?: ExternalVideo;
  onChange: (next: ExternalVideo | undefined) => void;
  /** Title prefix for the Bunny library (e.g. exercise name + slot kind). */
  uploadTitle?: string;
}

export default function BunnyVideoUploader({
  label,
  helperText,
  value,
  onChange,
  uploadTitle,
}: BunnyVideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { state, upload, cancel } = useBunnyUploader();
  const configured = isBunnyConfigured();

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so the same file can be re-selected
    try {
      const result = await upload(file, { title: uploadTitle });
      onChange(result);
    } catch (err) {
      // useBunnyUploader has already set state.errorMessage
      console.warn('Bunny upload error:', err);
    }
  };

  const isBusy =
    state.status === 'creating' ||
    state.status === 'uploading' ||
    state.status === 'processing';

  return (
    <div className="border border-gray-200 rounded-2xl p-3 bg-gray-50">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-bold text-gray-700">{label}</p>
          {helperText && (
            <p className="text-[10px] text-gray-500 mt-0.5">{helperText}</p>
          )}
        </div>
        {value && !isBusy && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="p-1 text-gray-400 hover:text-red-500"
            title="הסר סרטון"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Existing video preview */}
      {value && !isBusy && (
        <div className="space-y-2">
          {value.provider === 'bunny' ? (
            <a
              href={buildBunnyEmbedUrl(value.videoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="block relative w-full aspect-video rounded-xl overflow-hidden bg-black"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.thumbnailUrl ?? buildBunnyThumbnailUrl(value.videoId)}
                alt="Preview"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1 end-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                Bunny · {value.videoId.slice(0, 8)}…
              </span>
            </a>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-600">
              <VideoIcon size={14} />
              <span className="font-mono truncate">
                {value.provider}:{value.videoId}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state — pick file */}
      {!value && !isBusy && (
        <button
          type="button"
          onClick={handlePick}
          disabled={!configured}
          className={`w-full flex flex-col items-center justify-center gap-1 py-6 border-2 border-dashed rounded-xl transition-colors ${
            configured
              ? 'border-gray-300 text-gray-500 hover:border-cyan-400 hover:bg-cyan-50/40'
              : 'border-gray-200 text-gray-300 cursor-not-allowed'
          }`}
        >
          <Upload size={20} />
          <span className="text-xs font-bold">
            {configured ? 'העלה לסרטון Bunny.net' : 'Bunny.net לא מוגדר'}
          </span>
          {!configured && (
            <span className="text-[10px] text-gray-400">
              הוסף BUNNY_API_KEY ו-BUNNY_LIBRARY_ID ל-.env.local
            </span>
          )}
        </button>
      )}

      {/* Progress */}
      {isBusy && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-700">
            <Loader2 size={14} className="animate-spin text-cyan-500" />
            <span className="font-bold">
              {state.status === 'creating' && 'יוצר סרטון בספרייה...'}
              {state.status === 'uploading' && `מעלה... ${state.progress}%`}
              {state.status === 'processing' && 'מקודד ב-Bunny...'}
            </span>
            <button
              type="button"
              onClick={cancel}
              className="ms-auto text-[11px] font-semibold text-red-500 hover:text-red-700"
            >
              בטל
            </button>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{
                width: `${state.status === 'processing' ? 100 : state.progress}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Done flash */}
      {state.status === 'done' && value && (
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-600">
          <CheckCircle2 size={12} />
          הסרטון נטען בהצלחה
        </div>
      )}

      {/* Error */}
      {state.status === 'error' && (
        <div className="flex items-start gap-1.5 mt-1 text-[11px] text-red-600">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{state.errorMessage ?? 'שגיאה לא ידועה'}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
