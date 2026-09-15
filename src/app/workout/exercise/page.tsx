'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { DifficultyPicker } from '@/components/workout/DifficultyPicker';
import {
  ExerciseDetailsSheet,
  OBSERVATION_LABEL,
  type DetailTab,
} from '@/components/workout/ExerciseDetailsSheet';
import { SetRow } from '@/components/workout/SetRow';
import { Screen } from '@/components/layout/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { BigStepper, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  Chip,
  Eyebrow,
  Notice,
  cx,
} from '@/components/ui/primitives';
import type { Difficulty, ObservationTag, SessionSet } from '@/domain/types';
import { formatDateShort, formatRepRange, formatWeight, MUSCLE_LABEL } from '@/engine/format';
import { lastPerformance } from '@/engine/history';
import { personalRecords } from '@/engine/records';
import { nextSet } from '@/engine/session';
import { useHaptics } from '@/hooks/useHaptics';
import { useActiveSession, useExerciseNotes } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * EXERCISE SCREEN — the screen the whole product exists for.
 *
 * It answers, top to bottom: what am I doing, what did I do last time, what is
 * my record, what is this set, and one button to save it. Weight and reps are
 * the largest things on the display because they are read at arm's length,
 * between sets, one-handed.
 */
export default function ExerciseWorkoutPage() {
  return (
    <Suspense fallback={<Screen />}>
      <ExerciseWorkout />
    </Suspense>
  );
}

