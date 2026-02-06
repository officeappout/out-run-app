"use client";

import React from 'react';
import { DynamicQuestionNode } from '../engine/DynamicOnboardingEngine';
import { Coins } from 'lucide-react';
import { MultilingualText } from '@/types/onboarding-questionnaire';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface DynamicQuestionRendererProps {
  question: DynamicQuestionNode;
  selectedAnswerId?: string;
  onAnswer: (answerId: string) => void;
}

type AppLanguage = 'he' | 'en' | 'ru';

/**
 * Helper: Extract text from string | MultilingualText with language and gender support
 */
function getTextValue(
  text: string | MultilingualText | undefined,
  language: AppLanguage = 'he',
  gender: 'male' | 'female' | 'neutral' = 'neutral'
): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  
  // Extract language-specific content
  const langContent = text[language];
  if (!langContent) {
    // Fallback to Hebrew if current language not available
    const fallbackContent = text['he'];
    if (fallbackContent) {
      return gender === 'female' && fallbackContent.female 
        ? fallbackContent.female 
        : fallbackContent.neutral || '';
    }
    // Last resort: get first available language
    const firstLang = Object.keys(text)[0];
    if (firstLang) {
      const firstContent = text[firstLang];
      return gender === 'female' && firstContent.female 
        ? firstContent.female 
        : firstContent.neutral || '';
    }
    return '';
  }
  
  // Return gender-specific version if available, otherwise neutral
  return gender === 'female' && langContent.female 
    ? langContent.female 
    : langContent.neutral || '';
}

