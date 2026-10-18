'use client';

import React from 'react';
import {
  CONTENT_SITUATION_LABELS_HE,
  CONTENT_WEATHER_LABELS_HE,
} from '@/features/workout-engine/services/workout-metadata-content-fields';

/** The "moment" fields of a title / description row (weather, situation, optional timeOfDay). */
export interface MomentFieldValues {
  timeOfDay?: string;
  weather?: string;
  situation?: string;
}

interface MomentFieldSelectsProps {
  value: MomentFieldValues;
  onChange: (patch: MomentFieldValues) => void;
  /** Descriptions get their own time-of-day select here (titles already have one). */
  timeOfDayLabels?: Record<string, string>;
}

const SELECT_CLASS = 'w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500';

/**
 * Dropdowns for the moment fields. Every field is a hard filter in the engine
 * (workout-metadata.service.ts): a row with a value shows only in that moment;
 * empty = shows in any moment.
 */
export default function MomentFieldSelects({ value, onChange, timeOfDayLabels }: MomentFieldSelectsProps) {
  return (
    <div className={`grid gap-4 ${timeOfDayLabels ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {timeOfDayLabels && (
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">שעת היום</label>
          <select
            value={value.timeOfDay || 'any'}
            onChange={(e) => onChange({ timeOfDay: e.target.value })}
            className={SELECT_CLASS}
          >
            {Object.entries(timeOfDayLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">מזג אוויר</label>
        <select
          value={value.weather || ''}
          onChange={(e) => onChange({ weather: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="">כל מזג אוויר</option>
          {Object.entries(CONTENT_WEATHER_LABELS_HE).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">מוצג רק במזג האוויר הזה (+5 ניקוד)</p>
      </div>
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">מצב</label>
        <select
          value={value.situation || ''}
          onChange={(e) => onChange({ situation: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="">כל אימון</option>
          {Object.entries(CONTENT_SITUATION_LABELS_HE).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">מוצג רק במצב הזה (+5 ניקוד)</p>
      </div>
    </div>
  );
}
