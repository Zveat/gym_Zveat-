'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { OBSERVATION_LABEL } from '@/components/workout/ExerciseDetailsSheet';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import { Field, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  SectionTitle,
  Stat,
  cx,
} from '@/components/ui/primitives';
import { MODE_COLOR } from '@/domain/modes';
import type { SessionExercise, WorkoutSession } from '@/domain/types';
import {
  count,
  DIFFICULTY_META,
  formatDateShort,
  formatCardio,
  formatDuration,
  formatVolume,
  formatWeight,
  MODE_LABEL,
  MUSCLE_LABEL,
  WORDS,
} from '@/engine/format';
import { sessionPRCount } from '@/engine/records';
import { exerciseVolume, sessionVolume, sessionWorkingSetCount } from '@/engine/volume';
import { useStore } from '@/store/useStore';

/**
 * WORKOUT SUMMARY — the full record of one workout, and the only place it can
 * be corrected. Editing here rewrites history deliberately (product rule 4:
 * the user can change anything), and never touches the program.
 */
export default function SessionPage() {
  return (
    <Suspense fallback={<Screen />}>
      <SessionDetailRoute />
    </Suspense>
  );
}

/**
 * Состояние экрана принадлежит записи, а не маршруту.
 *
 * Переход на другой `?id=` внутри того же маршрута оставляет компонент
 * смонтированным, и всё локальное состояние переезжает на новую запись. На
 * экране упражнения это выглядело как «Все подходы выполнены» при 0/4:
 * выбранный подход был из предыдущего упражнения. `key` заставляет React
 * смонтировать экран заново.
 */
function SessionDetailRoute() {
  const id = useSearchParams().get('id');
  return <SessionDetail key={id ?? 'none'} />;
}

