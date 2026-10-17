'use client';

/**
 * EquipmentTextListEditor — a small ordered list of free-text lines for the
 * gym-equipment editor ("דגשים" / "טיפים"): add / remove / move up-down, a
 * per-line char counter that turns amber past `warnChars`.
 *
 * Values are kept RAW while typing (no trim, no collapse — a textarea, so a
 * pasted multi-line value survives intact); cleanup happens once at save time
 * in buildEquipmentTextFields (gym-equipment-text.utils).
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

interface EquipmentTextListEditorProps {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
  warnChars: number;
  placeholder?: string;
  addLabel: string;
}

export default function EquipmentTextListEditor({
  label,
  hint,
  items,
  onChange,
  max,
  warnChars,
  placeholder,
  addLabel,
}: EquipmentTextListEditorProps) {
  const update = (index: number, value: string) => {
    const next = [...items];
    next[index] = value;
    onChange(next);
  };
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-bold text-gray-700">
          {label} <span className="font-normal text-gray-400">({items.length}/{max})</span>
        </label>
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          disabled={items.length >= max}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          {addLabel}
        </button>
      </div>
      {hint && <p className="text-xs text-gray-400 mb-3">{hint}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">אין פריטים</p>
      ) : (
        <ol className="space-y-3">
          {items.map((item, index) => {
            const len = item.trim().length;
            const over = len > warnChars;
            return (
              <li key={index} className="flex gap-2 items-start">
                <span className="mt-2.5 w-6 h-6 flex-shrink-0 rounded-full bg-cyan-100 text-cyan-700 font-bold text-xs flex items-center justify-center">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <textarea
                    value={item}
                    onChange={(e) => update(index, e.target.value)}
                    rows={2}
                    dir="rtl"
                    placeholder={placeholder}
                    className={`w-full px-4 py-2.5 text-base border rounded-xl resize-y focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
                      over ? 'border-amber-400' : 'border-gray-300'
                    }`}
                  />
                  <p className={`text-xs mt-1 ${over ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>
                    {len}/{warnChars}
                    {over && ' — ארוך מדי למסך האימון, כדאי לקצר'}
                  </p>
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="הזז למעלה"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="הזז למטה"
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label="מחק"
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
