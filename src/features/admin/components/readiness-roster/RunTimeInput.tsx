'use client';

/**
 * Two small number inputs (minutes, seconds) that combine into a single
 * total-seconds value — matches the "ריצה (דק׳:שנ׳)" column's locked
 * format while readiness_results stores the run in seconds (same unit
 * the seeded threshold uses: 1080/1200 for 18:00/20:00).
 */
interface RunTimeInputProps {
  totalSeconds: number | null;
  onChange: (totalSeconds: number | null) => void;
  disabled?: boolean;
}

export default function RunTimeInput({ totalSeconds, onChange, disabled }: RunTimeInputProps) {
  const minutes = totalSeconds !== null ? Math.floor(totalSeconds / 60) : '';
  const seconds = totalSeconds !== null ? totalSeconds % 60 : '';

  const emit = (min: string, sec: string) => {
    if (min === '' && sec === '') { onChange(null); return; }
    const m = min === '' ? 0 : parseInt(min, 10);
    const s = sec === '' ? 0 : parseInt(sec, 10);
    if (Number.isNaN(m) || Number.isNaN(s)) { onChange(null); return; }
    onChange(m * 60 + s);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        disabled={disabled}
        value={minutes}
        onChange={(e) => emit(e.target.value, String(seconds))}
        placeholder="דק׳"
        className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-300"
      />
      <span className="text-gray-400">:</span>
      <input
        type="number"
        min={0}
        max={59}
        disabled={disabled}
        value={seconds}
        onChange={(e) => emit(String(minutes), e.target.value)}
        placeholder="שנ׳"
        className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-300"
      />
    </div>
  );
}
