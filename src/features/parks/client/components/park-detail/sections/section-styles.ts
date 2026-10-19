/** Shared class strings of the park sheet's sections (classic vs v2). */
export const sectionTitleClass = (v2: boolean) =>
  v2 ? 'mb-3 text-[17px] font-black text-v2-ink' : 'text-[16px] font-bold text-gray-900 dark:text-white mb-3';

export const metaChipClass = (v2: boolean) =>
  v2 ? 'flex items-center gap-1 text-[13.5px] font-bold text-v2-muted' : 'text-xs text-gray-400 flex items-center gap-1';

export const actionIconButtonClass = (v2: boolean) =>
  v2
    ? 'grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-white ring-1 ring-inset ring-v2-pill-border transition-transform duration-150 ease-v2 active:scale-[0.96]'
    : 'flex-shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm active:scale-90 transition-transform';
