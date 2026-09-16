'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ExercisePicker } from '@/components/programs/ExercisePicker';
import { ProgramExerciseEditor } from '@/components/programs/ProgramExerciseEditor';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import { BigStepper, Field, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  Chevron,
  Eyebrow,
  SectionTitle,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import { newId } from '@/domain/ids';
import type { CardioBlock, Exercise, Program, ProgramExercise, WorkoutDay } from '@/domain/types';
import {
  count,
  formatCardio,
  formatRepRange,
  formatWeight,
  WORDS,
} from '@/engine/format';
import { daySummary, useExerciseMap, useProgram } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * PROGRAM EDITOR — days, order, exercises, sets, rest, progression.
 *
 * Reordering uses explicit up/down controls rather than drag: on a phone, in a
 * gym, a mis-grab that silently reorders a program is worse than one more tap.
 */
export default function ProgramEditorPage() {
  return (
    <Suspense fallback={<Screen />}>
      <ProgramEditorRoute />
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
function ProgramEditorRoute() {
  const programId = useSearchParams().get('id');
  return <ProgramEditor key={programId ?? 'none'} />;
}

function ProgramEditor() {
  const programId = useSearchParams().get('id');
  const program = useProgram(programId);
  const mutateProgram = useStore((s) => s.mutateProgram);
  const library = useExerciseMap();

  const [dayIndex, setDayIndex] = useState(0);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(false);
  const [editingCardio, setEditingCardio] = useState<'warmup' | 'cooldown' | null>(null);

  const days = useMemo(
    () => (program ? [...program.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [program],
  );
  const day: WorkoutDay | null = days[Math.min(dayIndex, days.length - 1)] ?? null;

  if (!program) {
    return (
      <Screen>
        <ScreenHeader title="Программа" back="/programs" />
        <Card className="p-5 text-[14px] text-dim">Программа не найдена.</Card>
      </Screen>
    );
  }

  const update = (fn: (p: Program) => Program) => mutateProgram(program.id, fn);

  const updateDay = (dayId: string, fn: (d: WorkoutDay) => WorkoutDay) =>
    update((p) => ({ ...p, days: p.days.map((d) => (d.id === dayId ? fn(d) : d)) }));

  const moveDay = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= days.length) return;
    const reordered = [...days];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    update((p) => ({
      ...p,
      days: reordered.map((d, i) => ({ ...d, sortOrder: i, name: `DAY ${i + 1}` })),
    }));
    setDayIndex(target);
  };

  const addDay = () => {
    update((p) => ({
      ...p,
      days: [
        ...p.days,
        {
          id: newId('day'),
          name: `DAY ${p.days.length + 1}`,
          title: 'Новый день',
          sortOrder: p.days.length,
          exercises: [],
        },
      ],
    }));
    setDayIndex(days.length);
  };

  const removeDay = () => {
    if (!day) return;
    update((p) => ({
      ...p,
      days: p.days
        .filter((d) => d.id !== day.id)
        .map((d, i) => ({ ...d, sortOrder: i, name: `DAY ${i + 1}` })),
    }));
    setDayIndex(Math.max(0, dayIndex - 1));
    setConfirmRemoveDay(false);
  };

  const moveExercise = (index: number, direction: -1 | 1) => {
    if (!day) return;
    const ordered = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    updateDay(day.id, (d) => ({
      ...d,
      exercises: ordered.map((pe, i) => ({ ...pe, sortOrder: i })),
    }));
  };

  const addExercise = (exercise: Exercise, section: string) => {
    if (!day) return;
    updateDay(day.id, (d) => ({
      ...d,
      exercises: [
        ...d.exercises,
        {
          id: newId('pex'),
          exerciseId: exercise.id,
          sortOrder: d.exercises.length,
          section: section || '',
          instructions: [],
          restSeconds: 90,
          progression: { type: 'double', repTarget: 12, consecutiveSessions: 1 },
          personalSettings: [],
          isEnabled: true,
          sets: Array.from({ length: 4 }, (_, i) => ({
            id: newId('pset'),
            setNumber: i + 1,
            targetWeight: null,
            targetRepsMin: 10,
            targetRepsMax: 12,
            setType: 'normal' as const,
          })),
        },
      ],
    }));
  };

  const editingExercise = day?.exercises.find((pe) => pe.id === editingExerciseId) ?? null;
  const ordered = day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const summary = day ? daySummary(day) : null;

  return (
    <Screen>
      <ScreenHeader
        title={program.name}
        subtitle={
          program.status === 'active'
            ? 'Активная программа'
            : program.status === 'archived'
              ? 'В архиве'
              : 'Черновик'
        }
        back="/programs"
        right={
          <button
            type="button"
            onClick={() => setEditingMeta(true)}
            className="text-[12px] font-semibold tracking-[0.08em] text-dim uppercase active:text-ink"
          >
            Правка
          </button>
        }
      />

      {/* Day tabs */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5 pb-1">
          {days.map((d, index) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDayIndex(index)}
              className={cx(
                'rounded-xl border px-3.5 py-2 text-left whitespace-nowrap transition-colors',
                index === dayIndex
                  ? 'border-accent bg-accent/[0.08]'
                  : 'border-line bg-surface active:bg-surface2',
              )}
            >
              <span
                className={cx(
                  'block text-[10.5px] font-semibold tracking-[0.1em]',
                  index === dayIndex ? 'text-accent' : 'text-faint',
                )}
              >
                {d.name}
              </span>
              <span className="block max-w-[150px] truncate text-[13px]">{d.title}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={addDay}
            className="touch rounded-xl border border-dashed border-line-strong px-4 text-[13px] text-dim active:bg-surface2"
          >
            + день
          </button>
        </div>
      </div>

      {day ? (
        <>
          <Card className="mt-4 p-4">
            <Eyebrow>{day.name}</Eyebrow>
            <TextInput
              value={day.title}
              onChange={(e) => updateDay(day.id, (d) => ({ ...d, title: e.target.value }))}
              placeholder="Например: ГРУДЬ + ТРИЦЕПС"
              density="bare"
              className="mt-1.5 text-[19px] font-semibold tracking-tight"
            />
            <p className="tnum mt-1 text-[12px] text-dim">
              {count(summary!.exercises, WORDS.exercise)} · {count(summary!.sets, WORDS.set)}
            </p>

            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => moveDay(dayIndex, -1)} disabled={dayIndex === 0}>
                ↑ выше
              </Button>
              <Button
                size="sm"
                onClick={() => moveDay(dayIndex, 1)}
                disabled={dayIndex === days.length - 1}
              >
                ↓ ниже
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setConfirmRemoveDay(true)}
              >
                <TrashIcon />
              </Button>
            </div>
          </Card>

          {/*
            Разминка и заминка лежат у дня, а не у упражнения: на дорожке нет
            веса и повторений, а подъём и минуты у дня ног свои.
          */}
          <section className="mt-6">
            <SectionTitle>До и после</SectionTitle>
            <div className="mt-2 flex flex-col gap-2">
              {(['warmup', 'cooldown'] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setEditingCardio(slot)}
                  className="flex items-center gap-3 rounded-[var(--radius-tile)] border border-line bg-surface p-3.5 text-left active:bg-surface2"
                >
                  <div className="min-w-0 flex-1">
                    <Eyebrow>{slot === 'warmup' ? 'Разминка' : 'Заминка'}</Eyebrow>
                    <p className="tnum mt-0.5 text-[14.5px] font-semibold">
                      {day[slot] ? formatCardio(day[slot]!) : 'Нет'}
                    </p>
                    {day[slot]?.note ? (
                      <p className="truncate text-[12px] text-dim">{day[slot]!.note}</p>
                    ) : null}
                  </div>
                  <Chevron />
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle
              action={
                <button
                  type="button"
                  onClick={() => setAddingExercise(true)}
                  className="text-[12px] text-accent active:opacity-70"
                >
                  + упражнение
                </button>
              }
            >
              Упражнения
            </SectionTitle>

            {ordered.length ? (
              <ul className="mt-2 flex flex-col gap-2">
                {ordered.map((pe, index) => (
                  <li key={pe.id}>
                    <ExerciseRow
                      programExercise={pe}
                      exercise={library.get(pe.exerciseId) ?? null}
                      index={index}
                      first={index === 0}
                      last={index === ordered.length - 1}
                      showSection={index === 0 || ordered[index - 1].section !== pe.section}
                      onOpen={() => setEditingExerciseId(pe.id)}
                      onMove={(direction) => moveExercise(index, direction)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Card className="mt-2 p-5 text-center">
                <p className="text-[13.5px] text-dim">
                  В этом дне пока нет упражнений.
                </p>
                <Button
                  variant="primary"
                  size="md"
                  full
                  className="mt-3"
                  onClick={() => setAddingExercise(true)}
                >
                  ДОБАВИТЬ УПРАЖНЕНИЕ
                </Button>
              </Card>
            )}
          </section>
        </>
      ) : (
        <Card className="mt-4 p-5 text-center">
          <p className="text-[13.5px] text-dim">В программе нет дней.</p>
          <Button variant="primary" size="md" full className="mt-3" onClick={addDay}>
            ДОБАВИТЬ ДЕНЬ
          </Button>
        </Card>
      )}

      <ProgramExerciseEditor
        open={editingExercise !== null}
        onClose={() => setEditingExerciseId(null)}
        programExercise={editingExercise}
        exercise={editingExercise ? (library.get(editingExercise.exerciseId) ?? null) : null}
        onChange={(next) => {
          if (!day) return;
          updateDay(day.id, (d) => ({
            ...d,
            exercises: d.exercises.map((pe) => (pe.id === next.id ? next : pe)),
          }));
        }}
        onRemove={() => {
          if (!day || !editingExercise) return;
          updateDay(day.id, (d) => ({
            ...d,
            exercises: d.exercises
              .filter((pe) => pe.id !== editingExercise.id)
              .map((pe, i) => ({ ...pe, sortOrder: i })),
          }));
          setEditingExerciseId(null);
        }}
      />

      <ExercisePicker
        open={addingExercise}
        onClose={() => setAddingExercise(false)}
        onPick={addExercise}
        defaultSection=""
      />

      <Sheet open={editingMeta} onClose={() => setEditingMeta(false)} title="Программа">
        <div className="flex flex-col gap-4 pb-2">
          <Field label="Название">
            <TextInput
              value={program.name}
              onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field label="Описание">
            <TextArea
              value={program.description ?? ''}
              onChange={(e) => update((p) => ({ ...p, description: e.target.value }))}
              className="min-h-20"
            />
          </Field>
        </div>
      </Sheet>

      {day ? (
        <DayCardioSheet
          slot={editingCardio}
          block={editingCardio ? (day[editingCardio] ?? null) : null}
          onClose={() => setEditingCardio(null)}
          onSave={(block) => {
            const slot = editingCardio;
            if (!slot) return;
            updateDay(day.id, (d) => {
              const next = { ...d };
              if (block) next[slot] = block;
              else delete next[slot];
              return next;
            });
            setEditingCardio(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRemoveDay}
        title="Удалить день?"
        message="День и его упражнения будут удалены из программы. История тренировок не изменится."
        confirmLabel="Удалить"
        danger
        onConfirm={removeDay}
        onCancel={() => setConfirmRemoveDay(false)}
      />
    </Screen>
  );
}

/**
 * Правка разминки или заминки дня. Ноль подъёма — это значение, а не «не
 * задано», поэтому убрать блок можно только кнопкой, а не выставив нули.
 */
function DayCardioSheet({
  slot,
  block,
  onClose,
  onSave,
}: {
  slot: 'warmup' | 'cooldown' | null;
  block: CardioBlock | null;
  onClose: () => void;
  onSave: (block: CardioBlock | null) => void;
}) {
  const [minutes, setMinutes] = useState(10);
  const [incline, setIncline] = useState(0);

  // Пропсы читаются на открытие: шит живёт между открытиями, и без этого
  // «Заминка» показала бы значения «Разминки».
  useEffect(() => {
    if (!slot) return;
    setMinutes(block?.minutes ?? (slot === 'warmup' ? 10 : 5));
    setIncline(block?.incline ?? 0);
  }, [slot, block?.minutes, block?.incline]);

  return (
    <Sheet
      open={slot !== null}
      onClose={onClose}
      title={slot === 'cooldown' ? 'Заминка' : 'Разминка'}
    >
      <div className="flex flex-col gap-5">
        <BigStepper label="Минуты" value={minutes} unit="мин" step={1} min={1} max={120} onChange={setMinutes} />
        <BigStepper label="Подъём" value={incline} unit="%" step={1} min={0} max={20} onChange={setIncline} />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          full
          onClick={() => onSave({ minutes, incline, note: 'Ходьба на дорожке' })}
        >
          СОХРАНИТЬ
        </Button>
        {block ? (
          <Button size="md" variant="ghost" full onClick={() => onSave(null)}>
            УБРАТЬ ИЗ ДНЯ
          </Button>
        ) : null}
      </div>
      <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
        Меняется только план на будущее. Прошлые тренировки остаются как были.
      </p>
    </Sheet>
  );
}

function ExerciseRow({
  programExercise: pe,
  exercise,
  index,
  first,
  last,
  showSection,
  onOpen,
  onMove,
}: {
  programExercise: ProgramExercise;
  exercise: Exercise | null;
  index: number;
  first: boolean;
  last: boolean;
  showSection: boolean;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const working = pe.sets.filter((s) => s.setType !== 'warmup');
  const firstSet = working[0] ?? pe.sets[0];

  return (
    <>
      {showSection && pe.section ? (
        <p className="mt-3 mb-1.5 px-1 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
          {pe.section}
        </p>
      ) : null}

      <Card className={cx('overflow-hidden', !pe.isEnabled && 'opacity-55')}>
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-3.5 text-left active:bg-surface2">
          <span className="tnum w-5 shrink-0 text-[12px] text-faint">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="line-clamp-2 min-w-0 flex-1 text-[14.5px] leading-tight font-medium">
                {exercise?.name ?? 'Упражнение удалено'}
              </span>
              {!pe.isEnabled ? <Badge>Отключено</Badge> : null}
            </span>
            <span className="tnum mt-1 block text-[12px] text-dim">
              {firstSet
                ? `${formatWeight(firstSet.targetWeight)} кг × ${formatRepRange(
                    firstSet.targetRepsMin,
                    firstSet.targetRepsMax,
                  )} × ${working.length}`
                : 'нет подходов'}
              {pe.personalSettings.length
                ? ` · ${pe.personalSettings.map((s) => `${s.label}: ${s.value}`).join(', ')}`
                : ''}
            </span>
          </span>
          <Chevron />
        </button>

        <div className="flex divide-x divide-line border-t border-line">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            className="flex-1 py-2.5 text-[12px] text-dim disabled:opacity-30 active:bg-surface2"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            className="flex-1 py-2.5 text-[12px] text-dim disabled:opacity-30 active:bg-surface2"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="flex-[2] py-2.5 text-[12px] font-semibold tracking-[0.08em] text-dim uppercase active:bg-surface2"
          >
            Настроить
          </button>
        </div>
      </Card>
    </>
  );
}
