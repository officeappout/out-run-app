/**
 * Programs Domain - Barrel Export
 */

// Types
export * from './core/program.types';

// Services
export * from './core/program.service';
export * from './core/level.service';
export * from './core/programLevelSettings.service';

// Utilities
export { getProgramIcon, getProgramIconLabel, getProgramShortLabel, resolveIconKey, resolveProgramLabel, PROGRAM_ALIAS_TO_ICON, SLUG_HEBREW_FALLBACK, SmartDayIcon, CheckMarkBadge, CyanDot, BRAND_CYAN } from './core/program-icon.util';
export type { ProgramIconKey, DayIconStatus, SmartDayIconProps } from './core/program-icon.util';
// English support (string | LocalizedText) for programs / levels / level settings
export { pickProgramText, normalizeStoredTextFields, foldLocalizedFieldsForWrite } from './core/localized-fields';
export { useProgramText } from './core/useProgramText';
