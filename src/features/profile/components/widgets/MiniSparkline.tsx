'use client';

import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface MiniSparklineProps {
  /** Raw numeric values — mapped onto the chart's Y axis in order */
  data: number[];
  /** Stroke and fill color (default: #00ADEF) */
  color?: string;
}

/**
 * A stripped-down sparkline chart with no axes, grid, tooltip, or animation.
 * Used inside GoalCard to give a glanceable trend indicator.
 */
export default function MiniSparkline({ data, color = '#00ADEF' }: MiniSparklineProps) {
  if (!data || data.length < 2) {
    // Render a flat placeholder line when there's not enough data to draw a curve
    return (
      <div
        style={{ width: '100%', minWidth: 0, height: 60 }}
        className="flex items-center justify-center"
        dir="ltr"
      >
        <div className="w-full h-px bg-gray-200 rounded-full" />
      </div>
    );
  }

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ width: '100%', minWidth: 0, height: 60 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`sparkGrad_${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#sparkGrad_${color.replace('#', '')})`}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
