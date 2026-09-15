'use client';

import type { Difficulty } from '@/domain/types';
import { cx } from '@/components/ui/primitives';
import { DIFFICULTY_META } from '@/engine/format';

const ORDER: Difficulty[] = ['easy', 'good', 'hard', 'failure'];

/**
 * How hard was that? Plain language, one tap, optional.
 * RPE/RIR are derived from it for analytics — the user never sees the jargon.
 */
export function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty | null;
  onChange: (value: Difficulty | null) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {ORDER.map((key) => {
        const meta = DIFFICULTY_META[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : key)}
            className={cx(
              'flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[var(--radius-tile)] border transition-colors',
              active
                ? 'border-accent bg-accent/12'
                : 'border-line bg-surface2 active:bg-surface3',
            )}
          >
            <span className="text-[19px] leading-none">{meta.emoji}</span>
            <span
              className={cx(
                'text-[10px] font-semibold tracking-[0.06em]',
                active ? 'text-accent' : 'text-dim',
              )}
            >
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
