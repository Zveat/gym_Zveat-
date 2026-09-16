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
import type { Difficulty, ObservationTag, SessionExercise, SessionSet } from '@/domain/types';
import { formatRepRange, formatWeight, MUSCLE_LABEL } from '@/engine/format';
import { lastPerformance } from '@/engine/history';
import { personalRecords } from '@/engine/records';
import { nextSet, suggestedInput } from '@/engine/session';
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
/**
 * Готовые дельты веса (§8). Держим обе стороны: в зале снять вес приходится так
 * же часто, как добавить, а многократные нажатия ± между подходами — это ровно
 * то время, которое ТЗ и просит убрать.
 */
const WEIGHT_DELTAS = [-2.5, -1, 1, 2.5, 5] as const;
const REP_DELTAS = [-1, 1, 2, 5] as const;

/** Прошлый раз одной строкой: «50 × 12 × 4» вместо списка из пяти подходов. */
function lastSummary(history: { entry: SessionExercise }): string {
  const done = history.entry.sets.filter((s) => s.actual);
  if (!done.length) return '—';
  const first = done[0].actual!;
  const same = done.every(
    (s) => s.actual!.weight === first.weight && s.actual!.reps === first.reps,
  );
  // Одинаковые подходы сворачиваются в «вес × повт × количество»; разные
  // показываем диапазоном, иначе строка врёт.
  if (same) return `${formatWeight(first.weight)} × ${first.reps} × ${done.length}`;
  const weights = done.map((s) => s.actual!.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = min === max ? formatWeight(min) : `${formatWeight(min)}–${formatWeight(max)}`;
  return `${range} × ${done.length} подх.`;
}

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
  const updateSettings = useStore((s) => s.updateSettings);
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
  /**
   * §12: подтверждение прямо на кнопке. Подход сохраняется мгновенно, но без
   * ответа на том же месте, куда смотрел палец, остаётся сомнение «нажалось
   * ли» — а следующий подход уже подставлен, и экран выглядит почти так же.
   */
  const [justSaved, setJustSaved] = useState(false);
  const [editDraft, setEditDraft] = useState('');

  // The target set is whichever one is next, unless the user picked another.
  const targetSet: SessionSet | null = useMemo(() => {
    if (!entry) return null;
    if (selectedSetId) return entry.sets.find((s) => s.id === selectedSetId) ?? null;
    return nextSet(entry);
  }, [entry, selectedSetId]);

  /**
   * Подставляем то, что человек ФАКТИЧЕСКИ сделал в предыдущем подходе, а не
   * план. План возвращал вес к запланированному на каждом подходе, поэтому
   * поставленные 72.5 кг приходилось выставлять заново четыре раза за
   * упражнение. Правила переноса — в `suggestedInput`.
   */
  useEffect(() => {
    if (!entry || !targetSet) return;
    const suggestion = suggestedInput(entry, targetSet);
    setWeight(suggestion.weight ?? 0);
    setReps(suggestion.reps);
    setDifficulty(targetSet.actual?.difficulty ?? null);
  }, [entry, targetSet]);

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
    setJustSaved(true);

    const remaining = entry.sets.filter((s) => s.id !== targetSet.id && !s.actual).length;

    if (settings.restTimerAutoStart && remaining > 0) {
      // No rest after the final set: the user is moving on, not resting.
      startRest(entry.restSeconds || settings.defaultRestSeconds, {
        sessionId: session.id,
        exerciseId: entry.id,
        setNumber: targetSet.setNumber,
      });
    }

    /**
     * §37: последний подход закрыт — открываем следующее упражнение само.
     *
     * Через короткую задержку, а не мгновенно: подтверждение «ПОДХОД СОХРАНЁН»
     * должно успеть появиться там, куда смотрел палец, иначе экран просто
     * подменяется и остаётся сомнение, записалось ли. И только если следующее
     * упражнение есть и оно не выполнено — иначе это прыжок непонятно куда.
     */
    if (remaining === 0 && settings.autoAdvanceExercise) {
      const next = session.exercises
        .slice(index + 1)
        .find((e) => e.status !== 'done' && e.status !== 'skipped');
      if (next) {
        haptics('notify');
        window.setTimeout(() => {
          router.replace(`/workout/exercise?id=${next.id}`);
        }, 900);
      }
    }
  };

  /**
   * Дельта веса заодно запоминается как шаг ± (§8): «обычно я добавляю 2.5»
   * настраивается само, без похода в настройки.
   */
  const applyWeightDelta = (delta: number) => {
    setWeight(Math.max(0, Math.round((weight + delta) * 100) / 100));
    const magnitude = Math.abs(delta);
    if (settings.weightStep !== magnitude) updateSettings({ weightStep: magnitude });
    haptics('light');
  };

  /** §19: поставить то, что было в прошлую тренировку, одним тапом. */
  const repeatLast = () => {
    const done = history?.entry.sets.filter((s) => s.actual) ?? [];
    const source = done[done.length - 1]?.actual;
    if (!source) return;
    setWeight(source.weight);
    setReps(source.reps);
    haptics('light');
  };

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 900);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

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
              Упражнение {index + 1} / {total}
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
        {/*
          КОМПАКТНО НАМЕРЕННО. Экран был 1458pt при окне 852pt: чтобы поставить
          вес, увидеть повторения и сохранить, приходилось прокручивать. В зале
          это главный недостаток, поэтому цикл «вес → повторения → сохранить»
          укладывается в один экран, а история, рекорд и список подходов ушли в
          одну строку и под сгиб — они нужны глазом, а не пальцем.
        */}
        <div className="mb-3">
          <h1 className="text-[21px] leading-[1.15] font-semibold tracking-tight">{entry.name}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-dim">
            <span className="uppercase">{MUSCLE_LABEL[entry.primaryMuscle]}</span>
            <span className="text-faint">·</span>
            {/*
              Полоска подходов вместо строки текста: «✓✓○○» считывается за
              взгляд, «Подход 3 из 4» приходится читать.
            */}
            <span className="flex items-center gap-1" aria-label={`Выполнено ${doneCount} из ${entry.sets.length}`}>
              {entry.sets.map((set) => (
                <span
                  key={set.id}
                  className={cx(
                    'h-2 w-2 rounded-full',
                    set.actual
                      ? 'bg-accent'
                      : set.id === targetSet?.id
                        ? 'bg-ink'
                        : 'bg-surface3',
                  )}
                />
              ))}
            </span>
            <span className="tnum">
              {doneCount}/{entry.sets.length}
            </span>
          </div>
        </div>

        {notes.pinned.length ? (
          <div className="mb-3 flex flex-col gap-2">
            {notes.pinned.map((note) => (
              <Notice key={note.id} tone="warn" title="⚠️ Важно">
                {note.content}
              </Notice>
            ))}
          </div>
        ) : null}

        {/* Контекст одной строкой: прошлый раз и рекорд, тап — подробности. */}
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setDetails('history')}
            className="flex-1 rounded-[var(--radius-tile)] border border-line bg-surface px-3 py-2.5 text-left active:bg-surface2"
          >
            <span className="block text-[10.5px] font-semibold tracking-[0.12em] text-dim uppercase">
              Прошлый раз
            </span>
            <span className="tnum mt-0.5 block text-[14px] font-medium">
              {history ? lastSummary(history) : 'Первый раз'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDetails('progression')}
            className="w-[104px] shrink-0 rounded-[var(--radius-tile)] border border-line bg-surface px-3 py-2.5 text-left active:bg-surface2"
          >
            <span className="block text-[10.5px] font-semibold tracking-[0.12em] text-dim uppercase">
              Рекорд
            </span>
            <span className="tnum mt-0.5 block text-[14px] font-medium text-accent">
              {records?.maxWeight
                ? `${formatWeight(records.maxWeight.value)} × ${records.maxWeight.reps}`
                : '—'}
            </span>
          </button>
        </div>

        {/* SET EXECUTION */}
        {targetSet ? (
          <Card className="p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="tnum text-[12px] text-dim">
                Подход {targetSet.setNumber} · план {formatWeight(targetSet.plan.weight)} кг ×{' '}
                {formatRepRange(targetSet.plan.repsMin, targetSet.plan.repsMax)}
              </p>
              {targetSet.setType !== 'normal' ? (
                <Badge color="var(--status-warning)">{targetSet.setType.replace('_', ' ')}</Badge>
              ) : null}
            </div>

            {targetSet.note ? (
              <p className="mt-1 text-[12.5px] text-warn">{targetSet.note}</p>
            ) : null}

            <div className="mt-3 flex flex-col gap-3">
              <BigStepper
                label="Вес"
                unit="кг"
                value={weight}
                step={settings.weightStep}
                onChange={setWeight}
                onEdit={() => {
                  setEditValue('weight');
                  setEditDraft(String(weight));
                }}
              />

              {/*
                §8: готовые дельты вместо многократных нажатий ±. Нажатая дельта
                заодно запоминается как шаг ±, поэтому «обычно я добавляю 2.5»
                настраивается само, без похода в настройки.
              */}
              <div className="flex justify-center gap-1.5">
                {WEIGHT_DELTAS.map((delta) => (
                  <Chip
                    key={delta}
                    selected={settings.weightStep === Math.abs(delta)}
                    onClick={() => applyWeightDelta(delta)}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Chip>
                ))}
              </div>

              <BigStepper
                label="Повторения"
                unit="повт."
                value={reps}
                step={1}
                onChange={setReps}
                onEdit={() => {
                  setEditValue('reps');
                  setEditDraft(String(reps));
                }}
              />

              <div className="flex justify-center gap-1.5">
                {REP_DELTAS.map((delta) => (
                  <Chip key={delta} onClick={() => setReps(Math.max(0, reps + delta))}>
                    {delta > 0 ? `+${delta}` : delta}
                  </Chip>
                ))}
                {history ? (
                  <Chip onClick={repeatLast}>ПОВТОРИТЬ</Chip>
                ) : null}
              </div>
            </div>

            {/*
              §13: оценка не должна конкурировать с весом и повторениями — это
              третий уровень, поэтому ниже и мельче.
            */}
            <div className="mt-3.5">
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            </div>
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

        {/*
          Запас под закреплённой кнопкой, чтобы она ничего не накрывала в самом
          низу прокрутки.
        */}
        {targetSet ? <div className="h-[92px]" aria-hidden="true" /> : null}
      </Screen>

      {/*
        ГЛАВНОЕ ДЕЙСТВИЕ ЗАКРЕПЛЕНО СНИЗУ.
        Экран упражнения — 1458pt при окне 852pt, то есть прокручивается почти
        на два экрана. Кнопка стояла в потоке и уезжала вверх вместе с
        содержимым: чтобы записать подход, надо было сначала найти кнопку. В
        зале это главный тап, он обязан быть под большим пальцем всегда.
      */}
      {targetSet ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 px-4 pt-3 backdrop-blur-xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <div className="mx-auto w-full max-w-lg">
            <Button variant="primary" size="xl" full onClick={save}>
              {justSaved
                ? 'ПОДХОД СОХРАНЁН ✓'
                : targetSet.actual
                  ? 'ОБНОВИТЬ ПОДХОД ✓'
                  : 'СОХРАНИТЬ ПОДХОД ✓'}
            </Button>
          </div>
        </div>
      ) : null}

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
