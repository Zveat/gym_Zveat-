'use client';

import { useEffect, useRef } from 'react';
import { Button, Chip, cx } from '@/components/ui/primitives';
import { formatClock } from '@/engine/format';
import { useHaptics } from '@/hooks/useHaptics';
import { useTicker } from '@/hooks/useTicker';
import { useStore } from '@/store/useStore';

/**
 * Rest countdown. Appears by itself after a set, so between sets the phone
 * shows one number the user can read from arm's length.
 *
 * The end time is stored, not a countdown — locking the phone or switching
 * apps cannot desynchronise it, and reloading mid-rest resumes correctly.
 */
/** Готовые длительности отдыха из §5. */
const REST_PRESETS = [60, 90, 120, 180] as const;

export function RestTimerOverlay() {
  const rest = useStore((s) => s.rest);
  const extendRest = useStore((s) => s.extendRest);
  const setRestDuration = useStore((s) => s.setRestDuration);
  const clearRest = useStore((s) => s.clearRest);
  const now = useTicker(rest !== null);
  const haptics = useHaptics();
  const firedFor = useRef<number | null>(null);

  const remainingMs = rest ? rest.endsAt - now : 0;
  const done = rest !== null && remainingMs <= 0;

  useEffect(() => {
    if (!rest || !done) return;
    if (firedFor.current === rest.endsAt) return;
    firedFor.current = rest.endsAt;
    haptics('notify');
  }, [done, rest, haptics]);

  if (!rest) return null;

  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const elapsed = rest.totalSeconds - remaining;
  const ratio = rest.totalSeconds > 0 ? Math.min(1, elapsed / rest.totalSeconds) : 1;
  const circumference = 2 * Math.PI * 86;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg/95 px-6 backdrop-blur-md">
      <p className={cx('eyebrow', done && 'text-accent')}>{done ? 'Готов' : 'Отдых'}</p>

      <div className="relative mt-6 flex h-[220px] w-[220px] items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="86" fill="none" stroke="var(--color-surface3)" strokeWidth="7" />
          <circle
            cx="100"
            cy="100"
            r="86"
            fill="none"
            stroke={done ? 'var(--color-accent)' : 'var(--color-progress)'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 0.9s linear' }}
          />
        </svg>
        <span
          className={cx(
            'tnum text-[54px] leading-none font-semibold tracking-[-0.04em]',
            done && 'text-accent',
          )}
        >
          {formatClock(remaining)}
        </span>
      </div>

      <p className="mt-6 text-center text-[14px] leading-relaxed text-dim">
        {done ? (
          <span className="font-semibold text-ink">МОЖНО НАЧИНАТЬ</span>
        ) : (
          <>Подход {rest.setNumber} сохранён</>
        )}
      </p>

      <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5">
        {done ? (
          <Button size="lg" variant="primary" full onClick={clearRest}>
            НАЧАТЬ ПОДХОД
          </Button>
        ) : (
          <>
            {/*
              §5: готовые значения. Тап ставит длительность заново от этого
              момента — нажал «90», значит хочет отдыхать девяносто секунд.
            */}
            <div className="flex justify-center gap-1.5">
              {REST_PRESETS.map((seconds) => (
                <Chip
                  key={seconds}
                  selected={rest.totalSeconds === seconds}
                  onClick={() => setRestDuration(seconds)}
                >
                  {seconds} с
                </Chip>
              ))}
            </div>

            <div className="flex gap-2.5">
              <Button size="lg" variant="secondary" className="flex-1" onClick={() => extendRest(-15)}>
                −15 СЕК
              </Button>
              <Button size="lg" variant="secondary" className="flex-1" onClick={() => extendRest(15)}>
                +15 СЕК
              </Button>
            </div>
            <Button size="lg" variant="ghost" full onClick={clearRest}>
              ПРОПУСТИТЬ
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
