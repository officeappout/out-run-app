'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Camera, Upload, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import type { WizardData } from './index';

interface Props {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export default function Step3Photo({ data, updateData, onBack, onSubmit, submitting }: Props) {
  const { profile } = useUserStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(data.photoUrl);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    try {
      const path = `contribution-photos/${profile.id}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateData({ photoUrl: url });
      setPreview(url);
    } catch (err) {
      console.error('[Step3Photo] Upload failed:', err);
      setPreview(null);
      updateData({ photoUrl: null });
    } finally {
      setUploading(false);
    }
  }, [profile?.id, updateData]);

  const handleRemove = () => {
    setPreview(null);
    updateData({ photoUrl: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full px-4 pb-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <p className="text-slate-500 text-xs font-bold mb-3">תמונה (לא חובה)</p>

      {/* Preview or upload area */}
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden mb-4 border border-slate-200">
          <img src={preview} alt="תצוגה מקדימה" className="w-full h-52 object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 size={28} className="text-[#00E5FF] animate-spin" />
            </div>
          )}
          <button
            onClick={handleRemove}
            className="absolute top-3 left-3 p-2 rounded-full bg-red-500/80 text-white active:scale-90 transition-transform"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 h-52 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 mb-4 active:bg-slate-100 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <Camera size={24} className="text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-500 text-sm font-medium">צלמו או בחרו תמונה</p>
            <p className="text-slate-400 text-[11px] mt-1">JPG, PNG עד 10MB</p>
          </div>
        </button>
      )}

      {/* Submit summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
        <p className="text-slate-400 text-[11px] font-bold mb-2">סיכום:</p>
        <div className="space-y-1 text-slate-600 text-xs">
          <p>📍 {data.parkName || 'ללא שם'}</p>
          {data.facilityType && <p>🏷️ {data.facilityType}</p>}
          {data.featureTags.length > 0 && (
            <p>✅ {data.featureTags.length} תכונות</p>
          )}
          {data.photoUrl && <p>📸 תמונה צורפה</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-auto">
        <button
          onClick={onBack}
          className="px-6 py-3.5 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-[0.98]"
        >
          חזרה
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || uploading}
          className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            submitting || uploading
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              שולח...
            </>
          ) : (
            'שלח לאישור 🚀'
          )}
        </button>
      </div>
    </div>
  );
}
