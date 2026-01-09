"use client";

import React, { useState } from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { ImageIcon } from 'lucide-react';

interface ChoiceCardProps {
  id: string;
  labelKey: DictionaryKey;
  imageRes?: string;
  isSelected: boolean;
  onClick: () => void;
  description?: string;
  descriptionKey?: any;
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/400x300/00E5FF/FFFFFF?text=No+Image';

export default function ChoiceCard({
  id,
  labelKey,
  imageRes,
  isSelected,
  onClick,
  description,
  descriptionKey,
}: ChoiceCardProps) {
  const { language } = useAppStore();
  const label = getTranslation(labelKey, language);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    // ננסה placeholder אם יש imageRes
    if (imageRes && target.src !== PLACEHOLDER_IMAGE) {
      target.src = PLACEHOLDER_IMAGE;
    } else {
      // אם גם placeholder נכשל, נציג div עם אייקון
      setImageError(true);
      target.style.display = 'none';
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full rounded-2xl overflow-hidden
        bg-white shadow-sm border-2 transition-all duration-200
        active:scale-[0.98]
        ${isSelected 
          ? 'border-[#00E5FF] shadow-md shadow-[#00E5FF]/20' 
          : 'border-gray-200 hover:border-gray-300'
        }
      `}
    >
      {/* תמונה */}
      {imageRes && (
        <div className="relative w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          {imageError ? (
            // Fallback עם אייקון וצבע
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#00E5FF]/10 to-[#00B8D4]/10">
              <ImageIcon className="w-16 h-16 text-[#00E5FF] opacity-50" />
              <span className="text-xs text-gray-500 mt-2">{label}</span>
            </div>
          ) : (
            <>
              {!imageLoaded && (
                // Loading skeleton
                <div className="absolute inset-0 bg-gray-200 animate-pulse" />
              )}
              <img
                src={imageRes}
                alt={label}
                className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
                onError={handleImageError}
                onLoad={handleImageLoad}
              />
            </>
          )}
        </div>
      )}

      {/* תוכן */}
      <div className="p-4 text-start">
        <h3 className={`text-lg font-semibold mb-1 ${isSelected ? 'text-[#00E5FF]' : 'text-gray-900'}`}>
          {label}
        </h3>
        {description && (
          <p className="text-sm text-gray-600 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}
