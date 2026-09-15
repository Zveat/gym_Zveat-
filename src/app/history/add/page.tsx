'use client';

import { useMemo, useState } from 'react';
import { ExercisePicker } from '@/components/programs/ExercisePicker';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Field, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Button,
  Card,
  Eyebrow,
  LinkButton,
  Notice,
  SectionTitle,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import { newId, todayString } from '@/domain/ids';
import type { Exercise, SessionExercise, WorkoutSession } from '@/domain/types';
import { formatRepRange, formatWeight } from '@/engine/format';
import { buildSession } from '@/engine/session';
import { useActiveProgram, useExerciseMap } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * MANUAL IMPORT — one past workout, typed in after the fact.
 *
 * Picking a program day prefills the plan so the user only corrects the numbers
 * that differed, which is the difference between 30 seconds and 5 minutes per
 * workout when catching up on a month of notes.
 */
export default function AddHistoryPage() {
  const program = useActiveProgram();
  const settings = useStore((s) => s.settings);
  const exercisesLibrary = useExerciseMap();
  const addHistoricalSession = useStore((s) => s.addHistoricalSession);

  const days = useMemo(
    () => (program ? [...program.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [program],
  );

  const [date, setDate] = useState(todayString());
  const [dayId, setDayId] = useState(days[0]?.id ?? '');
  const [draft, setDraft] = useState<WorkoutSession | null>(null);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const buildDraft = () => {
    const day = days.find((d) => d.id === dayId);
    if (!program || !day) return;
    const session = buildSession({
      program,
      day,
      mode: 'normal',
      modeConfig: settings.modes.normal,
      exercises: [...exercisesLibrary.values()],
      date,
      startedAt: `${date}T12:00:00.000Z`,
      isImported: true,
    });
    // Prefill every set from the plan: the user only edits the exceptions.
    setDraft({
      ...session,
      exercises: session.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((set) => ({
          ...set,
          actual: {
            weight: set.plan.weight ?? 0,
            reps: set.plan.repsMax ?? set.plan.repsMin ?? 0,
            difficulty: null,
            rpe: null,
            rir: null,
            completedAt: `${date}T12:00:00.000Z`,
          },
        })),
      })),
    });
  };

  const patchSet = (exerciseId: string, setId: string, patch: { weight?: number; reps?: number }) => {
    setDraft((current) =>
      !current
        ? current
        : {
            ...current,
            exercises: current.exercises.map((ex) =>
              ex.id !== exerciseId
                ? ex
                : {
                    ...ex,
                    sets: ex.sets.map((set) =>
                      set.id !== setId || !set.actual
                        ? set
                        : { ...set, actual: { ...set.actual, ...patch } },
                    ),
                  },
            ),
          },
    );
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setDraft((current) =>
      !current
        ? current
        : {
            ...current,
            exercises: current.exercises.map((ex) =>
              ex.id !== exerciseId
                ? ex
                : {
                    ...ex,
                    sets: ex.sets
                      .filter((s) => s.id !== setId)
                      .map((s, i) => ({ ...s, setNumber: i + 1 })),
                  },
            ),
          },
    );
  };

  const addSet = (exerciseId: string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((ex) => {
          if (ex.id !== exerciseId) return ex;
          const last = ex.sets[ex.sets.length - 1];
          return {
            ...ex,
            sets: [
              ...ex.sets,
              {
                id: newId('sset'),
                setNumber: ex.sets.length + 1,
                setType: 'normal' as const,
                plan: last ? { ...last.plan } : { weight: null, repsMin: null, repsMax: null },
                actual: {
                  weight: last?.actual?.weight ?? 0,
                  reps: last?.actual?.reps ?? 10,
                  difficulty: null,
                  rpe: null,
                  rir: null,
                  completedAt: `${current.date}T12:00:00.000Z`,
                },
              },
            ],
          };
        }),
      };
    });
  };

  const addExercise = (exercise: Exercise) => {
    setDraft((current) => {
      if (!current) return current;
      const entry: SessionExercise = {
        id: newId('sex'),
        exerciseId: exercise.id,
        programExerciseId: null,
        name: exercise.name,
        primaryMuscle: exercise.primaryMuscle,
        section: '',
        sortOrder: current.exercises.length,
        restSeconds: settings.defaultRestSeconds,
        instructions: [],
        observations: [],
        status: 'done',
        sets: Array.from({ length: 3 }, (_, i) => ({
          id: newId('sset'),
          setNumber: i + 1,
          setType: 'normal' as const,
          plan: { weight: null, repsMin: null, repsMax: null },
          actual: {
            weight: 0,
            reps: 10,
            difficulty: null,
            rpe: null,
            rir: null,
            completedAt: `${current.date}T12:00:00.000Z`,
          },
        })),
      };
      return { ...current, exercises: [...current.exercises, entry] };
    });
  };

  const save = () => {
    if (!draft) return;
    // Drop rows the user zeroed out; a set with no reps never happened.
    const exercises = draft.exercises
      .map((ex) => ({
        ...ex,
        status: 'done' as const,
        sets: ex.sets
          .filter((s) => s.actual && s.actual.reps > 0)
          .map((s, i) => ({ ...s, setNumber: i + 1 })),
      }))
      .filter((ex) => ex.sets.length > 0);

    if (!exercises.length) return;

    const session: WorkoutSession = {
      ...draft,
      exercises,
      notes: notes.trim() || undefined,
      status: 'completed',
      completedAt: `${draft.date}T13:00:00.000Z`,
      durationSeconds: 0,
      isImported: true,
    };

    addHistoricalSession(session);
    setSaved(session.id);
  };

  if (saved) {
    return (
      <Screen>
        <ScreenHeader title="Тренировка внесена" back="/history" />
        <Notice tone="accent" title="✓ Сохранено">
          Тренировка добавлена в историю и уже учтена в прогрессе.
        </Notice>
        <div className="mt-5 flex flex-col gap-2">
          <LinkButton href={`/history/session?id=${saved}`} size="lg" full>
            ОТКРЫТЬ ТРЕНИРОВКУ
          </LinkButton>
          <Button
            variant="primary"
            size="lg"
            full
            onClick={() => {
              setSaved(null);
              setDraft(null);
            }}
          >
            ВНЕСТИ ЕЩЁ ОДНУ
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Внести тренировку"
        subtitle="Прошедшая тренировка задним числом"
        back="/history"
      />

      {!draft ? (
        <>
          <Card className="flex flex-col gap-4 p-4">
            <Field label="Дата">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>

            {days.length ? (
              <Field label="Тренировочный день" hint="План подставится автоматически">
                <div className="flex flex-col gap-2">
                  {days.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDayId(d.id)}
                      className={cx(
                        'flex items-center gap-3 rounded-[var(--radius-tile)] border px-3.5 py-2.5 text-left',
                        d.id === dayId
                          ? 'border-accent bg-accent/[0.07]'
                          : 'border-line bg-surface2 active:bg-surface3',
                      )}
                    >
                      <span className="text-[11.5px] font-semibold tracking-[0.1em] text-dim">
                        {d.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px]">{d.title}</span>
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <p className="text-[13px] text-dim">
                В активной программе нет дней — создайте программу или используйте массовый импорт.
              </p>
            )}
          </Card>

          <Button
            variant="primary"
            size="xl"
            full
            className="mt-6"
            onClick={buildDraft}
            disabled={!dayId}
          >
            ЗАПОЛНИТЬ ПОДХОДЫ
          </Button>

          <div className="mt-4">
            <Notice tone="info" title="Много тренировок сразу?">
              Вставьте свои заметки текстом или CSV — приложение разберёт их и покажет
              предпросмотр.
            </Notice>
            <LinkButton href="/more/import" size="md" full className="mt-2.5">
              МАССОВЫЙ ИМПОРТ
            </LinkButton>
          </div>
        </>
      ) : (
        <>
          <Card className="p-4">
            <Eyebrow>{draft.workoutDayName}</Eyebrow>
            <p className="mt-1 text-[17px] font-semibold">{draft.workoutDayTitle}</p>
            <p className="tnum mt-1 text-[12.5px] text-dim">{draft.date}</p>
            <Button size="sm" className="mt-3" onClick={() => setDraft(null)}>
              ИЗМЕНИТЬ ДАТУ / ДЕНЬ
            </Button>
          </Card>

          <section className="mt-5 flex flex-col gap-3">
            {draft.exercises.map((exercise) => (
              <Card key={exercise.id} className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
                    {exercise.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => addSet(exercise.id)}
                    className="shrink-0 text-[11px] font-semibold tracking-[0.08em] text-accent uppercase"
                  >
                    + подход
                  </button>
                </div>

                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {exercise.sets.map((set) => (
                    <li key={set.id} className="flex items-center gap-2">
                      <span className="tnum w-4 shrink-0 text-[11px] text-faint">
                        {set.setNumber}
                      </span>
                      <TextInput
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={set.actual?.weight ?? 0}
                        onChange={(e) =>
                          patchSet(exercise.id, set.id, {
                            weight: parseFloat(e.target.value) || 0,
                          })
                        }
                        density="compact"
                        className="tnum flex-1 text-center"
                        aria-label={`Вес, подход ${set.setNumber}`}
                      />
                      <span className="shrink-0 text-[13px] text-faint">×</span>
                      <span className="w-[72px] shrink-0">
                        <TextInput
                          type="number"
                          inputMode="numeric"
                          value={set.actual?.reps ?? 0}
                          onChange={(e) =>
                            patchSet(exercise.id, set.id, {
                              reps: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          density="compact"
                          className="tnum text-center"
                          aria-label={`Повторения, подход ${set.setNumber}`}
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSet(exercise.id, set.id)}
                        aria-label="Удалить подход"
                        className="flex h-10 w-8 shrink-0 items-center justify-center text-dim active:text-pain"
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>

                {exercise.sets[0] ? (
                  <p className="tnum mt-2 text-[11px] text-faint">
                    План: {formatWeight(exercise.sets[0].plan.weight)} kg ×{' '}
                    {formatRepRange(exercise.sets[0].plan.repsMin, exercise.sets[0].plan.repsMax)}
                  </p>
                ) : null}
              </Card>
            ))}
          </section>

          <Button size="md" full className="mt-4" onClick={() => setAdding(true)}>
            + ДОБАВИТЬ УПРАЖНЕНИЕ
          </Button>

          <div className="mt-5">
            <SectionTitle>Заметка</SectionTitle>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно"
              className="mt-2 min-h-20"
            />
          </div>

          <Button variant="primary" size="xl" full className="mt-6" onClick={save}>
            СОХРАНИТЬ В ИСТОРИЮ
          </Button>
          <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-dim">
            Подходы с нулевыми повторениями не сохранятся.
          </p>

          <ExercisePicker
            open={adding}
            onClose={() => setAdding(false)}
            onPick={(exercise) => addExercise(exercise)}
          />
        </>
      )}
    </Screen>
  );
}
