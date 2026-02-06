'use client';

import { Plus, X } from 'lucide-react';
import { InstructionalVideo, InstructionalVideoLang } from '../../../../core/exercise.types';

interface InstructionalVideosEditorProps {
  videos: InstructionalVideo[];
  onChange: (videos: InstructionalVideo[]) => void;
}

export default function InstructionalVideosEditor({ videos, onChange }: InstructionalVideosEditorProps) {
  const languageOptions: { value: InstructionalVideoLang; label: string }[] = [
    { value: 'he', label: 'עברית' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
  ];

  const handleUpdate = (index: number, patch: Partial<InstructionalVideo>) => {
    const next = [...videos];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const handleAdd = () => {
    onChange([...videos, { lang: 'he', url: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(videos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {videos.map((video, index) => (
        <div
          key={index}
          className="flex flex-col md:flex-row gap-2 items-stretch md:items-center bg-gray-50 border border-gray-200 rounded-xl p-3"
        >
          <select
            value={video.lang}
            onChange={(e) => handleUpdate(index, { lang: e.target.value as InstructionalVideoLang })}
            className="md:w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-xs"
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={video.url}
            onChange={(e) => handleUpdate(index, { url: e.target.value })}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-xs"
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="self-end md:self-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="מחק סרטון"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-700"
      >
        <Plus size={14} />
        הוסף סרטון הדרכה
      </button>
    </div>
  );
}
