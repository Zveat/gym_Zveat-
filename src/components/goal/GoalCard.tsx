'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Field, TextInput } from '@/components/ui/inputs';
import { Button, Card, Eyebrow, ProgressBar, cx } from '@/components/ui/primitives';
import type { WorkoutCountGoal, WorkoutSession } from '@/domain/types';
import { count, WORDS } from '@/engine/format';
import { GOAL_VERDICT_LABEL, goalEndDate, goalStatus, goalVerdict } from '@/engine/goal';

/**
 * ЦЕЛЬ ПО ЧИСЛУ ТРЕНИРОВОК на экране.
 *
 * Цифра «сделано» не редактируется: она считается из истории. В прошлом
 * приложении здесь были «плюс» и «минус», и именно поэтому счётчик было
 * невозможно проверить — он показывал не тренировки, а число нажатий.
 * Единственное, что вводится руками, — сколько было сделано ДО приложения.
 */

const VERDICT_COLOR = {
  achieved: 'var(--color-accent)',
  ahead: 'var(--status-progress)',
  on_track: 'var(--status-progress)',
  behind: 'var(--status-warning)',
  missed: 'var(--color-dim)',
} as const;

/** Округление до десятых: «3.5 в неделю» читается, «3.4285» — нет. */
function perWeek(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function GoalCard({
  goal,
  sessions,
  now = new Date(),
  onEdit,
}: {
  goal: WorkoutCountGoal;
  sessions: WorkoutSession[];
  now?: Date;
  onEdit?: () => void;
}) {
  const status = goalStatus(goal, sessions, now);
  const verdict = goalVerdict(status);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Цель</Eyebrow>
          <p className="mt-1 text-[15px] leading-tight font-semibold">
            {count(goal.target, WORDS.workout)} за {count(goal.days, WORDS.day)}
          </p>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 text-[12px] text-dim active:text-ink"
          >
            Изменить
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="tnum text-[44px] leading-none font-semibold tracking-[-0.03em]">
          {status.done}
        </span>
        <span className="tnum text-[17px] font-medium text-dim">/ {status.target}</span>
      </div>

      <ProgressBar value={status.ratio} className="mt-3" />

      <p
        className="mt-2.5 text-[12px] font-semibold tracking-[0.1em] uppercase"
        style={{ color: VERDICT_COLOR[verdict] }}
      >
        {GOAL_VERDICT_LABEL[verdict]}
        {verdict === 'ahead' || verdict === 'behind' ? (
          <span className="tnum"> · {Math.abs(status.ahead)}</span>
        ) : null}
      </p>

      <div className="tnum mt-4 grid grid-cols-2 gap-y-3 border-t border-line pt-4 text-[13px]">
        <GoalFact
          label="День"
          value={`${Math.min(status.dayNumber, status.totalDays)} из ${status.totalDays}`}
        />
        <GoalFact
          label="Осталось"
          value={status.expired ? 'срок вышел' : count(status.daysLeft, WORDS.day)}
        />
        <GoalFact
          label="Нужно в неделю"
          value={status.achieved ? '—' : perWeek(status.perWeekNeeded)}
        />
        <GoalFact label="Текущий темп" value={perWeek(status.perWeekActual)} />
      </div>

      {/*
        Первый день с уже зачтёнными тренировками = дата начала отсчёта почти
        наверняка не та: цель перенесена из другого приложения, где её не было.
        Молча показывать «опережение 25» в таком виде нельзя.
      */}
      {status.dayNumber === 1 && goal.baseline > 0 ? (
        <p className="mt-3.5 text-[12px] leading-relaxed text-warn">
          Проверьте дату начала отсчёта — пока стоит сегодняшняя, и срок считается с неё.
        </p>
      ) : null}

      <p className="mt-3.5 text-[11.5px] leading-relaxed text-dim">
        {goal.baseline > 0 ? (
          <>
            Зачтено до приложения: {goal.baseline}. Тренировки из истории считаются с{' '}
            {goal.countFrom}.{' '}
          </>
        ) : null}
        Срок до {goalEndDate(goal)}.
      </p>
    </Card>
  );
}

function GoalFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

/** Пустое состояние: цели нет, но место под неё видно. */
export function GoalEmptyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="p-5">
      <Eyebrow>Цель</Eyebrow>
      <p className="mt-2 text-[14px] leading-relaxed text-dim">
        Например: 100 тренировок за 150 дней. Прогресс будет считаться из истории сам.
      </p>
      <Button variant="primary" size="lg" full className="mt-4" onClick={onCreate}>
        ПОСТАВИТЬ ЦЕЛЬ
      </Button>
    </Card>
  );
}

const NUMBER = /^\d{0,4}$/;

export function GoalSheet({
  open,
  goal,
  today,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean;
  goal: WorkoutCountGoal | null;
  today: string;
  onClose: () => void;
  onSave: (goal: WorkoutCountGoal) => void;
  onRemove: () => void;
}) {
  const [target, setTarget] = useState('100');
  const [days, setDays] = useState('150');
  const [startDate, setStartDate] = useState(today);
  const [baseline, setBaseline] = useState('0');
  const [countFrom, setCountFrom] = useState(today);

  // Читаем пропсы на открытие: шит остаётся смонтированным между открытиями,
  // и `useState(goal.target)` взял бы значение только один раз.
  useEffect(() => {
    if (!open) return;
    setTarget(String(goal?.target ?? 100));
    setDays(String(goal?.days ?? 150));
    setStartDate(goal?.startDate ?? today);
    setBaseline(String(goal?.baseline ?? 0));
    setCountFrom(goal?.countFrom ?? today);
  }, [open, goal, today]);

  const targetNum = Number(target);
  const daysNum = Number(days);
  const baselineNum = Number(baseline) || 0;
  const valid =
    targetNum > 0 && daysNum > 0 && Boolean(startDate) && Boolean(countFrom) && baselineNum >= 0;

  const num = (setter: (v: string) => void) => (value: string) => {
    if (NUMBER.test(value)) setter(value);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Цель по тренировкам">
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тренировок">
            <TextInput
              inputMode="numeric"
              value={target}
              onChange={(e) => num(setTarget)(e.target.value)}
            />
          </Field>
          <Field label="За дней">
            <TextInput
              inputMode="numeric"
              value={days}
              onChange={(e) => num(setDays)(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Начало отсчёта" hint="День 1 челленджа — от него считается срок.">
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>

        <Field
          label="Уже сделано до приложения"
          hint="Единственное число, которое вводится руками. Дальше всё считается из истории."
        >
          <TextInput
            inputMode="numeric"
            value={baseline}
            onChange={(e) => num(setBaseline)(e.target.value)}
          />
        </Field>

        <Field
          label="История считается с"
          hint="Тренировки раньше этой даты в зачёт не идут — они уже внутри числа выше. Если потом внесёте всю историю, поставьте «сделано до приложения» в ноль и сдвиньте дату к началу отсчёта."
        >
          <TextInput type="date" value={countFrom} onChange={(e) => setCountFrom(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          full
          disabled={!valid}
          onClick={() =>
            onSave({
              target: targetNum,
              days: daysNum,
              startDate,
              baseline: baselineNum,
              countFrom,
            })
          }
          className={cx(!valid && 'opacity-50')}
        >
          СОХРАНИТЬ
        </Button>
        {goal ? (
          <Button size="md" variant="ghost" full onClick={onRemove}>
            УБРАТЬ ЦЕЛЬ
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
