'use client';

/**
 * GenderedTextInput Component
 * 
 * A reusable input component that supports gender-specific text variations.
 * Allows content editors to provide different text for male and female users.
 */

import React, { useState, useCallback } from 'react';
import { Copy, Users, User, ChevronDown, ChevronUp, X } from 'lucide-react';
import { GenderedText, isGenderedText } from '../../../../core/exercise.types';

interface GenderedTextInputProps {
  /** Current value - can be string or GenderedText */
  value: string | GenderedText | undefined;
  /** Callback when value changes */
  onChange: (value: string | GenderedText) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label for the field */
  label?: string;
  /** Whether to use textarea instead of input */
  multiline?: boolean;
  /** Number of rows for textarea */
  rows?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export default function GenderedTextInput({
  value,
  onChange,
  placeholder = '',
  label,
  multiline = false,
  rows = 2,
  maxLength,
  disabled = false,
  className = '',
}: GenderedTextInputProps) {
  // Determine if we're in split mode (showing male/female fields)
  const [isSplit, setIsSplit] = useState(() => isGenderedText(value));
  
  // Get current values
  const getCurrentValues = useCallback((): { male: string; female: string } => {
    if (isGenderedText(value)) {
      return { male: value.male || '', female: value.female || '' };
    }
    const textValue = typeof value === 'string' ? value : '';
    return { male: textValue, female: textValue };
  }, [value]);

  const { male, female } = getCurrentValues();

  // Handle toggling split mode
  const handleToggleSplit = () => {
    if (isSplit) {
      // Collapsing: use male text as the unified text
      onChange(male);
      setIsSplit(false);
    } else {
      // Expanding: convert to gendered text
      const currentText = typeof value === 'string' ? value : '';
      onChange({ male: currentText, female: currentText });
      setIsSplit(true);
    }
  };

  // Handle text changes
  const handleChange = (gender: 'male' | 'female' | 'unified', text: string) => {
    if (gender === 'unified') {
      onChange(text);
    } else {
      const current = getCurrentValues();
      onChange({
        ...current,
        [gender]: text,
      });
    }
  };

  // Copy male text to female
  const handleCopyToFemale = () => {
    const current = getCurrentValues();
    onChange({
      ...current,
      female: current.male,
    });
  };

  // Render input or textarea
  const InputComponent = multiline ? 'textarea' : 'input';

  const inputClasses = `
    w-full px-3 py-2 border border-gray-300 rounded-lg
    focus:ring-2 focus:ring-cyan-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed
    text-sm
  `;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header with label and split toggle */}
      <div className="flex items-center justify-between">
        {label && (
          <label className="text-sm font-bold text-gray-700">
            {label}
          </label>
        )}
        <button
          type="button"
          onClick={handleToggleSplit}
          disabled={disabled}
          className={`
            flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors
            ${isSplit 
              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={isSplit ? 'איחוד לטקסט אחיד' : 'פיצול לפי מגדר'}
        >
          <Users size={14} />
          {isSplit ? (
            <>
              <ChevronUp size={12} />
              <span>אחד</span>
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              <span>פיצול מגדרי</span>
            </>
          )}
        </button>
      </div>

      {/* Input fields */}
      {isSplit ? (
        <div className="space-y-3 p-3 bg-gradient-to-br from-blue-50/50 to-pink-50/50 rounded-xl border border-gray-100">
          {/* Male input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
                <span className="text-base">♂️</span>
                <span>זכר</span>
              </div>
              <button
                type="button"
                onClick={handleCopyToFemale}
                disabled={disabled}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                title="העתק לנקבה"
              >
                <Copy size={10} />
                העתק לנקבה
              </button>
            </div>
            <InputComponent
              value={male}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => 
                handleChange('male', e.target.value)
              }
              placeholder={placeholder}
              disabled={disabled}
              maxLength={maxLength}
              rows={multiline ? rows : undefined}
              className={`${inputClasses} border-blue-200 focus:ring-blue-400`}
              dir="rtl"
            />
            {maxLength && (
              <div className="text-[10px] text-gray-400 text-left">
                {male.length}/{maxLength}
              </div>
            )}
          </div>

          {/* Female input */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-pink-700">
              <span className="text-base">♀️</span>
              <span>נקבה</span>
            </div>
            <InputComponent
              value={female}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => 
                handleChange('female', e.target.value)
              }
              placeholder={placeholder}
              disabled={disabled}
              maxLength={maxLength}
              rows={multiline ? rows : undefined}
              className={`${inputClasses} border-pink-200 focus:ring-pink-400`}
              dir="rtl"
            />
            {maxLength && (
              <div className="text-[10px] text-gray-400 text-left">
                {female.length}/{maxLength}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <InputComponent
            value={typeof value === 'string' ? value : male}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => 
              handleChange('unified', e.target.value)
            }
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            rows={multiline ? rows : undefined}
            className={inputClasses}
            dir="rtl"
          />
          {maxLength && (
            <div className="text-[10px] text-gray-400 text-left">
              {(typeof value === 'string' ? value : male).length}/{maxLength}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * GenderedTextListInput Component
 * 
 * For managing arrays of gendered text items (like specificCues or highlights)
 */
interface GenderedTextListInputProps {
  /** Current value - array of strings or GenderedText */
  value: (string | GenderedText)[] | undefined;
  /** Callback when value changes */
  onChange: (value: (string | GenderedText)[]) => void;
  /** Label for the field */
  label?: string;
  /** Placeholder for new items */
  placeholder?: string;
  /** Maximum items allowed */
  maxItems?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
}

export function GenderedTextListInput({
  value = [],
  onChange,
  label,
  placeholder = 'הוסף פריט חדש...',
  maxItems = 10,
  disabled = false,
}: GenderedTextListInputProps) {
  const [newItemText, setNewItemText] = useState('');

  // Add new item
  const handleAddItem = () => {
    if (newItemText.trim() && value.length < maxItems) {
      onChange([...value, newItemText.trim()]);
      setNewItemText('');
    }
  };

  // Update existing item
  const handleUpdateItem = (index: number, newValue: string | GenderedText) => {
    const updated = [...value];
    updated[index] = newValue;
    onChange(updated);
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    const updated = value.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="text-sm font-bold text-gray-700">
          {label}
        </label>
      )}

      {/* Existing items */}
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <GenderedTextInput
                value={item}
                onChange={(newValue) => handleUpdateItem(index, newValue)}
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              onClick={() => handleRemoveItem(index)}
              disabled={disabled}
              className="mt-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="הסר"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Add new item */}
      {value.length < maxItems && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddItem();
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            dir="rtl"
          />
          <button
            type="button"
            onClick={handleAddItem}
            disabled={disabled || !newItemText.trim()}
            className="px-3 py-2 bg-cyan-500 text-white rounded-lg font-medium text-sm hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            הוסף
          </button>
        </div>
      )}

      {value.length >= maxItems && (
        <p className="text-xs text-amber-600">
          הגעת למקסימום {maxItems} פריטים
        </p>
      )}
    </div>
  );
}
