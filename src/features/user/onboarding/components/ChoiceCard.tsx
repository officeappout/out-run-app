"use client";

import React, { useState } from 'react';
import { ImageIcon, Coins } from 'lucide-react';
import { QuestionLayoutType } from '@/types/onboarding-questionnaire';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface ChoiceCardProps {
  id: string;
  text: string;
  imageUrl?: string;
  isSelected: boolean;
  onClick: () => void;
  description?: string;
  layoutType?: QuestionLayoutType; // 'large-card' or 'horizontal-list'
  coinReward?: number; // Optional coin reward (defaults to 10)
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/400x300/00BFFF/FFFFFF?text=No+Image';

/**
 * ChoiceCard Component
 * Renders either Large Card or Horizontal Row style based on layoutType prop
 */
export default function ChoiceCard({
  id,
  text,
  imageUrl,
  isSelected,
  onClick,
  description,
  layoutType = 'large-card', // ✅ Default to 'large-card'
  coinReward = 10, // Default to 10 coins
}: ChoiceCardProps) {
  const [imageError, setImageError] = useState(false);
  
  // COIN_SYSTEM_PAUSED: Render coin reward badge only if system is enabled
  const renderCoinBadge = () => {
    // COIN_SYSTEM_PAUSED: Re-enable in April
    if (!IS_COIN_SYSTEM_ENABLED) return null;
    if (coinReward === 0) return null;
    
    return (
      <div className="absolute top-3 left-3 z-20 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
        <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
        <span className="text-xs font-bold font-simpler">+{coinReward}</span>
      </div>
    );
  };

  // ✅ Style 1: Large Card (layoutType === 'large-card')
  if (layoutType === 'large-card') {
    return (
      <label
        htmlFor={id}
        className={`
          group relative w-full h-40 rounded-2xl overflow-hidden cursor-pointer
          border-2 transition-all duration-200 active:scale-[0.98]
          ${
            isSelected
              ? 'border-[#00BFFF] shadow-[0_0_20px_-5px_rgba(0,187,249,0.6)]'
              : 'border-transparent hover:border-[#00BFFF]/50 bg-white dark:bg-[#1e293b] shadow-md dark:shadow-none'
          }
        `}
        onClick={onClick}
      >
        <input
          type="radio"
          id={id}
          name={`choice-${id}`}
          checked={isSelected}
          onChange={onClick}
          className="sr-only peer"
        />

        {/* Coin Reward Badge - Top Left */}
        {renderCoinBadge()}

        {/* Background Image - Full Coverage */}
        {imageUrl && !imageError ? (
          <img
            alt={text}
            src={imageUrl}
            className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-600" />
          </div>
        )}

        {/* Gradient Overlay - Bottom to Top */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            isSelected
              ? 'bg-gradient-to-t from-white via-white/90 to-transparent dark:from-[#1e293b] dark:via-[#1e293b]/90'
              : 'bg-gradient-to-t from-white via-white/85 to-white/10 dark:from-[#1e293b] dark:via-[#1e293b]/90 dark:to-[#1e293b]/20'
          }`}
        />

        {/* Text Content - Positioned at Bottom (RTL) */}
        <div className="absolute inset-0 p-5 flex flex-col justify-end text-right">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {text}
          </h3>
          {description && (
            <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              {description}
            </p>
          )}
        </div>
      </label>
    );
  }

  // ✅ Style 2: Horizontal Row (layoutType === 'horizontal-list')
  return (
    <label
      htmlFor={id}
      className="cursor-pointer group relative"
      onClick={onClick}
    >
      <input
        type="radio"
        id={id}
        name={`choice-${id}`}
        checked={isSelected}
        onChange={onClick}
        className="sr-only peer"
      />

      {/* Card Container - Flex Row */}
      {/* Coin Reward Badge - Top Left (absolute positioned) - COIN_SYSTEM_PAUSED: Hidden when disabled */}
      {IS_COIN_SYSTEM_ENABLED && coinReward > 0 && (
        <div className="absolute top-2 left-2 z-20 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
          <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
          <span className="text-xs font-bold font-simpler">+{coinReward}</span>
        </div>
      )}
      <div
        className={`
          bg-white dark:bg-[#1e293b] rounded-xl h-20 shadow-[0_2px_10px_rgba(0,0,0,0.03)] 
          flex items-center justify-between overflow-hidden
          border transition-all duration-200
          ${
            isSelected
              ? 'border-[#00BFFF] ring-2 ring-[#00BFFF]/30'
              : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700'
          }
        `}
      >
        {/* Image on Right Side (RTL) - Fixed Width */}
        <div className="h-full w-24 relative flex-shrink-0">
          {imageUrl && !imageError ? (
            <img
              alt={text}
              src={imageUrl}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-gray-400 dark:text-gray-600" />
            </div>
          )}
        </div>

        {/* Title on Left Side (RTL) - Flexible */}
        <span className="text-sm font-medium px-5 flex-grow text-gray-800 dark:text-gray-100 text-right">
          {text}
        </span>
      </div>
    </label>
  );
}
