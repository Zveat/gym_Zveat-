'use client';

import { Sheet } from '@/components/ui/Sheet';
import { Button, cx } from '@/components/ui/primitives';
import { formatClock } from '@/engine/format';
import { workoutElapsedSeconds } from '@/engine/session';
import { useTicker } from '@/hooks/useTicker';
import { useStore } from '@/store/useStore';
import type { WorkoutSession } from '@/domain/types';

/**
 * Часы тренировки отдельным компонентом — ради перерисовок, а не порядка.
 *
 * `useTicker` меняет состояние раз в секунду. Пока он стоял в компоненте
 * экрана тренировки, каждую секунду перерисовывался весь экран: шапка, полоса
 * прогресса и все карточки упражнений — семь штук на день ног. Меняется при
 * этом ровно одна строка с временем. Теперь тикает только она.
 */
export function WorkoutClockButton({
  session,
  onOpen,
}: {
  session: WorkoutSession;
  onOpen: () => void;
}) {
  const now = useTicker(true);
  const paused = Boolean(session.clockPausedAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Часы тренировки"
      className={cx(
        'tnum touch shrink-0 rounded-xl px-2 text-[17px] font-semibold tracking-tight active:bg-surface2',
        paused && 'text-warn',
      )}
    >
      {formatClock(workoutElapsedSeconds(session, now))}
      {paused ? <span className="ml-1 text-[11px]">пауза</span> : null}
    </button>
  );
}

/**
 * Управление часами. Свой тикер, включённый только пока шит открыт: закрытый
 * шит не должен стоить ни одной перерисовки в секунду.
 */
export function WorkoutClockSheet({
  session,
  open,
  onClose,
  onFinish,
}: {
  session: WorkoutSession;
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const now = useTicker(open);
  const pauseWorkoutClock = useStore((s) => s.pauseWorkoutClock);
  const resumeWorkoutClock = useStore((s) => s.resumeWorkoutClock);
  const resetWorkoutClock = useStore((s) => s.resetWorkoutClock);

  const paused = Boolean(session.clockPausedAt);

  return (
    <Sheet open={open} onClose={onClose} title="Часы тренировки">
      <p className="tnum text-center text-[44px] leading-none font-semibold tracking-[-0.03em]">
        {formatClock(workoutElapsedSeconds(session, now))}
      </p>
      <p className="mt-1.5 text-center text-[12.5px] text-dim">
        {paused ? 'Часы на паузе. Подходы сохраняются как обычно.' : 'Часы идут.'}
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {paused ? (
          <Button
            variant="primary"
            size="lg"
            full
            onClick={() => {
              resumeWorkoutClock();
              onClose();
            }}
          >
            ПРОДОЛЖИТЬ
          </Button>
        ) : (
          <Button
            size="lg"
            full
            onClick={() => {
              pauseWorkoutClock();
              onClose();
            }}
          >
            ПАУЗА
          </Button>
        )}
        <Button
          size="md"
          variant="ghost"
          full
          onClick={() => {
            resetWorkoutClock();
            onClose();
          }}
        >
          ОБНУЛИТЬ ЧАСЫ
        </Button>
        <Button size="md" variant="danger" full onClick={onFinish}>
          ЗАВЕРШИТЬ ТРЕНИРОВКУ
        </Button>
      </div>
      <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
        «Обнулить» трогает только секундомер — подходы, веса и история остаются на месте.
      </p>
    </Sheet>
  );
}
