'use client';

export interface SummaryTab {
  id: string;
  label: string;
}

interface SummaryTabsProps {
  tabs: SummaryTab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Primary tab switcher (design spec v0.9 §1: סקירה · אירובי · כוח · סטטיסטיקה).
 * Deep dives open as a SummarySheet, not as tabs.
 */
export default function SummaryTabs({ tabs, active, onChange }: SummaryTabsProps) {
  return (
    <div
      dir="rtl"
      style={{ display: 'flex', gap: 4, padding: 4, background: '#eef2f1', borderRadius: 999, fontFamily: 'var(--font-simpler)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'var(--font-simpler)',
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? '#0f6e56' : '#6b7472',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
