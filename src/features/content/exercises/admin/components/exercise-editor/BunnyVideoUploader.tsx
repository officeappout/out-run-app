'use client';

/**
 * BunnyVideoUploader — single upload slot for a `previewVideo` or `fullTutorial`.
 *
 * Renders a thumbnail preview when a video already exists, or a spacious drag-and-drop
 * zone when empty. Wraps `useBunnyUploader` for the actual TUS flow.
 *
 * Drop behaviour:
 *   • Empty state  — drag a video file over the zone → cyan highlight → drop to upload.
 *   • Filled state — drag a new file over the thumbnail → cyan highlight → drop to replace.
 *   • Click anywhere in the zone (empty) or the "החלף" button (filled) opens the picker.
 */

import { useRef, useState, useCallback, DragEvent } from 'react';
import { UploadCloud, X, Loader2, CheckCircle2, AlertCircle, Video as VideoIcon, RefreshCw } from 'lucide-react';
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

  // Track whether the user is dragging a file over this component.
  const [isDragOver, setIsDragOver] = useState(false);
  // Drag-enter fires once per child re-render; track nesting depth to avoid flicker.
  const dragDepthRef = useRef(0);

  const isBusy =
    state.status === 'creating' ||
    state.status === 'uploading' ||
    state.status === 'processing';

  // ── Shared file processor ────────────────────────────────────────────────
  const processFile = useCallback(
    async (file: File) => {
      try {
        const result = await upload(file, { title: uploadTitle });
        onChange(result);
      } catch (err) {
        // useBunnyUploader already set state.errorMessage
        console.warn('Bunny upload error:', err);
      }
    },
    [upload, uploadTitle, onChange],
  );

  // ── Input handler (click-to-pick) ────────────────────────────────────────
  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await processFile(file);
  };

  // ── Drag-and-drop handlers ───────────────────────────────────────────────

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setIsDragOver(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Required to tell the browser this is a valid drop target.
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragOver(false);

    if (!configured || isBusy) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Accept any video file dropped here.
    if (!file.type.startsWith('video/')) return;

    await processFile(file);
  };

  // ── Drag-zone wrapper classes ────────────────────────────────────────────
  const dropWrapperBase =
    'relative rounded-2xl border-2 transition-all duration-150';

  const dropWrapperState = isBusy
    ? 'border-gray-200 bg-gray-50 cursor-default'
    : isDragOver
      ? 'border-cyan-400 bg-cyan-50 shadow-[0_0_0_4px_rgba(6,182,212,0.15)] cursor-copy'
      : 'border-dashed border-gray-300 bg-gray-50 hover:border-cyan-300 hover:bg-cyan-50/30';

  return (
    <div
      className={`${dropWrapperBase} ${dropWrapperState}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay label — appears over any child content */}
      {isDragOver && !isBusy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-cyan-50/80 backdrop-blur-[2px] pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-cyan-600">
            <UploadCloud size={36} className="animate-bounce" />
            <span className="text-sm font-black">
              {value ? 'שחרר להחלפה' : 'שחרר להעלאה'}
            </span>
          </div>
        </div>
      )}

      <div className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-gray-700">{label}</p>
            {helperText && (
              <p className="text-[10px] text-gray-500 mt-0.5">{helperText}</p>
            )}
          </div>
          {value && !isBusy && (
            <div className="flex items-center gap-1">
              {/* Replace button */}
              <button
                type="button"
                onClick={handlePick}
                className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                title="החלף סרטון"
              >
                <RefreshCw size={13} />
              </button>
              {/* Remove button */}
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="הסר סרטון"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── Existing video preview ─────────────────────────────────────── */}
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
            <p className="text-[10px] text-gray-400 text-center">
              גרור סרטון חדש לכאן כדי להחליף
            </p>
          </div>
        )}

        {/* ── Empty state — spacious drop zone ──────────────────────────── */}
        {!value && !isBusy && (
          <button
            type="button"
            onClick={configured ? handlePick : undefined}
            disabled={!configured}
            className={`w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl transition-colors ${
              configured
                ? 'cursor-pointer'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            <div
              className={`p-3 rounded-full transition-colors ${
                isDragOver
                  ? 'bg-cyan-200 text-cyan-700'
                  : 'bg-gray-100 text-gray-400 group-hover:bg-cyan-100 group-hover:text-cyan-600'
              }`}
            >
              <UploadCloud size={28} />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-bold text-gray-600">
                {configured
                  ? 'גררו את הסרטון לכאן או לחצו לבחירה'
                  : 'Bunny.net לא מוגדר'}
              </p>
              {configured ? (
                <p className="text-[11px] text-gray-400">
                  MP4 · MOV · WebM · עד כל גודל
                </p>
              ) : (
                <p className="text-[10px] text-gray-400">
                  הוסף BUNNY_API_KEY ו-BUNNY_LIBRARY_ID ל-.env.local
                </p>
              )}
            </div>
          </button>
        )}

        {/* ── Upload progress ────────────────────────────────────────────── */}
        {isBusy && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <Loader2 size={14} className="animate-spin text-cyan-500 shrink-0" />
              <span className="font-bold flex-1">
                {state.status === 'creating' && 'יוצר סרטון בספרייה...'}
                {state.status === 'uploading' && `מעלה... ${state.progress}%`}
                {state.status === 'processing' && 'מקודד ב-Bunny...'}
              </span>
              <button
                type="button"
                onClick={cancel}
                className="text-[11px] font-semibold text-red-500 hover:text-red-700 shrink-0"
              >
                בטל
              </button>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{
                  width: `${state.status === 'processing' ? 100 : state.progress}%`,
                }}
              />
            </div>
            {state.status === 'uploading' && (
              <p className="text-[10px] text-center text-gray-400">
                מעלה ישירות ל-Bunny CDN…
              </p>
            )}
            {state.status === 'processing' && (
              <p className="text-[10px] text-center text-gray-400">
                ממתין לסיום קידוד הסרטון…
              </p>
            )}
          </div>
        )}

        {/* ── Success flash ──────────────────────────────────────────────── */}
        {state.status === 'done' && value && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
            <CheckCircle2 size={12} />
            הסרטון נטען בהצלחה
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {state.status === 'error' && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-600">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{state.errorMessage ?? 'שגיאה לא ידועה'}</span>
          </div>
        )}
      </div>

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
