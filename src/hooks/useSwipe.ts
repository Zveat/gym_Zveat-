'use client';

import { useRef, type TouchEvent } from 'react';

/**
 * Горизонтальные свайпы как ДОПОЛНИТЕЛЬНЫЙ способ перехода (§51).
 *
 * Кнопки остаются главными: жест в зале срабатывает случайно — телефон держат
 * одной рукой, палец скользит по мокрому экрану, страница прокручивается
 * вертикально. Поэтому порог высокий и проверок несколько, а не одна.
 */
export interface SwipeLimits {
  /** Минимальный сдвиг по горизонтали, px. */
  distance: number;
  /**
   * Во сколько раз горизонтальный сдвиг должен превышать вертикальный.
   * Без этого прокрутка списка подходов пальцем по диагонали листала бы
   * упражнения.
   */
  ratio: number;
  /** Дольше этого — это не жест, а «подумал и передвинул палец», мс. */
  maxDurationMs: number;
}

export const SWIPE_LIMITS: SwipeLimits = { distance: 72, ratio: 2, maxDurationMs: 700 };

export interface SwipeSample {
  x: number;
  y: number;
  t: number;
}

/**
 * Куда пролистнули, или `null` если это не свайп.
 *
 * Отдельная чистая функция: пороги — это единственное, что здесь ломается, и
 * проверять их через настоящие касания в браузере дорого и ненадёжно.
 */
export function swipeDirection(
  start: SwipeSample,
  end: SwipeSample,
  limits: SwipeLimits = SWIPE_LIMITS,
): 'left' | 'right' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const duration = end.t - start.t;

  if (duration > limits.maxDurationMs) return null;
  if (Math.abs(dx) < limits.distance) return null;
  // Строго больше: ровно вдвое — это ещё диагональ, а не горизонталь.
  if (Math.abs(dx) <= Math.abs(dy) * limits.ratio) return null;

  return dx < 0 ? 'left' : 'right';
}

/**
 * Навешивается на контейнер экрана. Мультитач игнорируется: два пальца — это
 * масштабирование, а не листание.
 */
export function useSwipe(handlers: { onLeft?: () => void; onRight?: () => void }) {
  const start = useRef<SwipeSample | null>(null);

  return {
    onTouchStart: (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        start.current = null;
        return;
      }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const direction = swipeDirection(from, {
        x: touch.clientX,
        y: touch.clientY,
        t: Date.now(),
      });
      if (direction === 'left') handlers.onLeft?.();
      if (direction === 'right') handlers.onRight?.();
    },
  };
}