function ExerciseWorkout() {
  const router = useRouter();
  const params = useSearchParams();
  const entryId = params.get('id');

  const session = useActiveSession();
  const sessions = useStore((s) => s.sessions);
  const settings = useStore((s) => s.settings);
  const completeSet = useStore((s) => s.completeSet);
  const uncompleteSet = useStore((s) => s.uncompleteSet);
  const addSet = useStore((s) => s.addSet);
  const removeSet = useStore((s) => s.removeSet);
  const skipExercise = useStore((s) => s.skipExercise);
  const setExerciseNote = useStore((s) => s.setExerciseNote);
  const toggleObservation = useStore((s) => s.toggleObservation);
  const startRest = useStore((s) => s.startRest);
  const haptics = useHaptics();

  const index = session?.exercises.findIndex((e) => e.id === entryId) ?? -1;
  const entry = index >= 0 ? session!.exercises[index] : null;

  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [details, setDetails] = useState<DetailTab | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [editValue, setEditValue] = useState<'weight' | 'reps' | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // The target set is whichever one is next, unless the user picked another.
  const targetSet: SessionSet | null = useMemo(() => {
    if (!entry) return null;
    if (selectedSetId) return entry.sets.find((s) => s.id === selectedSetId) ?? null;
    return nextSet(entry);
  }, [entry, selectedSetId]);

  // Seed the steppers from the plan, or from what was already recorded.
  useEffect(() => {
    if (!targetSet) return;
    const source = targetSet.actual ?? targetSet.plan;
    const planWeight = 'weight' in source ? source.weight : null;
    const planReps =
      targetSet.actual?.reps ?? targetSet.plan.repsMax ?? targetSet.plan.repsMin ?? 10;
    setWeight(planWeight ?? 0);
    setReps(planReps);
    setDifficulty(targetSet.actual?.difficulty ?? null);
  }, [targetSet]);

  const history = useMemo(
    () => (entry ? lastPerformance(sessions, entry.exerciseId, session?.id) : null),
    [sessions, entry, session?.id],
  );
  const records = useMemo(
    () =>
      entry
        ? personalRecords(
            sessions.filter((s) => s.status === 'completed'),
            entry.exerciseId,
            entry.name,
          )
        : null,
    [sessions, entry],
  );
  const notes = useExerciseNotes(entry?.exerciseId);

  if (!session || !entry) {
    return (
      <Screen>
        <Card className="mt-10 p-6 text-center">
          <p className="text-[15px] font-semibold">Упражнение не найдено</p>
          <Button variant="primary" size="lg" full className="mt-5" onClick={() => router.replace('/workout')}>
            К ТРЕНИРОВКЕ
          </Button>
        </Card>
      </Screen>
    );
  }

  const total = session.exercises.length;
  const previous = index > 0 ? session.exercises[index - 1] : null;
  const following = index < total - 1 ? session.exercises[index + 1] : null;
  const doneCount = entry.sets.filter((s) => s.actual).length;
  const allDone = doneCount === entry.sets.length;

  const save = () => {
    if (!targetSet) return;
    completeSet(entry.id, targetSet.id, { weight, reps, difficulty });
    haptics('light');
    setSelectedSetId(null);

    if (settings.restTimerAutoStart) {
      const remaining = entry.sets.filter((s) => s.id !== targetSet.id && !s.actual).length;
      // No rest after the final set: the user is moving on, not resting.
      if (remaining > 0) {
        startRest(entry.restSeconds || settings.defaultRestSeconds, {
          sessionId: session.id,
          exerciseId: entry.id,
          setNumber: targetSet.setNumber,
        });
      }
    }
  };

  const commitEdit = () => {
    const parsed = parseFloat(editDraft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      if (editValue === 'weight') setWeight(Math.round(parsed * 100) / 100);
      if (editValue === 'reps') setReps(Math.max(0, Math.round(parsed)));
    }
    setEditValue(null);
  };

  return (
    <>
      <header
        className="sticky top-0 z-20 border-b border-line bg-bg/92 px-4 backdrop-blur-xl"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3 py-3">
          <Link
            href="/workout"
            aria-label="К списку упражнений"
            className="touch -ml-2 flex items-center justify-center rounded-full text-dim active:bg-surface2"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="m13 5-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="eyebrow">
              Exercise {index + 1} / {total}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDetails('technique')}
            className="touch -mr-2 flex items-center justify-center rounded-full text-[11px] font-semibold tracking-[0.08em] text-dim uppercase active:bg-surface2"
          >
            Инфо
          </button>
        </div>
      </header>

      <Screen padBottom={false} className="pt-4">
        <div className="mb-4">
          <h1 className="text-[25px] leading-[1.12] font-semibold tracking-tight">{entry.name}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-dim">
            <span className="uppercase">{MUSCLE_LABEL[entry.primaryMuscle]}</span>
            {entry.section ? (
              <>
                <span className="text-faint">·</span>
                <span>{entry.section}</span>
              </>
            ) : null}
            <span className="text-faint">·</span>
            <span className="tnum">
              {doneCount}/{entry.sets.length} sets
            </span>
          </div>
        </div>

        {notes.pinned.length ? (
          <div className="mb-4 flex flex-col gap-2">
            {notes.pinned.map((note) => (
              <Notice key={note.id} tone="warn" title="⚠️ Важно">
                {note.content}
              </Notice>
            ))}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setDetails('history')}
            className="flex flex-col items-start rounded-[var(--radius-tile)] border border-line bg-surface p-3.5 text-left active:bg-surface2"
          >
            <Eyebrow>Last time</Eyebrow>
            {history ? (
              <>
                <ul className="tnum mt-1.5 flex flex-col gap-0.5">
                  {history.entry.sets
                    .filter((s) => s.actual)
                    .slice(0, 5)
                    .map((s) => (
                      <li key={s.id} className="text-[14px]">
                        {formatWeight(s.actual!.weight)} × {s.actual!.reps}
                      </li>
                    ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-faint">{formatDateShort(history.date)}</p>
              </>
            ) : (
              <p className="mt-1.5 text-[13px] text-dim">Первый раз</p>
            )}
          </button>

          <button
            type="button"
            onClick={() => setDetails('progression')}
            className="flex flex-col items-start rounded-[var(--radius-tile)] border border-line bg-surface p-3.5 text-left active:bg-surface2"
          >
            <Eyebrow>Personal best</Eyebrow>
            {records?.maxWeight ? (
              <>
                <p className="tnum mt-1.5 text-[22px] leading-none font-semibold text-accent">
                  {formatWeight(records.maxWeight.value)}
                  <span className="ml-1 text-[12px] font-medium text-dim">kg</span>
                </p>
                <p className="tnum mt-1 text-[13px] text-dim">× {records.maxWeight.reps}</p>
                <p className="mt-1.5 text-[11px] text-faint">
                  {formatDateShort(records.maxWeight.date)}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[13px] text-dim">Нет данных</p>
            )}
          </button>
        </div>

        {/* SET EXECUTION */}
        {targetSet ? (
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <Eyebrow>
                Set {targetSet.setNumber} of {entry.sets.length}
              </Eyebrow>
              {targetSet.setType !== 'normal' ? (
                <Badge color="var(--status-warning)">{targetSet.setType.replace('_', ' ')}</Badge>
              ) : null}
            </div>

            {targetSet.note ? (
              <p className="mt-1.5 text-[12.5px] text-warn">{targetSet.note}</p>
            ) : null}

            <p className="tnum mt-1 text-[12px] text-dim">
              План: {formatWeight(targetSet.plan.weight)} kg ×{' '}
              {formatRepRange(targetSet.plan.repsMin, targetSet.plan.repsMax)}
            </p>

            <div className="mt-5 flex flex-col gap-5">
              <BigStepper
                label="Weight"
                unit="kg"
                value={weight}
                step={settings.weightStep}
                onChange={setWeight}
                onEdit={() => {
                  setEditValue('weight');
                  setEditDraft(String(weight));
                }}
              />
              <BigStepper
                label="Reps"
                unit="reps"
                value={reps}
                step={1}
                onChange={setReps}
                onEdit={() => {
                  setEditValue('reps');
                  setEditDraft(String(reps));
                }}
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {[1, 2.5, 5].map((step) => (
                <Chip
                  key={step}
                  selected={settings.weightStep === step}
                  onClick={() => useStore.getState().updateSettings({ weightStep: step })}
                >
                  ± {step} кг
                </Chip>
              ))}
            </div>

            <div className="mt-5">
              <Eyebrow className="mb-2 text-center">Насколько тяжело</Eyebrow>
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            </div>

            <Button variant="primary" size="xl" full className="mt-5" onClick={save}>
              {targetSet.actual ? 'ОБНОВИТЬ ПОДХОД ✓' : 'COMPLETE SET ✓'}
            </Button>
          </Card>
        ) : (
          <Card className="p-5 text-center">
            <p className="text-[15px] font-semibold text-accent">Все подходы выполнены</p>
            <p className="mt-1.5 text-[13px] text-dim">
              Добавьте ещё один подход или переходите к следующему упражнению.
            </p>
            <Button size="md" full className="mt-4" onClick={() => addSet(entry.id)}>
              + ДОБАВИТЬ ПОДХОД
            </Button>
          </Card>
        )}

        {/* Set list */}
        <section className="mt-5">
          <div className="flex items-center justify-between px-1">
            <Eyebrow>Подходы</Eyebrow>
            <button
              type="button"
              onClick={() => addSet(entry.id)}
              className="text-[11px] font-semibold tracking-[0.08em] text-dim uppercase active:text-ink"
            >
              + подход
            </button>
          </div>

          <ul className="mt-2 flex flex-col gap-1.5">
            {entry.sets.map((set) => (
              <li key={set.id} className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <SetRow
                    set={set}
                    active={set.id === targetSet?.id}
                    onSelect={() => setSelectedSetId(set.id)}
                    onUndo={() => uncompleteSet(entry.id, set.id)}
                  />
                </div>
                {entry.sets.length > 1 && !set.actual ? (
                  <button
                    type="button"
                    onClick={() => removeSet(entry.id, set.id)}
                    aria-label={`Удалить подход ${set.setNumber}`}
                    className="touch flex shrink-0 items-center justify-center rounded-xl text-faint active:text-pain"
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* Observations */}
        <section className="mt-6">
          <Eyebrow className="px-1">Быстрая отметка</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(OBSERVATION_LABEL) as ObservationTag[]).map((tag) => (
              <Chip
                key={tag}
                selected={entry.observations.includes(tag)}
                onClick={() => {
                  toggleObservation(entry.id, tag);
                  haptics('light');
                }}
                tone={tag === 'pain' ? 'var(--status-pain)' : undefined}
              >
                {OBSERVATION_LABEL[tag]}
              </Chip>
            ))}
          </div>
        </section>

        <div className="mt-5 flex flex-col gap-2">
          <Button size="md" full onClick={() => setShowNote(true)}>
            {entry.note ? 'ЗАМЕТКА К УПРАЖНЕНИЮ ✓' : 'ЗАМЕТКА К УПРАЖНЕНИЮ'}
          </Button>
          <Button size="md" full variant="ghost" onClick={() => skipExercise(entry.id)}>
            {entry.status === 'skipped' ? 'ВЕРНУТЬ В ТРЕНИРОВКУ' : 'ПРОПУСТИТЬ УПРАЖНЕНИЕ'}
          </Button>
        </div>

        {/* Prev / next */}
        <div
          className="mt-6 flex gap-2"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
        >
          {previous ? (
            <Button
              size="lg"
              className="flex-1"
              onClick={() => router.replace(`/workout/exercise?id=${previous.id}`)}
            >
              ← НАЗАД
            </Button>
          ) : null}
          {following ? (
            <Button
              size="lg"
              variant={allDone ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => router.replace(`/workout/exercise?id=${following.id}`)}
            >
              ДАЛЕЕ →
            </Button>
          ) : (
            <Button
              size="lg"
              variant={allDone ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => router.replace('/workout')}
            >
              К ТРЕНИРОВКЕ
            </Button>
          )}
        </div>
      </Screen>

      <ExerciseDetailsSheet
        open={details !== null}
        onClose={() => setDetails(null)}
        exerciseId={entry.exerciseId}
        initialTab={details ?? 'technique'}
        instructions={entry.instructions}
      />

      <Sheet
        open={showNote}
        onClose={() => setShowNote(false)}
        title="Заметка к упражнению"
        subtitle="Только для этой тренировки"
      >
        <TextArea
          value={entry.note ?? ''}
          onChange={(e) => setExerciseNote(entry.id, e.target.value)}
          placeholder="Например: сиденье на 2 отверстия ниже."
          className="min-h-28"
        />
      </Sheet>

      <Sheet
        open={editValue !== null}
        onClose={commitEdit}
        title={editValue === 'weight' ? 'Точный вес' : 'Точные повторения'}
      >
        <TextInput
          autoFocus
          type="number"
          inputMode="decimal"
          step={editValue === 'weight' ? '0.5' : '1'}
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          className={cx('tnum text-center text-[28px]')}
        />
        <Button variant="primary" size="lg" full className="mt-3" onClick={commitEdit}>
          ГОТОВО
        </Button>
      </Sheet>
    </>
  );
}