function SessionDetail() {
  const router = useRouter();
  const id = useSearchParams().get('id');
  const sessions = useStore((s) => s.sessions);
  const updateSession = useStore((s) => s.updateSession);
  const deleteSession = useStore((s) => s.deleteSession);

  const session = sessions.find((s) => s.id === id) ?? null;
  const prCount = useMemo(
    () => (session ? sessionPRCount(sessions, session) : 0),
    [sessions, session],
  );

  const [editing, setEditing] = useState<{ exerciseId: string; setId: string } | null>(null);
  const [draftWeight, setDraftWeight] = useState('');
  const [draftReps, setDraftReps] = useState('');
  const [editNotes, setEditNotes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!session) {
    return (
      <Screen>
        <ScreenHeader title="Тренировка" back="/history" />
        <Card className="p-5 text-[14px] text-dim">Тренировка не найдена.</Card>
      </Screen>
    );
  }

  const openEdit = (exerciseId: string, setId: string) => {
    const set = session.exercises
      .find((e) => e.id === exerciseId)
      ?.sets.find((s) => s.id === setId);
    if (!set?.actual) return;
    setDraftWeight(String(set.actual.weight));
    setDraftReps(String(set.actual.reps));
    setEditing({ exerciseId, setId });
  };

  const commitEdit = () => {
    if (!editing) return;
    const weight = parseFloat(draftWeight.replace(',', '.'));
    const reps = parseInt(draftReps, 10);
    if (Number.isFinite(weight) && Number.isFinite(reps) && reps > 0) {
      updateSession(session.id, (s) => ({
        ...s,
        exercises: s.exercises.map((ex) =>
          ex.id !== editing.exerciseId
            ? ex
            : {
                ...ex,
                sets: ex.sets.map((set) =>
                  set.id !== editing.setId || !set.actual
                    ? set
                    : { ...set, actual: { ...set.actual, weight, reps } },
                ),
              },
        ),
      }));
    }
    setEditing(null);
  };

  const deleteSet = () => {
    if (!editing) return;
    updateSession(session.id, (s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id !== editing.exerciseId
          ? ex
          : {
              ...ex,
              sets: ex.sets
                .filter((set) => set.id !== editing.setId)
                .map((set, i) => ({ ...set, setNumber: i + 1 })),
            },
      ),
    }));
    setEditing(null);
  };

  const performed = session.exercises.filter((ex) => ex.sets.some((s) => s.actual));
  const skipped = session.exercises.filter((ex) => !ex.sets.some((s) => s.actual));

  return (
    <Screen>
      <ScreenHeader
        title={session.workoutDayTitle || session.programName}
        subtitle={`${session.workoutDayName} · ${formatDateShort(session.date)}`}
        back="/history"
        right={
          <Badge color={MODE_COLOR[session.mode]}>{MODE_LABEL[session.mode]}</Badge>
        }
      />

      <Card className="grid grid-cols-2 gap-y-5 p-5">
        <Stat
          label="Длительность"
          value={session.durationSeconds ? formatDuration(session.durationSeconds) : '—'}
        />
        <Stat label="Рабочих подходов" value={sessionWorkingSetCount(session)} />
        <Stat label="Объём" value={formatVolume(sessionVolume(session))} unit="кг" />
        <Stat label="Новых рекордов" value={prCount} tone={prCount ? 'accent' : 'default'} />
      </Card>

      {session.isImported ? (
        <p className="mt-3 px-1 text-[12px] text-dim">
          Тренировка внесена вручную (импорт). Длительность не записана.
        </p>
      ) : null}

      {/* Факт, а не план: в истории показываем только то, что реально сделано. */}
      {session.warmup?.actual || session.cooldown?.actual ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Кардио</Eyebrow>
          <div className="mt-1.5 flex flex-col gap-1">
            {session.warmup?.actual ? (
              <p className="tnum text-[13.5px]">
                <span className="text-dim">Разминка · </span>
                {formatCardio(session.warmup.actual)}
              </p>
            ) : null}
            {session.cooldown?.actual ? (
              <p className="tnum text-[13.5px]">
                <span className="text-dim">Заминка · </span>
                {formatCardio(session.cooldown.actual)}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {session.checkIn ? <CheckInCard checkIn={session.checkIn} /> : null}

      {session.notes ? (
        <Card className="mt-4 p-4">
          <Eyebrow>Заметка</Eyebrow>
          <p className="mt-1.5 text-[14px] leading-relaxed">{session.notes}</p>
        </Card>
      ) : null}

      <section className="mt-6">
        <SectionTitle>Упражнения</SectionTitle>
        <ul className="mt-2 flex flex-col gap-2.5">
          {performed.map((exercise) => (
            <li key={exercise.id}>
              <ExerciseSummary
                exercise={exercise}
                onEditSet={(setId) => openEdit(exercise.id, setId)}
              />
            </li>
          ))}
        </ul>

        {skipped.length ? (
          <div className="mt-4">
            <Eyebrow className="px-1">Пропущено</Eyebrow>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {skipped.map((exercise) => (
                <li
                  key={exercise.id}
                  className="rounded-[var(--radius-tile)] border border-line bg-surface/50 px-3.5 py-2.5 text-[13.5px] text-dim"
                >
                  {exercise.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="mt-7 flex flex-col gap-2">
        <Button size="md" full onClick={() => setEditNotes(true)}>
          {session.notes ? 'ИЗМЕНИТЬ ЗАМЕТКУ' : 'ДОБАВИТЬ ЗАМЕТКУ'}
        </Button>
        <Button size="md" full variant="danger" onClick={() => setConfirmDelete(true)}>
          УДАЛИТЬ ТРЕНИРОВКУ
        </Button>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Исправить подход"
        subtitle="Меняется только эта тренировка"
        footer={
          <div className="flex gap-2">
            <Button variant="danger" size="lg" className="flex-1" onClick={deleteSet}>
              УДАЛИТЬ
            </Button>
            <Button variant="primary" size="lg" className="flex-[2]" onClick={commitEdit}>
              СОХРАНИТЬ
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 py-2">
          <Field label="Вес, кг">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.5"
              value={draftWeight}
              onChange={(e) => setDraftWeight(e.target.value)}
              className="tnum text-center text-[22px]"
            />
          </Field>
          <Field label="Повторения">
            <TextInput
              type="number"
              inputMode="numeric"
              value={draftReps}
              onChange={(e) => setDraftReps(e.target.value)}
              className="tnum text-center text-[22px]"
            />
          </Field>
        </div>
      </Sheet>

      <Sheet open={editNotes} onClose={() => setEditNotes(false)} title="Заметка к тренировке">
        <TextArea
          value={session.notes ?? ''}
          onChange={(e) => updateSession(session.id, (s) => ({ ...s, notes: e.target.value }))}
          className="min-h-28"
        />
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить тренировку?"
        message="Тренировка исчезнет из истории и из статистики. Это нельзя отменить."
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          deleteSession(session.id);
          router.replace('/history');
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

function ExerciseSummary({
  exercise,
  onEditSet,
}: {
  exercise: SessionExercise;
  onEditSet: (setId: string) => void;
}) {
  const done = exercise.sets.filter((s) => s.actual);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{exercise.name}</p>
          <p className="mt-0.5 text-[11px] text-faint uppercase">
            {MUSCLE_LABEL[exercise.primaryMuscle]}
          </p>
        </div>
        <Link
          href={`/progress/exercise?id=${exercise.exerciseId}`}
          className="shrink-0 text-[11px] font-semibold tracking-[0.08em] text-dim uppercase active:text-ink"
        >
          Динамика
        </Link>
      </div>

      <ul className="tnum mt-2.5 flex flex-col gap-1">
        {done.map((set) => (
          <li key={set.id}>
            <button
              type="button"
              onClick={() => onEditSet(set.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left active:bg-surface2"
            >
              <span className="w-4 text-[11px] text-faint">{set.setNumber}</span>
              <span className="text-[15px]">
                {formatWeight(set.actual!.weight)} × {set.actual!.reps}
              </span>
              {set.actual!.difficulty ? (
                <span className="text-[13px]">{DIFFICULTY_META[set.actual!.difficulty].emoji}</span>
              ) : null}
              {set.setType !== 'normal' ? (
                <span className="text-[10.5px] text-faint uppercase">
                  {set.setType.replace('_', ' ')}
                </span>
              ) : null}
              <span className="tnum ml-auto text-[11.5px] text-faint">
                {formatVolume(set.actual!.weight * set.actual!.reps)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="tnum mt-2 border-t border-line pt-2 text-[11.5px] text-dim">
        {count(done.length, WORDS.set)} · {formatVolume(exerciseVolume(exercise))} кг
      </p>

      {exercise.note ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-dim">{exercise.note}</p>
      ) : null}

      {exercise.observations.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {exercise.observations.map((tag) => (
            <Badge key={tag} color={tag === 'pain' ? 'var(--status-pain)' : undefined}>
              {OBSERVATION_LABEL[tag]}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CheckInCard({ checkIn }: { checkIn: NonNullable<WorkoutSession['checkIn']> }) {
  const rows: [string, number | undefined][] = [
    ['Сон', checkIn.sleep],
    ['Энергия', checkIn.energy],
    ['Усталость', checkIn.fatigue],
    ['Восстановление', checkIn.recovery],
  ];
  const filled = rows.filter(([, v]) => v !== undefined);
  if (!filled.length) return null;

  return (
    <Card className="mt-4 p-4">
      <Eyebrow>Самочувствие</Eyebrow>
      <ul className="mt-2 flex flex-col gap-1.5">
        {filled.map(([label, value]) => (
          <li key={label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-[13px] text-dim">{label}</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={cx(
                    'h-2 w-5 rounded-full',
                    n <= (value ?? 0) ? 'bg-accent' : 'bg-surface3',
                  )}
                />
              ))}
            </span>
            <span className="tnum ml-auto text-[13px]">{value}/5</span>
          </li>
        ))}
      </ul>
      {checkIn.note ? <p className="mt-2 text-[12.5px] text-dim">{checkIn.note}</p> : null}
    </Card>
  );
}
