'use client';

import dynamic from 'next/dynamic';
import { EmptyState, Skeleton } from '@/components/ui/primitives';

export interface TrendPoint {
  label: string;
  value: number;
  date?: string;
}

/**
 * The chart, loaded only when one is actually on screen.
 *
 * The charting library weighs 358 KB — more than a third of everything the app
 * ships. Pulling it into the workout screens, which never draw a chart, made
 * every set slower to reach for no benefit.
 */
const Chart = dynamic(() => import('./LineTrendChart').then((m) => m.LineTrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[190px] w-full" />,
});

export function LineTrend({
  data,
  unit,
  height = 190,
  color = 'var(--color-accent)',
  emptyLabel = 'Нет данных',
  singleLabel,
}: {
  data: TrendPoint[];
  unit?: string;
  height?: number;
  color?: string;
  emptyLabel?: string;
  /**
   * Что сказать, когда точка в выбранном периоде ровно одна.
   *
   * По умолчанию «нужна ещё одна точка» — но это неправда, если замеры есть,
   * просто они вне периода: у владельца было два взвешивания, а график за
   * месяц требовал третье. Экран, который знает про переключатель периодов,
   * обязан сказать про него.
   */
  singleLabel?: string;
}) {
  // Deciding there is nothing to draw costs nothing, so it happens before the
  // library is fetched at all.
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState
          title="Пока нет данных"
          description={
            data.length === 1
              ? (singleLabel ?? 'Нужна ещё одна точка, чтобы показать динамику.')
              : emptyLabel
          }
        />
      </div>
    );
  }

  return <Chart data={data} unit={unit} height={height} color={color} emptyLabel={emptyLabel} />;
}
