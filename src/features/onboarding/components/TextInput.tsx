"use client";

import React from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
interface TextInputProps {
  placeholderKey?: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'tel' | 'email';
  maxLength?: number;
}

export default function TextInput({
  placeholderKey,
  value,
  onChange,
  type = 'text',
  maxLength,
}: TextInputProps) {
  const { language } = useAppStore();

  // 1. ננסה לתרגם. אם getTranslation לא מוצא מפתח, הוא בדרך כלל מחזיר את המפתח עצמו.
  const translated = placeholderKey ? getTranslation(placeholderKey as any, language) : '';
  
  // 2. לוגיקת ה-Fallback: אם התרגום החזיר מחרוזת ריקה או את המפתח המקורי, נשתמש ב-placeholderKey כטקסט פשוט
  const finalPlaceholder = translated || placeholderKey || '';

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // שימוש במשתנה הנכון שחישבנו למעלה
      placeholder={String(finalPlaceholder)} 
      maxLength={maxLength}
      className="w-full px-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-[#00E5FF] focus:outline-none text-lg bg-white"
      dir="rtl"
    />
  );
}