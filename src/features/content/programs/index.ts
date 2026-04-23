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
export { getProgramIcon, getProgramIconLabel, getProgramShortLabel, resolveIconKey, PROGRAM_ALIAS_TO_ICON, SmartDayIcon, CheckMarkBadge, CyanDot, BRAND_CYAN } from './core/program-icon.util';
export type { ProgramIconKey, DayIconStatus, SmartDayIconProps } from './core/program-icon.util';