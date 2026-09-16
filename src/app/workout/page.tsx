'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardioCard } from '@/components/workout/CardioCard';
import { ExerciseListCard } from '@/components/workout/ExerciseListCard';
import { WorkoutClockButton, WorkoutClockSheet } from '@/components/workout/WorkoutClock';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import { TextArea } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  ProgressBar,
  cx,
} from '@/components/ui/primitives';
import { MODE_COLOR, MODE_ORDER } from '@/domain/modes';
import { formatVolume, MODE_LABEL, MUSCLE_LABEL } from '@/engine/format';
import { currentExerciseId, sessionProgress } from '@/engine/session';
import { sessionVolume } from '@/engine/volume';
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
  const changeWorkoutMode = useStore((s) => s.changeWorkoutMode);
  const settings = useStore((s) => s.settings);
  const discardWorkout = useStore((s) => s.discardWorkout);
  const logCardio = useStore((s) => s.logCardio);
  const undoCardio = useStore((s) => s.undoCardio);

  const [showFinish, setShowFinish] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const [showMode, setShowMode] = useState(false);

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
              {/* §58: режим виден всегда, тап открывает выбор. */}
              <button
                type="button"
                onClick={() => setShowMode(true)}
                aria-label="Режим тренировки"
                className="rounded-full active:opacity-60"
              >
                <Badge color={MODE_COLOR[session.mode]}>{MODE_LABEL[session.mode]}</Badge>
              </button>
            </div>
            <p className="truncate text-[15px] leading-tight font-semibold">
              {session.workoutDayTitle}
            </p>
          </div>

          <WorkoutClockButton session={session} onOpen={() => setShowClock(true)} />
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
        {/*
          Разминка стоит ДО списка, заминка — ПОСЛЕ: порядок на экране совпадает
          с порядком в зале, иначе карточку приходится искать.
        */}
        {session.warmup ? (
          <div className="mb-2.5">
            <CardioCard
              slot="warmup"
              block={session.warmup}
              onDone={(input) => logCardio(session.id, 'warmup', input)}
              onUndo={() => undoCardio(session.id, 'warmup')}
            />
          </div>
        ) : null}

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

        {session.cooldown ? (
          <div className="mt-2.5">
            <CardioCard
              slot="cooldown"
              block={session.cooldown}
              onDone={(input) => logCardio(session.id, 'cooldown', input)}
              onUndo={() => undoCardio(session.id, 'cooldown')}
            />
          </div>
        ) : null}

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

      {/*
        §58: смена режима на ходу. Пересчитывается план только у подходов,
        которых ещё не было — выполненные это запись о том, что человек реально
        поднял, и режим её не переписывает.
      */}
      <Sheet open={showMode} onClose={() => setShowMode(false)} title="Режим тренировки">
        <div className="flex flex-col gap-2">
          {MODE_ORDER.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (mode !== session.mode) changeWorkoutMode(mode);
                setShowMode(false);
              }}
              className={cx(
                'rounded-[var(--radius-tile)] border p-3.5 text-left active:bg-surface2',
                mode === session.mode ? 'border-line-strong bg-surface2' : 'border-line bg-surface',
              )}
            >
              <span
                className="text-[10.5px] font-semibold tracking-[0.12em] uppercase"
                style={{ color: MODE_COLOR[mode] }}
              >
                {MODE_LABEL[mode]}
              </span>
              <span className="mt-0.5 block text-[13px] text-dim">
                {settings.modes[mode].description}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
          Пересчитается план только у подходов, которых ещё не было. Уже записанные останутся
          как есть.
        </p>
      </Sheet>

      {/* Управление часами: маленький шит, а не отдельный экран (§Таймер). */}
      <WorkoutClockSheet
        session={session}
        open={showClock}
        onClose={() => setShowClock(false)}
        onFinish={() => {
          setShowClock(false);
          setShowFinish(true);
        }}
      />

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
