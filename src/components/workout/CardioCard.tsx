'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { BigStepper } from '@/components/ui/inputs';
import { Button, Card, CheckIcon, cx } from '@/components/ui/primitives';
import { formatCardio } from '@/engine/format';
import type { SessionCardio } from '@/domain/types';

/**
 * РАЗМИНКА И ЗАМИНКА на экране тренировки.
 *
 * Это кардио, а не подходы: меряются минуты и подъём дорожки, поэтому своя
 * карточка, а не строка в списке упражнений. Главная метрика та же, что у
 * подхода — один тап: «ГОТОВО» пишет ровно то, что в плане. Правка минут и
 * подъёма спрятана за «изменить», потому что обычный случай — сделал как
 * всегда, а не пересчитал.
 */
export function CardioCard({
  slot,
  block,
  onDone,
  onUndo,
}: {
  slot: 'warmup' | 'cooldown';
  block: SessionCardio;
  onDone: (input?: { minutes?: number; incline?: number | null }) => void;
  onUndo: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const done = block.actual !== null;
  const title = slot === 'warmup' ? 'РАЗМИНКА' : 'ЗАМИНКА';

  return (
    <>
      <Card className={cx('p-3.5', done && 'opacity-80')}>
        <div className="flex items-center gap-3">
          <div
            className={cx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold',
              done ? 'bg-accent text-accent-ink' : 'bg-surface3 text-dim',
            )}
            aria-hidden="true"
          >
            {done ? <CheckIcon className="h-4 w-4" /> : slot === 'warmup' ? '↑' : '↓'}
          </div>

          <div className="min-w-0 flex-1">
            <p className="eyebrow">{title}</p>
            <p className="tnum truncate text-[15px] leading-tight font-semibold">
              {formatCardio(block.actual ?? block.plan)}
            </p>
            {block.plan.note ? (
              <p className="truncate text-[12px] text-dim">{block.plan.note}</p>
            ) : null}
          </div>

          {done ? (
            <Button size="sm" variant="ghost" onClick={onUndo}>
              ОТМЕНИТЬ
            </Button>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setShowEdit(true)}>
                ИЗМЕНИТЬ
              </Button>
              <Button size="sm" variant="primary" onClick={() => onDone()}>
                ГОТОВО
              </Button>
            </div>
          )}
        </div>
      </Card>

      <CardioEditSheet
        open={showEdit}
        title={title}
        plan={block.plan}
        onClose={() => setShowEdit(false)}
        onSave={(input) => {
          onDone(input);
          setShowEdit(false);
        }}
      />
    </>
  );
}

function CardioEditSheet({
  open,
  title,
  plan,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  plan: { minutes: number; incline: number | null };
  onClose: () => void;
  onSave: (input: { minutes: number; incline: number | null }) => void;
}) {
  const [minutes, setMinutes] = useState(plan.minutes);
  const [incline, setIncline] = useState(plan.incline ?? 0);

  // Шит остаётся смонтированным между открытиями, поэтому начальные значения
  // надо перечитывать на открытие: `useState(plan.minutes)` сработает один раз.
  useEffect(() => {
    if (open) {
      setMinutes(plan.minutes);
      setIncline(plan.incline ?? 0);
    }
  }, [open, plan.minutes, plan.incline]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-5">
        <BigStepper label="Минуты" value={minutes} unit="мин" step={1} min={1} max={120} onChange={setMinutes} />
        <BigStepper label="Подъём" value={incline} unit="%" step={1} min={0} max={20} onChange={setIncline} />
      </div>
      <Button
        variant="primary"
        size="xl"
        full
        className="mt-5"
        onClick={() => onSave({ minutes, incline })}
      >
        ОТМЕТИТЬ ВЫПОЛНЕННЫМ
      </Button>
      <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
        Записывается только в эту тренировку. План в программе остаётся прежним.
      </p>
    </Sheet>
  );
}