export default function DynamicQuestionRenderer({
  question,
  selectedAnswerId,
  onAnswer,
}: DynamicQuestionRendererProps) {
  // 🔍 Debug: Inspect current question payload from engine / Firestore
  console.log('DynamicQuestionRenderer :: Current Question:', question);

  // Get language and gender from sessionStorage
  const language: AppLanguage = typeof window !== 'undefined' 
    ? (sessionStorage.getItem('onboarding_language') || 'he') as AppLanguage
    : 'he';
  const savedGender = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_gender')
    : null;
  const gender: 'male' | 'female' | 'neutral' = 
    savedGender === 'male' ? 'male' : 
    savedGender === 'female' ? 'female' : 
    'neutral';

  // Extract localized text
  const title = getTextValue(question.title as any, language, gender);
  const description = question.description 
    ? getTextValue(question.description as any, language, gender)
    : undefined;

  // ✅ Default to 'large-card' if layoutType not specified
  const layoutType = question.layoutType || 'large-card';

  // ✅ Flexible type check: treat anything with answers as a choice-like question
  const isChoiceLike =
    question.type === 'choice' ||
    (question as any).type === 'multiple_choice' ||
    (Array.isArray((question as any).answers) && (question as any).answers.length > 0);

  if (isChoiceLike) {
    return (
      <div className="w-full font-simpler" dir={language === 'he' ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="text-center mb-6 px-8">
          <h2 className="text-xl font-black leading-tight text-slate-900 mb-1">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-slate-500 font-medium">
              {description}
            </p>
          )}
        </div>

        {/* ✅ Style 1: Large Card Layout (layoutType === 'large-card') */}
        {layoutType === 'large-card' && (
          <div className="flex flex-col gap-4">
            {question.answers.map((answer) => {
              const isSelected = selectedAnswerId === answer.id;
              const answerText = getTextValue(answer.text as any, language, gender);
              const coinReward = (answer as any).coinReward ?? 10; // Default to 10 coins
              const hasImage = !!answer.imageUrl;
              
              return (
                <label
                  key={answer.id}
                  className={`
                    group relative w-full rounded-2xl overflow-hidden cursor-pointer
                    border-2 transition-all duration-200 active:scale-[0.98]
                    shadow-[0_10px_40px_rgba(91,194,242,0.12)]
                    ${hasImage ? 'h-40' : 'h-auto py-6'}
                    ${
                      isSelected
                        ? 'border-[#5BC2F2] shadow-[0_0_20px_-5px_rgba(91,194,242,0.6)]'
                        : 'border-transparent hover:border-[#5BC2F2]/50 bg-white'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={answer.id}
                    checked={isSelected}
                    onChange={() => onAnswer(answer.id)}
                    className="sr-only peer"
                  />
                  
                  {/* Coin Reward Badge - Top Left - COIN_SYSTEM_PAUSED: Re-enable in April */}
                  {IS_COIN_SYSTEM_ENABLED && coinReward > 0 && (
                    <div className="absolute top-3 left-3 z-20 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                      <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                      <span className="text-xs font-bold font-simpler">+{coinReward}</span>
                    </div>
                  )}
                  
                  {/* Background Image - Only if has valid URL */}
                  {hasImage && (
                    <img
                      alt={answerText}
                      src={answer.imageUrl}
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => {
                        // Hide the broken image - don't use placeholder
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  )}

                  {/* Gradient Overlay - Only for cards with images */}
                  {hasImage && (
                    <div
                      className={`absolute inset-0 transition-opacity duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-t from-white via-white/90 to-transparent'
                          : 'bg-gradient-to-t from-white via-white/85 to-white/10'
                      }`}
                    />
                  )}

                  {/* Text Content - Centered when no image, at bottom when has image */}
                  <div className={`
                    ${hasImage 
                      ? `absolute inset-0 p-5 flex flex-col justify-end ${language === 'he' ? 'text-right' : 'text-left'}`
                      : 'flex items-center justify-center text-center px-5'
                    }
                  `}>
                    <h3 className="text-lg font-black text-slate-900">
                      {answerText}
                    </h3>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* ✅ Style 2: Horizontal Row Layout (layoutType === 'horizontal-list') */}
        {layoutType === 'horizontal-list' && (
          <div className="flex flex-col gap-3">
            {question.answers.map((answer) => {
              const isSelected = selectedAnswerId === answer.id;
              const answerText = getTextValue(answer.text as any, language, gender);
              const coinReward = (answer as any).coinReward ?? 10; // Default to 10 coins
              const hasImage = !!answer.imageUrl;
              
              return (
                <label
                  key={answer.id}
                  className="cursor-pointer group relative"
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={answer.id}
                    checked={isSelected}
                    onChange={() => onAnswer(answer.id)}
                    className="sr-only peer"
                  />
                  
                  {/* Coin Reward Badge - Top Left (absolute positioned) - COIN_SYSTEM_PAUSED: Re-enable in April */}
                  {IS_COIN_SYSTEM_ENABLED && coinReward > 0 && (
                    <div className="absolute top-2 left-2 z-20 bg-yellow-100 text-yellow-700 rounded-full px-2 py-1 flex items-center gap-1 shadow-md">
                      <Coins size={12} className="text-yellow-700" strokeWidth={2.5} />
                      <span className="text-xs font-bold font-simpler">+{coinReward}</span>
                    </div>
                  )}
                  
                  {/* Card Container - Flex Row */}
                  <div
                    className={`
                      bg-white rounded-xl h-20 shadow-[0_10px_40px_rgba(91,194,242,0.12)]
                      flex items-center overflow-hidden
                      border transition-all duration-200
                      ${language === 'he' ? 'flex-row-reverse' : 'flex-row'}
                      ${hasImage ? 'justify-between' : 'justify-center'}
                      ${
                        isSelected
                          ? 'border-[#5BC2F2] ring-2 ring-[#5BC2F2]/30'
                          : 'border-transparent hover:border-gray-200'
                      }
                    `}
                  >
                    {/* Image - Only show if has valid URL */}
                    {hasImage && (
                      <div className="h-full w-24 relative flex-shrink-0">
                        <img
                          alt={answerText}
                          src={answer.imageUrl}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            // Hide the broken image container
                            const target = e.target as HTMLImageElement;
                            if (target.parentElement) {
                              target.parentElement.style.display = 'none';
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Title - Centered when no image, flexible when has image */}
                    <span className={`text-sm font-medium px-5 text-slate-800 ${
                      hasImage 
                        ? `flex-grow ${language === 'he' ? 'text-right' : 'text-left'}`
                        : 'text-center'
                    }`}>
                      {answerText}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Input type (for future use)
  return (
    <div className={`w-full space-y-4 font-simpler`} dir={language === 'he' ? 'rtl' : 'ltr'}>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-black text-slate-900">{title}</h2>
        {description && (
          <p className="text-slate-600 text-lg leading-relaxed font-medium">{description}</p>
        )}
      </div>

      <input
        type="text"
        className={`w-full px-6 py-4 border-2 border-gray-200 rounded-xl text-lg focus:border-[#5BC2F2] focus:ring-2 focus:ring-[#5BC2F2]/20 outline-none bg-white text-black placeholder-gray-400 font-medium font-simpler ${language === 'he' ? 'text-right' : 'text-left'}`}
        placeholder={language === 'he' ? 'הכנס תשובה...' : 'Enter answer...'}
        onChange={(e) => {
          // For input type, we'll need to handle this differently
          // For now, just show the input
        }}
      />
    </div>
  );
}
