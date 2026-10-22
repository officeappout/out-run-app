/**
 * A planned run's icon + colour by run type — the home strip's RunningDayIcon language
 * (moved here unchanged from SmartWeeklySchedule so the big planner draws the same run).
 */
import { Footprints, Mountain, Timer, TrendingUp, Zap } from 'lucide-react';

export const RUN_CATEGORY_COLORS: Record<string, string> = {
  easy_run:             '#4CAF50',
  long_run:             '#2E7D32',
  short_intervals:      '#E11D48',
  long_intervals:       '#0D9488',
  fartlek_easy:         '#CE93D8',
  fartlek_structured:   '#AB47BC',
  tempo:                '#9C27B0',
  hill_long:            '#FF7043',
  hill_short:           '#EF6C00',
  hill_sprints:         '#DC2626',
  strides:              '#00BAF7',
  recovery:             '#B0BEC5',
};

export function getRunCategoryColor(category: string | undefined | null): string {
  if (!category) return '#00BAF7';
  return RUN_CATEGORY_COLORS[category] ?? '#00BAF7';
}

export function getRunCategoryIcon(category: string | undefined | null, className: string) {
  switch (category) {
    case 'short_intervals':
    case 'long_intervals':
      return <Zap className={className} />;
    case 'tempo':
      return <Timer className={className} />;
    case 'long_run':
      return <TrendingUp className={className} />;
    case 'hill_long':
    case 'hill_short':
    case 'hill_sprints':
      return <Mountain className={className} />;
    default:
      return <Footprints className={className} />;
  }
}
