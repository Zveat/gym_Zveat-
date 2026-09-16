import { describe, expect, it } from 'vitest';

/**
 * Правила таймера отдыха как чистая арифметика: та же, что в сторе.
 *
 * Проверяется здесь, потому что в браузере это невоспроизводимо без ожидания
 * реального времени, а ломается тихо: «−15 сек» на почти истёкшем таймере
 * уводил бы endsAt в прошлое, а totalSeconds — в минус, и кольцо прогресса
 * рисовало бы отрицательную долю.
 */
const extend = (now: number, endsAt: number, totalSeconds: number, seconds: number) => ({
  endsAt: Math.max(now, Math.max(now, endsAt) + seconds * 1000),
  totalSeconds: Math.max(5, totalSeconds + seconds),
});

const setDuration = (now: number, seconds: number) => ({
  endsAt: now + seconds * 1000,
  totalSeconds: seconds,
});

const NOW = 1_000_000;

describe('продление отдыха', () => {
  it('+15 сдвигает конец на пятнадцать секунд', () => {
    const r = extend(NOW, NOW + 30_000, 90, 15);
    expect(r.endsAt).toBe(NOW + 45_000);
    expect(r.totalSeconds).toBe(105);
  });

  it('−15 укорачивает', () => {
    const r = extend(NOW, NOW + 30_000, 90, -15);
    expect(r.endsAt).toBe(NOW + 15_000);
    expect(r.totalSeconds).toBe(75);
  });

  it('−15 на почти истёкшем таймере не уводит конец в прошлое', () => {
    const r = extend(NOW, NOW + 5_000, 60, -15);
    expect(r.endsAt).toBe(NOW);
    expect(r.endsAt).toBeGreaterThanOrEqual(NOW);
  });

  it('общая длительность не становится отрицательной', () => {
    // Иначе доля elapsed/total уходит в минус и кольцо рисует чушь.
    const r = extend(NOW, NOW + 1_000, 10, -15);
    expect(r.totalSeconds).toBeGreaterThanOrEqual(5);
  });

  it('продление уже истёкшего считается от «сейчас», а не от прошлого', () => {
    const r = extend(NOW, NOW - 20_000, 60, 30);
    expect(r.endsAt).toBe(NOW + 30_000);
  });
});

describe('готовые длительности', () => {
  it('ставят отсчёт заново от этого момента', () => {
    // Нажал «90» — значит хочет девяносто секунд, а не «уже 40 прошло».
    expect(setDuration(NOW, 90)).toEqual({ endsAt: NOW + 90_000, totalSeconds: 90 });
  });

  it('работают и когда таймер уже истёк', () => {
    expect(setDuration(NOW, 120).endsAt).toBe(NOW + 120_000);
  });
});
