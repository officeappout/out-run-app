"use client";

import React from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';

interface EquipmentSelectorProps {
  value?: {
    category?: 'none' | 'home' | 'gym';
    items?: string[]; // פריטי ציוד נבחרים (רק אם category === 'home')
  };
  onChange: (value: { category: 'none' | 'home' | 'gym'; items?: string[] }) => void;
}

// רשימת פריטי ציוד לבית
const HOME_EQUIPMENT_ITEMS = [
  {
    id: 'parallelBars',
    labelKey: 'onboarding.equipment.parallelBars' as DictionaryKey,
    icon: 'fitness_center', // מקבילים - אייקון כושר
  },
  {
    id: 'pullUpBar',
    labelKey: 'onboarding.equipment.pullUpBar' as DictionaryKey,
    icon: 'sports_gymnastics', // מתח - אייקון התעמלות
  },
  {
    id: 'resistanceBand',
    labelKey: 'onboarding.equipment.resistanceBand' as DictionaryKey,
    icon: 'linear_scale', // גומיית התנגדות
  },
  {
    id: 'trx',
    labelKey: 'onboarding.equipment.trx' as DictionaryKey,
    icon: 'settings_ethernet', // TRX - כבל/רצועה
  },
  {
    id: 'weights',
    labelKey: 'onboarding.equipment.weights' as DictionaryKey,
    icon: 'sports_martial_arts', // משקולות - דמבל
  },
  {
    id: 'rings',
    labelKey: 'onboarding.equipment.rings' as DictionaryKey,
    icon: 'radio_button_checked', // טבעות
  },
];

export default function EquipmentSelector({
  value,
  onChange,
}: EquipmentSelectorProps) {
  const { language } = useAppStore();
  const selectedCategory = value?.category;
  const selectedItems = value?.items || [];

  const handleCategorySelect = (category: 'none' | 'home' | 'gym') => {
    if (category === 'home') {
      // אם בוחרים home, שמור את הפריטים הקיימים (אם יש)
      onChange({ category, items: selectedItems });
    } else {
      // אם בוחרים none או gym, נקה את הפריטים
      onChange({ category, items: undefined });
    }
  };

  const toggleEquipmentItem = (itemId: string) => {
    if (selectedItems.includes(itemId)) {
      // הסרה
      const newItems = selectedItems.filter(id => id !== itemId);
      onChange({ category: 'home', items: newItems });
    } else {
      // הוספה
      onChange({ category: 'home', items: [...selectedItems, itemId] });
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* כרטיס: אין לי ציוד */}
      <button
        onClick={() => handleCategorySelect('none')}
        className={`
          w-full rounded-2xl p-4 text-start
          bg-white shadow-sm border-2 transition-all duration-200
          active:scale-[0.98]
          ${selectedCategory === 'none'
            ? 'border-[#00C9F2] shadow-md shadow-[#00C9F2]/20' 
            : 'border-gray-200 hover:border-gray-300'
          }
        `}
      >
        <p className={`text-base font-medium ${selectedCategory === 'none' ? 'text-[#00C9F2]' : 'text-gray-900'}`}>
          {getTranslation('onboarding.equipment.none', language)}
        </p>
      </button>

      {/* כרטיס: יש לי ציוד אישי בבית */}
      <div
        className={`
          rounded-2xl border-2 transition-all duration-200
          ${selectedCategory === 'home'
            ? 'border-[#00C9F2] shadow-md shadow-[#00C9F2]/20 bg-white'
            : 'border-gray-200 bg-white'
          }
        `}
      >
        <button
          onClick={() => handleCategorySelect('home')}
          className="w-full p-4 text-start"
        >
          <h3 className={`text-base font-semibold mb-1 ${selectedCategory === 'home' ? 'text-[#00C9F2]' : 'text-gray-900'}`}>
            {getTranslation('onboarding.equipment.home', language)}
          </h3>
          <p className="text-sm text-gray-600">
            {getTranslation('onboarding.equipment.selectItems', language)}
          </p>
        </button>

        {/* Grid של פריטי ציוד - מוצג רק אם בחרו home */}
        {selectedCategory === 'home' && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 mt-3">
              {HOME_EQUIPMENT_ITEMS.map((item) => {
                const isSelected = selectedItems.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleEquipmentItem(item.id)}
                    className={`
                      flex items-center justify-center gap-2 p-3 rounded-xl
                      font-medium text-sm
                      transition-all duration-200
                      active:scale-95
                      ${isSelected
                        ? 'bg-[#00C9F2] text-white shadow-md shadow-[#00C9F2]/30'
                        : 'bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <span className="material-icons-round text-lg">{item.icon}</span>
                    <span>{getTranslation(item.labelKey, language)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* כרטיס: אני מתאמן/ת גם בחדר כושר */}
      <button
        onClick={() => handleCategorySelect('gym')}
        className={`
          w-full rounded-2xl p-4 text-start
          bg-white shadow-sm border-2 transition-all duration-200
          active:scale-[0.98]
          ${selectedCategory === 'gym'
            ? 'border-[#00C9F2] shadow-md shadow-[#00C9F2]/20' 
            : 'border-gray-200 hover:border-gray-300'
          }
        `}
      >
        <p className={`text-base font-medium ${selectedCategory === 'gym' ? 'text-[#00C9F2]' : 'text-gray-900'}`}>
          {getTranslation('onboarding.equipment.gym', language)}
        </p>
      </button>
    </div>
  );
}
