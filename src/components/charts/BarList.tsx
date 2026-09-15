'use client';

import { cx } from '@/components/ui/primitives';

export interface BarItem {
  label: string;
  value: number;
  /** Secondary text on the right, e.g. volume. */
  hint?: string;
  color?: string;
}

/**
 * Horizontal bars for muscle-group balance. A list, not a pie: the question is
 * "which groups are behind", which is a comparison of lengths.
 */
export function BarList({
  items,
  unit,
  className,
}: {
  items: BarItem[];
  unit?: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className={cx('flex flex-col gap-2.5', className)}>
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13.5px]">{item.label}</span>
            <span className="tnum shrink-0 text-[13.5px] font-semibold">
              {Math.round(item.value * 10) / 10}
              {unit ? <span className="ml-1 text-[11px] font-normal text-dim">{unit}</span> : null}
              {item.hint ? <span className="ml-2 text-[11px] font-normal text-dim">{item.hint}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface3">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color ?? 'var(--color-accent)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
