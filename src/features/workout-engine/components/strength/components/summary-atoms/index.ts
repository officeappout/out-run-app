/**
 * summary-atoms — pure presentational tiles used by StrengthSummaryPage.
 *
 * All atoms are stateless and only consume props.  They depend exclusively on
 * the shared `summary.utils` types module — never on the parent page.
 */

export { default as StatBox, type StatBoxProps } from './StatBox';
export { default as AchievementBadge, type AchievementBadgeProps } from './AchievementBadge';
export { default as ExerciseRow, type ExerciseRowProps } from './ExerciseRow';
export { default as ExerciseCategory, type ExerciseCategoryProps } from './ExerciseCategory';
export { default as PersonalRecords, type PersonalRecordsProps } from './PersonalRecords';
