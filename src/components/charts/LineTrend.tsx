'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui/primitives';

export interface TrendPoint {
  label: string;
  value: number;
  date?: string;
}

/**
 * The app's one chart shape: a single series, a soft fill, no chrome. Deliberately
 * plain — on a phone, a chart earns its place by showing direction at a glance.
 */
export function LineTrend({
  data,
  unit,
  height = 190,
  color = 'var(--color-accent)',
  emptyLabel = 'Нет данных',
}: {
  data: TrendPoint[];
  unit?: string;
  height?: number;
  color?: string;
  emptyLabel?: string;
}) {
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState
          title="Пока нет данных"
          description={
            data.length === 1
              ? 'Нужна ещё одна точка, чтобы показать динамику.'
              : emptyLabel
          }
        />
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.18, max * 0.04, 1);

  return (
    <div style={{ height }} className="-mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-faint)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            domain={[Math.max(0, min - pad), max + pad]}
            tick={{ fill: 'var(--color-faint)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.18)' }}
            contentStyle={{
              background: 'var(--color-surface3)',
              border: '1px solid var(--color-line-strong)',
              borderRadius: 12,
              fontSize: 12,
              color: 'var(--color-ink)',
            }}
            labelStyle={{ color: 'var(--color-dim)', fontSize: 11 }}
            formatter={(value) => [`${value}${unit ? ` ${unit}` : ''}`, '']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill="url(#trendFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.2}
            dot={{ r: 2.6, fill: color, stroke: 'none' }}
            activeDot={{ r: 4.5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
