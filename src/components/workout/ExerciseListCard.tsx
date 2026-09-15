'use client';

import Link from 'next/link';
import type { SessionExercise } from '@/domain/types';
import { Badge, Chevron, ProgressBar, cx } from '@/components/ui/primitives';
import { MUSCLE_LABEL, formatWeight } from '@/engine/format';

/** A row in the live workout's exercise list. */
export function ExerciseListCard({
  exercise,
  index,
  current,
  href,
}: {
  exercise: SessionExercise;
  index: number;
  current: boolean;
  href: string;
}) {
  const done = exercise.sets.filter((s) => s.actual).length;
  const total = exercise.sets.length;
  const skipped = exercise.status === 'skipped';
  const complete = exercise.status === 'done';
  const planned = exercise.sets[0]?.plan.weight ?? null;

  return (
    <Link
      href={href}
      className={cx(
        'flex items-center gap-3.5 rounded-[var(--radius-card)] border px-4 py-3.5 transition-colors',
        current
          ? 'border-accent/45 bg-accent/[0.06]'
          : complete
            ? 'border-line bg-surface/60'
            : 'border-line bg-surface active:bg-surface2',
        skipped && 'opacity-45',
      )}
    >
      <span
        className={cx(
          'tnum flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold',
          complete
            ? 'bg-accent/15 text-accent'
            : current
              ? 'bg-accent text-accent-ink'
              : 'bg-surface3 text-dim',
        )}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] leading-snug font-medium">
            {exercise.name}
          </span>
          {current ? <Badge color="var(--color-accent)">Сейчас</Badge> : null}
          {skipped ? <Badge>Пропущено</Badge> : null}
        </span>

        <span className="mt-1 flex items-center gap-2 text-[12px] text-dim">
          <span>{MUSCLE_LABEL[exercise.primaryMuscle]}</span>
          <span className="text-faint">·</span>
          <span className="tnum">
            {done}/{total} подх.
          </span>
          {planned !== null ? (
            <>
              <span className="text-faint">·</span>
              <span className="tnum">{formatWeight(planned)} кг</span>
            </>
          ) : null}
        </span>

        {total > 0 && !skipped ? (
          <ProgressBar
            value={done / total}
            tone={complete ? 'progress' : 'accent'}
            className="mt-2 h-1"
          />
        ) : null}
      </span>

      <Chevron />
    </Link>
  );
}
