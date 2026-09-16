'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExerciseListCard } from '@/components/workout/ExerciseListCard';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import { TextArea } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  ProgressBar,
} from '@/components/ui/primitives';
import { MODE_COLOR } from '@/domain/modes';
import { formatClock, formatVolume, MODE_LABEL, MUSCLE_LABEL } from '@/engine/format';
import { currentExerciseId, sessionProgress } from '@/engine/session';
import { sessionVolume } from '@/engine/volume';
import { useTicker } from '@/hooks/useTicker';
import { useActiveSession } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * ACTIVE WORKOUT — the map of the session. One tap per exercise, current one
 * marked, progress always visible. The bottom nav is hidden here on purpose.
 */
export default function ActiveWorkoutPage() {
  const router = useRouter();
  const session = useActiveSession();
  const exercises = useStore((s) => s.exercises);
  const addExercise = useStore((s) => s.addExerciseToWorkout);
  const setSessionNotes = useStore((s) => s.setSessionNotes);
  const finishWorkout = useStore((s) => s.finishWorkout);
  const discardWorkout = useStore((s) => s.discardWorkout);

  const now = useTicker(session !== null);
  const [showFinish, setShowFinish] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const progress = useMemo(() => (session ? sessionProgress(session) : null), [session]);
  const currentId = useMemo(() => (session ? currentExerciseId(session) : null), [session]);

  /**
   * §36: подводим к текущему упражнению само.
   *
   * После автоперехода и после возврата из упражнения нужное может оказаться
   * ниже сгиба — в списке из семи упражнений это лишняя прокрутка ровно в тот
   * момент, когда человек стоит у тренажёра. `nearest` вместо `center`: рывок
   * экрана в зале раздражает сильнее, чем пара сантиметров недоводки.
   */
  const currentRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentId]);

  if (!session || !progress) {
    return (
      <div
        className="mx-auto w-full max-w-lg px-4"
        style={{ paddingTop: 'calc(var(--safe-top) + 32px)' }}
      >
        <Card className="p-6 text-center">
          <p className="text-[15px] font-semibold">Активной тренировки нет</p>
          <p className="mt-2 text-[13px] text-dim">Запустите тренировку с главного экрана.</p>
          <Button variant="primary" size="lg" full className="mt-5" onClick={() => router.replace('/')}>
            НА ГЛАВНУЮ
          </Button>
        </Card>
      </div>
    );
  }

  const elapsed = Math.max(0, Math.floor((now - new Date(session.startedAt).getTime()) / 1000));
  const finish = () => {
    const id = finishWorkout();
    router.replace(id ? `/workout/review?id=${id}` : '/');
  };

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-line bg-bg/92 backdrop-blur-xl"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Link
            href="/"
            aria-label="На главную"
            className="touch -ml-2 flex items-center justify-center rounded-full text-dim active:bg-surface2"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="m13 5-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="eyebrow">{session.workoutDayName}</span>
              <Badge color={MODE_COLOR[session.mode]}>{MODE_LABEL[session.mode]}</Badge>
            </div>
            <p className="truncate text-[15px] leading-tight font-semibold">
              {session.workoutDayTitle}
            </p>
          </div>

          <span className="tnum shrink-0 text-[17px] font-semibold tracking-tight">
            {formatClock(elapsed)}
          </span>
        </div>

        <div className="mx-auto max-w-lg px-4 pb-3">
          <div className="tnum flex items-baseline justify-between text-[11.5px] text-dim">
            <span>
              {progress.completedSets} / {progress.totalSets} подходов · упражнений{' '}
              {progress.completedExercises} из {progress.totalExercises}
            </span>
            <span>{formatVolume(sessionVolume(session))} кг</span>
          </div>
          <ProgressBar value={progress.ratio} className="mt-1.5" />
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-lg px-4 pt-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 108px)' }}
      >
        <ul className="flex flex-col gap-2.5">
          {session.exercises.map((exercise, index) => (
            <li key={exercise.id} ref={exercise.id === currentId ? currentRef : undefined}>
              <ExerciseListCard
                exercise={exercise}
                index={index}
                current={exercise.id === currentId}
                href={`/workout/exercise?id=${exercise.id}`}
              />
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Button size="md" full onClick={() => setShowAdd(true)}>
            + ДОБАВИТЬ УПРАЖНЕНИЕ
          </Button>
          <Button size="md" full variant="ghost" onClick={() => setShowNotes(true)}>
            {session.notes ? 'ЗАМЕТКА К ТРЕНИРОВКЕ ✓' : 'ЗАМЕТКА К ТРЕНИРОВКЕ'}
          </Button>
          <Button size="md" full variant="ghost" onClick={() => setShowDiscard(true)}>
            ОТМЕНИТЬ ТРЕНИРОВКУ
          </Button>
        </div>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/94 px-4 pt-3 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}
      >
        <div className="mx-auto max-w-lg">
          <Button variant="primary" size="xl" full onClick={() => setShowFinish(true)}>
            ЗАВЕРШИТЬ ТРЕНИРОВКУ
          </Button>
        </div>
      </div>

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Добавить упражнение">
        <ul className="flex flex-col gap-1.5 pb-2">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => {
                  addExercise(exercise.id);
                  setShowAdd(false);
                }}
                className="flex w-full items-center gap-3 rounded-[var(--radius-tile)] bg-surface2 px-3.5 py-3 text-left active:bg-surface3"
              >
                <span className="min-w-0 flex-1 truncate text-[14.5px]">{exercise.name}</span>
                <span className="shrink-0 text-[11px] text-dim">
                  {MUSCLE_LABEL[exercise.primaryMuscle]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet
        open={showNotes}
        onClose={() => setShowNotes(false)}
        title="Заметка к тренировке"
        subtitle="Останется в истории этой тренировки"
      >
        <TextArea
          value={session.notes ?? ''}
          onChange={(e) => setSessionNotes(e.target.value)}
          placeholder="Например: сегодня почувствовал левое плечо."
          className="min-h-32"
        />
      </Sheet>

      <ConfirmDialog
        open={showFinish}
        title="Завершить тренировку?"
        message={
          <>
            Выполнено {progress.completedSets} из {progress.totalSets} подходов. Незаполненные
            подходы не попадут в историю.
          </>
        }
        confirmLabel="Завершить"
        onConfirm={finish}
        onCancel={() => setShowFinish(false)}
      />

      <ConfirmDialog
        open={showDiscard}
        title="Отменить тренировку?"
        message="Все подходы этой тренировки будут удалены. Это нельзя отменить."
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          discardWorkout();
          router.replace('/');
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </>
  );
}
