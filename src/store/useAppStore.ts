import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ==========================================
// App Global State (i18n, Direction, etc.)
// ==========================================
type Language = 'he' | 'en';
type Direction = 'rtl' | 'ltr';

interface AppState {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
}

// Safe storage that checks for window
const safeStorage = typeof window !== 'undefined' 
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }));

// ==========================================
// App Store עם Persist
// ==========================================
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: 'he',
      direction: 'rtl',
      setLanguage: (lang: Language) => {
        set({
          language: lang,
          direction: lang === 'he' ? 'rtl' : 'ltr',
        });
      },
    }),
    {
      name: 'out-app-storage',
      storage: safeStorage,
      skipHydration: typeof window === 'undefined', // Skip hydration during SSR
    }
  )
);
