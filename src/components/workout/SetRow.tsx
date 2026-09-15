'use client';

import type { SessionSet } from '@/domain/types';
import { Badge, CheckIcon, cx } from '@/components/ui/primitives';
import { DIFFICULTY_META, formatRepRange, formatWeight, SET_TYPE_LABEL } from '@/engine/format';

/** One line in the set list: plan on the left, result on the right. */
export function SetRow({
  set,
  active,
  onSelect,
  onUndo,
}: {
  set: SessionSet;
  active?: boolean;
  onSelect?: () => void;
  onUndo?: () => void;
}) {
  const done = set.actual !== null;
  const special = set.setType !== 'normal';

  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-[var(--radius-tile)] border px-3 py-2.5 transition-colors',
        done
          ? 'border-accent/25 bg-accent/[0.07]'
          : active
            ? 'border-line-strong bg-surface2'
            : 'border-line bg-surface2/45',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <span
          className={cx(
            'tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold',
            done ? 'bg-accent text-accent-ink' : active ? 'bg-surface3 text-ink' : 'bg-surface3 text-dim',
          )}
        >
          {done ? <CheckIcon className="h-4 w-4" /> : set.setNumber}
        </span>

        <span className="min-w-0 flex-1">
          {done ? (
            <span className="tnum block text-[16px] font-semibold">
              {formatWeight(set.actual!.weight)} × {set.actual!.reps}
            </span>
          ) : (
            <span className="tnum block text-[16px] text-ink/85">
              {formatWeight(set.plan.weight)} × {formatRepRange(set.plan.repsMin, set.plan.repsMax)}
            </span>
          )}
          {special || set.note ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-dim">
              {set.note ?? SET_TYPE_LABEL[set.setType]}
            </span>
          ) : null}
        </span>

        {done && set.actual!.difficulty ? (
          <span className="shrink-0 text-[15px]" title={DIFFICULTY_META[set.actual!.difficulty].label}>
            {DIFFICULTY_META[set.actual!.difficulty].emoji}
          </span>
        ) : null}

        {!done && special ? (
          <Badge color={set.setType === 'top_set' ? 'var(--color-accent)' : 'var(--status-warning)'}>
            {SET_TYPE_LABEL[set.setType]}
          </Badge>
        ) : null}
      </button>

      {done && onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 px-1 text-[11px] font-semibold tracking-[0.08em] text-dim uppercase active:text-ink"
        >
          Отменить
        </button>
      ) : null}
    </div>
  );
}
