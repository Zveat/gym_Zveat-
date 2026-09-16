'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { BigStepper } from '@/components/ui/inputs';
import { Button, Card, CheckIcon, ProgressBar, cx } from '@/components/ui/primitives';
import { formatCardio, formatClock } from '@/engine/format';
import { cardioRemainingSeconds } from '@/engine/session';
import { useHaptics } from '@/hooks/useHaptics';
import { useTicker } from '@/hooks/useTicker';
import type { SessionCardio } from '@/domain/types';

/**
 * РАЗМИНКА И ЗАМИНКА на экране тренировки.
 *
 * Это кардио, а не подходы: меряются минуты и подъём дорожки, поэтому своя
 * карточка, а не строка в списке упражнений.
 *
 * Два разных действия, и путать их нельзя: «НАЧАТЬ» запускает отсчёт десяти
 * минут на дорожке, «ГОТОВО» отмечает факт. Сначала была только вторая
 * кнопка — то есть приложение спрашивало «сделал?», но не помогало сделать.
 * Если таймер запускался, в историю идёт РЕАЛЬНОЕ время: сойти на седьмой
 * минуте и записать десять значит испортить себе же историю.
 */
export function CardioCard({
  slot,
  block,
  onStart,
  onStop,
  onDone,
  onUndo,
}: {
  slot: 'warmup' | 'cooldown';
  block: SessionCardio;
  onStart: () => void;
  onStop: () => void;
  onDone: (input?: { minutes?: number; incline?: number | null }) => void;
  onUndo: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const done = block.actual !== null;
  const running = Boolean(block.endsAt) && !done;
  const title = slot === 'warmup' ? 'РАЗМИНКА' : 'ЗАМИНКА';

  // Тикаем только пока идёт отсчёт: отмеченная карточка не должна стоить ни
  // одной перерисовки в секунду.
  const now = useTicker(running);
  const left = running ? (cardioRemainingSeconds(block, now) ?? 0) : null;
  const total = Math.max(1, block.plan.minutes) * 60;

  const haptics = useHaptics();
  const finished = useRef(false);

  useEffect(() => {
    if (!running) {
      finished.current = false;
      return;
    }
    if (left !== null && left <= 0 && !finished.current) {
      // Один раз: тикер продолжает идти, а отметка уже поставлена.
      finished.current = true;
      haptics('notify');
      onDone({ minutes: block.plan.minutes });
    }
  }, [running, left, block.plan.minutes, haptics, onDone]);

  return (
    <>
      <Card className={cx('p-3.5', done && 'opacity-80', running && 'border-accent/40')}>
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
            {running ? (
              <p className="tnum text-[26px] leading-tight font-semibold tracking-tight">
                {formatClock(left ?? 0)}
              </p>
            ) : (
              <p className="tnum truncate text-[15px] leading-tight font-semibold">
                {formatCardio(block.actual ?? block.plan)}
              </p>
            )}
            {!running && block.plan.note ? (
              <p className="truncate text-[12px] text-dim">{block.plan.note}</p>
            ) : null}
          </div>

          {/* Одну кнопку оставляем в строке: она влезает и не давит текст. */}
          {done ? (
            <Button size="sm" variant="ghost" onClick={onUndo}>
              ОТМЕНИТЬ
            </Button>
          ) : null}
        </div>

        {running ? <ProgressBar value={1 - (left ?? 0) / total} className="mt-2.5" /> : null}

        {/*
          Кнопки отдельной строкой, а не рядом с текстом.
          Втроём в одной строке они сжимали колонку с названием и временем до
          НУЛЕВОЙ ширины: на телефоне подписи «РАЗМИНКА» и отсчёта просто не
          было видно, при том что по горизонтали ничего не уезжало и проверка
          на переполнение молчала. Заодно кнопки стали шире — тапать в зале
          одной рукой проще.
        */}
        {!done ? (
          <div className="mt-3 flex gap-2">
            {running ? (
              <>
                <Button size="md" variant="ghost" className="flex-1" onClick={onStop}>
                  СБРОС
                </Button>
                <Button size="md" variant="primary" className="flex-[2]" onClick={() => onDone()}>
                  ГОТОВО
                </Button>
              </>
            ) : (
              <>
                <Button size="md" variant="ghost" onClick={() => setShowEdit(true)}>
                  ИЗМЕНИТЬ
                </Button>
                <Button size="md" className="flex-1" onClick={() => onDone()}>
                  ГОТОВО
                </Button>
                <Button size="md" variant="primary" className="flex-1" onClick={onStart}>
                  НАЧАТЬ
                </Button>
              </>
            )}
          </div>
        ) : null}
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
